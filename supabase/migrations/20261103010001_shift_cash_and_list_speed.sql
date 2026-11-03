-- Shift cash in/out (audited), server-side running totals, faster payment list.

create table if not exists public.shift_cash_movements (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id),
  depot_id uuid not null references public.depots(id),
  direction text not null check (direction in ('in', 'out')),
  amount_cfa numeric(14,2) not null check (amount_cfa > 0),
  note text not null check (length(btrim(note)) > 0),
  recorded_by uuid not null references public.staff(id),
  recorded_at timestamptz not null default now()
);

create index if not exists shift_cash_movements_shift_id_idx
  on public.shift_cash_movements (shift_id, recorded_at);

alter table public.shift_cash_movements enable row level security;

drop policy if exists shift_cash_movements_select_admin on public.shift_cash_movements;
create policy shift_cash_movements_select_admin
  on public.shift_cash_movements for select
  using (public.is_current_staff_admin());

drop policy if exists shift_cash_movements_select_cashier on public.shift_cash_movements;
create policy shift_cash_movements_select_cashier
  on public.shift_cash_movements for select
  using (
    public.is_current_staff_cashier()
    and depot_id = public.get_current_staff_depot_id()
  );

grant select on public.shift_cash_movements to authenticated;

comment on table public.shift_cash_movements is
  'Audited till cash in/out. Never update or delete. Expected cash = float + sales + customer payments + cash in - refunds - cash out.';

create index if not exists payments_customer_payment_recorded_at_idx
  on public.payments (recorded_at desc)
  where payment_type = 'customer_payment';

create index if not exists payments_customer_payment_live_recorded_at_idx
  on public.payments (recorded_at desc)
  where payment_type = 'customer_payment' and is_reversed = false;

-- ── record_cash_movement ─────────────────────────────────────────
create or replace function public.record_cash_movement(
  p_shift_id uuid,
  p_direction text,
  p_amount_cfa numeric,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx private.caller_ctx;
  v_shift public.shifts%rowtype;
  v_note text;
  v_id uuid;
begin
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  if p_shift_id is null then
    perform private.raise_vhm_error('SHIFT_NOT_FOUND', '{"reason":"shift_id_required"}'::jsonb);
  end if;

  if p_direction is null or p_direction not in ('in', 'out') then
    perform private.raise_vhm_error('INVALID_INPUT', '{"reason":"direction_must_be_in_or_out"}'::jsonb);
  end if;

  if p_amount_cfa is null or p_amount_cfa <= 0 then
    perform private.raise_vhm_error('INVALID_AMOUNT', '{"reason":"amount_must_be_positive"}'::jsonb);
  end if;

  v_note := btrim(coalesce(p_note, ''));
  if v_note = '' then
    perform private.raise_vhm_error('INVALID_INPUT', '{"reason":"note_required"}'::jsonb);
  end if;

  select * into v_shift
  from public.shifts
  where id = p_shift_id
  for update;

  if not found then
    perform private.raise_vhm_error('SHIFT_NOT_FOUND', jsonb_build_object('shift_id', p_shift_id));
  end if;

  if v_shift.status <> 'open' then
    perform private.raise_vhm_error('SHIFT_NOT_OPEN',
      jsonb_build_object('shift_id', p_shift_id, 'status', v_shift.status));
  end if;

  if v_ctx.role = 'cashier' then
    if v_shift.depot_id is distinct from v_ctx.depot_id then
      perform private.raise_vhm_error('INVALID_DEPOT',
        jsonb_build_object('shift_depot', v_shift.depot_id, 'caller_depot', v_ctx.depot_id));
    end if;
    if v_shift.cashier_id is distinct from v_ctx.staff_id then
      perform private.raise_vhm_error('UNAUTHORIZED', '{"reason":"cashier_own_shift_only"}'::jsonb);
    end if;
  end if;

  insert into public.shift_cash_movements (
    shift_id, depot_id, direction, amount_cfa, note, recorded_by
  ) values (
    p_shift_id, v_shift.depot_id, p_direction, round(p_amount_cfa, 2), v_note, v_ctx.staff_id
  )
  returning id into v_id;

  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'record_cash_movement',
    p_entity_type := 'shift',
    p_entity_id   := v_id,
    p_depot_id    := v_shift.depot_id,
    p_before_val  := jsonb_build_object('status', v_shift.status),
    p_after_val   := jsonb_build_object(
      'movement_id', v_id,
      'shift_id', p_shift_id,
      'direction', p_direction,
      'amount_cfa', round(p_amount_cfa, 2),
      'note', v_note
    )
  );

  return jsonb_build_object(
    'movement_id', v_id,
    'shift_id', p_shift_id,
    'direction', p_direction,
    'amount_cfa', round(p_amount_cfa, 2),
    'note', v_note
  );
exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.record_cash_movement(uuid, text, numeric, text) from public;
grant execute on function public.record_cash_movement(uuid, text, numeric, text) to authenticated;

comment on function public.record_cash_movement(uuid, text, numeric, text) is
  'SECURITY DEFINER. Record cash in or out on an open shift. Never updates or deletes prior rows.';

-- ── shift_running_totals_batch ───────────────────────────────────
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

-- ── list_customer_payments ───────────────────────────────────────
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

-- ── expected cash includes cash movements ────────────────────────
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
    and is_reversed = false;

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
    and is_reversed = false;

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
