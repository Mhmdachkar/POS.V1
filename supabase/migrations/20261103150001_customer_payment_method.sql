-- Customer debt payments can be cash, mobile, or bank.
-- Historical customer_payment rows were cash-only, so they are marked cash.
-- Sale payments stay unset. Shift expected cash counts cash (and any still-unset row) only.
-- Nothing is deleted.

alter table public.payments
  add column if not exists payment_method text;

alter table public.payments drop constraint if exists payments_payment_method_check;
alter table public.payments add constraint payments_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'mobile', 'bank'));

comment on column public.payments.payment_method is
  'customer_payment only: cash, mobile, or bank. Null on sale_payment. Only cash counts in shift expected cash.';

update public.payments
set payment_method = 'cash'
where payment_type = 'customer_payment'
  and payment_method is null;

drop function if exists public.record_payment(uuid, numeric, uuid, text);
CREATE OR REPLACE FUNCTION public.record_payment(
  p_customer_id uuid,
  p_amount_cfa numeric,
  p_shift_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_customer public.customers%ROWTYPE;
  v_payment_id uuid;
  v_new_balance numeric;
  v_depot_id uuid;
  v_receipt_number text;
  v_payable numeric;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  IF p_customer_id IS NULL THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      '{"reason": "customer_id_required"}'::jsonb);
  END IF;

  IF p_amount_cfa IS NULL OR p_amount_cfa <= 0 THEN
    PERFORM private.raise_vhm_error('INVALID_AMOUNT',
      jsonb_build_object('reason', 'amount_must_be_positive', 'value', p_amount_cfa));
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'mobile', 'bank') THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'payment_method_invalid', 'value', p_payment_method));
  END IF;

  PERFORM private.validate_shift(
    p_shift_id,
    COALESCE(
      v_ctx.depot_id,
      (SELECT depot_id FROM public.shifts WHERE id = p_shift_id)
    )
  );

  SELECT depot_id INTO v_depot_id FROM public.shifts WHERE id = p_shift_id;
  v_depot_id := COALESCE(v_depot_id, v_ctx.depot_id);
  IF v_depot_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('reason', 'depot_required_for_payment_number'));
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      jsonb_build_object('customer_id', p_customer_id));
  END IF;

  v_payable := private.customer_payable_debt_cfa(p_customer_id);
  IF p_amount_cfa > v_payable THEN
    PERFORM private.raise_vhm_error('PAYMENT_EXCEEDS_BALANCE',
      jsonb_build_object(
        'customer_id', p_customer_id,
        'amount_cfa', p_amount_cfa,
        'balance_owed_cfa', v_customer.balance_owed_cfa,
        'payable_cfa', v_payable
      ));
  END IF;

  v_receipt_number := private.allocate_customer_payment_number(v_depot_id);

  INSERT INTO public.payments (
    customer_id, sale_id, shift_id, payment_type,
    amount_cfa, recorded_by, note, receipt_number, payment_method
  ) VALUES (
    p_customer_id, NULL, p_shift_id, 'customer_payment',
    p_amount_cfa, v_ctx.staff_id, p_note, v_receipt_number, p_payment_method
  )
  RETURNING id INTO v_payment_id;

  v_new_balance := private.sync_customer_balance_owed(p_customer_id);

  PERFORM private.write_audit(
    p_actor_id := v_ctx.staff_id,
    p_action := 'record_payment',
    p_entity_type := 'payment',
    p_entity_id := v_payment_id,
    p_depot_id := v_ctx.depot_id,
    p_before_val := jsonb_build_object(
      'balance_owed_cfa', v_customer.balance_owed_cfa
    ),
    p_after_val := jsonb_build_object(
      'payment_id', v_payment_id,
      'amount_cfa', p_amount_cfa,
      'new_balance', v_new_balance,
      'customer_id', p_customer_id,
      'customer_name', v_customer.name,
      'receipt_number', v_receipt_number,
      'payment_method', p_payment_method
    )
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'customer_id', p_customer_id,
    'amount_cfa', p_amount_cfa,
    'new_balance_owed_cfa', v_new_balance,
    'receipt_number', v_receipt_number
  );
EXCEPTION
  WHEN sqlstate 'P0001' THEN RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_payment(uuid, numeric, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.record_payment(uuid, numeric, uuid, text, text) IS
  'Caps collection at displayed ledger debt. Syncs balance_owed_cfa from customer_ledger after insert.';

create or replace function public.shift_running_totals_batch(p_shift_ids uuid[])
returns table (
  shift_id uuid,
  sales_cash_cfa numeric,
  customer_pmts_cfa numeric,
  return_cash_cfa numeric,
  cash_in_cfa numeric,
  cash_out_cfa numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx private.caller_ctx;
begin
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  return query
  select
    s.id,
    coalesce((
      select sum(sa.amount_applied_cfa)
      from public.sales sa
      where sa.shift_id = s.id and sa.status <> 'voided'
    ), 0),
    coalesce((
      select sum(p.amount_cfa)
      from public.payments p
      where p.shift_id = s.id
        and p.payment_type = 'customer_payment'
        and p.is_reversed = false
        and (p.payment_method is null or p.payment_method = 'cash')
    ), 0),
    coalesce((
      select sum(r.cash_refunded_cfa)
      from public.sale_returns r
      where r.shift_id = s.id
    ), 0),
    coalesce((
      select sum(m.amount_cfa)
      from public.shift_cash_movements m
      where m.shift_id = s.id and m.direction = 'in'
    ), 0),
    coalesce((
      select sum(m.amount_cfa)
      from public.shift_cash_movements m
      where m.shift_id = s.id and m.direction = 'out'
    ), 0)
  from unnest(coalesce(p_shift_ids, array[]::uuid[])) as s(id)
  where exists (
    select 1
    from public.shifts sh
    where sh.id = s.id
      and (
        v_ctx.role = 'admin'
        or sh.depot_id is not distinct from v_ctx.depot_id
      )
  );
end;
$$;
revoke execute on function public.shift_running_totals_batch(uuid[]) from public;
grant execute on function public.shift_running_totals_batch(uuid[]) to authenticated;

create or replace function private.shift_expected_cash_cfa(p_shift_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_float numeric := 0;
  v_sales numeric := 0;
  v_pmts numeric := 0;
  v_refunds numeric := 0;
  v_in numeric := 0;
  v_out numeric := 0;
begin
  select opening_float_cfa into v_float
  from public.shifts where id = p_shift_id;
  if not found then
    return 0;
  end if;

  select coalesce(sum(amount_applied_cfa), 0) into v_sales
  from public.sales
  where shift_id = p_shift_id and status <> 'voided';

  select coalesce(sum(amount_cfa), 0) into v_pmts
  from public.payments
  where shift_id = p_shift_id
    and payment_type = 'customer_payment'
    and is_reversed = false
    and (payment_method is null or payment_method = 'cash');

  select coalesce(sum(cash_refunded_cfa), 0) into v_refunds
  from public.sale_returns
  where shift_id = p_shift_id;

  select coalesce(sum(amount_cfa) filter (where direction = 'in'), 0),
         coalesce(sum(amount_cfa) filter (where direction = 'out'), 0)
  into v_in, v_out
  from public.shift_cash_movements
  where shift_id = p_shift_id;

  return coalesce(v_float, 0) + v_sales + v_pmts + v_in - v_refunds - v_out;
end;
$$;
create or replace function public.list_customer_payments(
  p_search text default null,
  p_include_reversed boolean default false,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx private.caller_ctx;
  v_depot uuid;
  v_search text;
  v_limit integer;
  v_offset integer;
  v_count integer;
  v_rows jsonb;
begin
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  v_depot := case when v_ctx.role = 'cashier' then v_ctx.depot_id else null end;
  v_search := nullif(btrim(coalesce(p_search, '')), '');
  v_limit := greatest(1, least(coalesce(p_limit, 30), 5000));
  v_offset := greatest(0, coalesce(p_offset, 0));

  select count(*)::integer
  into v_count
  from public.payments p
  left join public.customers c on c.id = p.customer_id
  where p.payment_type = 'customer_payment'
    and (coalesce(p_include_reversed, false) or p.is_reversed = false)
    and (p_start_at is null or p.recorded_at >= p_start_at)
    and (p_end_at is null or p.recorded_at <= p_end_at)
    and (v_search is null or c.name ilike '%' || v_search || '%')
    and (
      v_depot is null
      or exists (
        select 1 from public.staff rec
        where rec.id = p.recorded_by and rec.depot_id = v_depot
      )
      or exists (
        select 1 from public.shifts sh
        where sh.id = p.shift_id and sh.depot_id = v_depot
      )
    );

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  into v_rows
  from (
    select
      p.id,
      p.customer_id,
      p.sale_id,
      p.shift_id,
      p.payment_type,
      p.amount_cfa,
      p.payment_method,
      p.recorded_by,
      p.recorded_at,
      p.note,
      p.receipt_number,
      p.is_reversed,
      p.reversed_at,
      p.reversed_by,
      p.reversed_by_return_id,
      c.name as customer_name,
      st.full_name as recorded_by_name
    from public.payments p
    left join public.customers c on c.id = p.customer_id
    left join public.staff st on st.id = p.recorded_by
    where p.payment_type = 'customer_payment'
      and (coalesce(p_include_reversed, false) or p.is_reversed = false)
      and (p_start_at is null or p.recorded_at >= p_start_at)
      and (p_end_at is null or p.recorded_at <= p_end_at)
      and (v_search is null or c.name ilike '%' || v_search || '%')
      and (
        v_depot is null
        or exists (
          select 1 from public.staff rec
          where rec.id = p.recorded_by and rec.depot_id = v_depot
        )
        or exists (
          select 1 from public.shifts sh
          where sh.id = p.shift_id and sh.depot_id = v_depot
        )
      )
    order by p.recorded_at desc
    offset v_offset
    limit v_limit
  ) t;

  return jsonb_build_object('count', v_count, 'rows', v_rows);
end;
$$;
revoke execute on function public.list_customer_payments(text, boolean, timestamptz, timestamptz, integer, integer) from public;
grant execute on function public.list_customer_payments(text, boolean, timestamptz, timestamptz, integer, integer) to authenticated;

create or replace function public.close_shift(
  p_shift_id        uuid,
  p_actual_cash_cfa numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx           private.caller_ctx;
  v_shift         public.shifts%rowtype;
  v_expected_cash numeric;
  v_discrepancy   numeric;
  v_sales_cash    numeric;
  v_customer_pmts numeric;
  v_return_cash   numeric;
  v_cash_in       numeric;
  v_cash_out      numeric;
begin
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  if p_shift_id is null then
    perform private.raise_vhm_error('SHIFT_NOT_FOUND', '{"reason":"shift_id_required"}'::jsonb);
  end if;

  if p_actual_cash_cfa is null or p_actual_cash_cfa < 0 then
    perform private.raise_vhm_error('INVALID_AMOUNT',
      '{"reason":"actual_cash_must_be_non_negative"}'::jsonb);
  end if;

  select * into v_shift
  from public.shifts
  where id = p_shift_id
  for update;

  if not found then
    perform private.raise_vhm_error('SHIFT_NOT_FOUND',
      jsonb_build_object('shift_id', p_shift_id));
  end if;

  if v_ctx.role = 'cashier' and v_shift.depot_id != v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('shift_depot', v_shift.depot_id, 'caller_depot', v_ctx.depot_id));
  end if;

  if v_shift.status != 'open' then
    perform private.raise_vhm_error('SHIFT_NOT_OPEN',
      jsonb_build_object('shift_id', p_shift_id, 'status', v_shift.status));
  end if;

  select coalesce(sum(amount_applied_cfa), 0)
  into v_sales_cash
  from public.sales
  where shift_id = p_shift_id
    and status != 'voided';

  select coalesce(sum(amount_cfa), 0)
  into v_customer_pmts
  from public.payments
  where shift_id = p_shift_id
    and payment_type = 'customer_payment'
    and is_reversed = false
    and (payment_method is null or payment_method = 'cash');

  select coalesce(sum(cash_refunded_cfa), 0)
  into v_return_cash
  from public.sale_returns
  where shift_id = p_shift_id;

  select coalesce(sum(amount_cfa) filter (where direction = 'in'), 0),
         coalesce(sum(amount_cfa) filter (where direction = 'out'), 0)
  into v_cash_in, v_cash_out
  from public.shift_cash_movements
  where shift_id = p_shift_id;

  v_expected_cash := v_shift.opening_float_cfa
                   + v_sales_cash
                   + v_customer_pmts
                   + v_cash_in
                   - v_return_cash
                   - v_cash_out;

  v_discrepancy := p_actual_cash_cfa - v_expected_cash;

  update public.shifts
  set
    status            = 'closed',
    closed_at         = now(),
    closed_by         = v_ctx.staff_id,
    expected_cash_cfa = v_expected_cash,
    actual_cash_cfa   = p_actual_cash_cfa,
    discrepancy_cfa   = v_discrepancy
  where id = p_shift_id;

  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'close_shift',
    p_entity_type := 'shift',
    p_entity_id   := p_shift_id,
    p_depot_id    := v_shift.depot_id,
    p_before_val  := jsonb_build_object('status', 'open'),
    p_after_val   := jsonb_build_object(
      'status',             'closed',
      'closed_by',          v_ctx.staff_id,
      'expected_cash_cfa',  v_expected_cash,
      'actual_cash_cfa',    p_actual_cash_cfa,
      'discrepancy_cfa',    v_discrepancy,
      'sales_cash_cfa',     v_sales_cash,
      'customer_pmts_cfa',  v_customer_pmts,
      'return_cash_cfa',    v_return_cash,
      'cash_in_cfa',        v_cash_in,
      'cash_out_cfa',       v_cash_out
    )
  );

  return jsonb_build_object(
    'shift_id',           p_shift_id,
    'expected_cash_cfa',  v_expected_cash,
    'actual_cash_cfa',    p_actual_cash_cfa,
    'discrepancy_cfa',    v_discrepancy,
    'breakdown',          jsonb_build_object(
      'opening_float_cfa',   v_shift.opening_float_cfa,
      'sales_cash_cfa',      v_sales_cash,
      'customer_pmts_cfa',   v_customer_pmts,
      'return_cash_cfa',     v_return_cash,
      'cash_in_cfa',         v_cash_in,
      'cash_out_cfa',        v_cash_out
    )
  );
exception
  when sqlstate 'P0001' then raise;
end;
$$;
