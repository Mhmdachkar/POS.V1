-- ================================================================
-- VHM POS — Migration 023: open_shift() + close_shift()
-- ================================================================
--
-- open_shift:
--   Opens a new shift for a depot. No one-open-shift constraint.
--   Cashier can only open shifts for their own depot.
--   Admin can open shifts for any depot.
--
-- close_shift:
--   Closes an open shift. Computes expected_cash_cfa server-side.
--   Shift reconciliation formula (authoritative):
--     expected_cash =
--         opening_float_cfa
--       + SUM(sales.amount_applied_cfa WHERE shift_id=? AND status != 'voided')
--       + SUM(payments.amount_cfa WHERE shift_id=? AND is_reversed=false
--              AND payment_type='customer_payment')
--       - SUM(sale_returns.cash_refunded_cfa WHERE shift_id=?)
--
--   Note: payments of type 'sale_payment' are NOT added separately here
--   because sale_payment cash is already counted via sales.amount_applied_cfa.
--   Adding both would double-count.
--
-- LOCK ORDER for close_shift:
--   shift FOR UPDATE (single lock — no product or customer locks)
-- ================================================================

-- ─── open_shift ─────────────────────────────────────────────────
create or replace function public.open_shift(
  p_depot_id          uuid,
  p_opening_float_cfa numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx      private.caller_ctx;
  v_depot    public.depots%rowtype;
  v_shift_id uuid;
  v_eff_depot uuid;
begin
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  -- ── Input validation ──────────────────────────────────────────
  if p_opening_float_cfa < 0 then
    perform private.raise_vhm_error('INVALID_AMOUNT',
      '{"reason":"opening_float_cannot_be_negative"}'::jsonb);
  end if;

  -- ── Depot isolation ───────────────────────────────────────────
  if v_ctx.role = 'cashier' then
    v_eff_depot := v_ctx.depot_id;
  else
    v_eff_depot := p_depot_id;
    if v_eff_depot is null then
      perform private.raise_vhm_error('INVALID_DEPOT',
        '{"reason":"admin_must_supply_depot_id"}'::jsonb);
    end if;
  end if;

  select * into v_depot from public.depots where id = v_eff_depot;
  if not found or not v_depot.is_active then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', v_eff_depot, 'reason', 'not_found_or_inactive'));
  end if;

  -- ── Insert shift ──────────────────────────────────────────────
  insert into public.shifts (
    depot_id, cashier_id, opening_float_cfa, status
  ) values (
    v_eff_depot, v_ctx.staff_id, p_opening_float_cfa, 'open'
  )
  returning id into v_shift_id;

  -- ── Write audit log ───────────────────────────────────────────
  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'open_shift',
    p_entity_type := 'shift',
    p_entity_id   := v_shift_id,
    p_depot_id    := v_eff_depot,
    p_before_val  := null,
    p_after_val   := jsonb_build_object(
      'shift_id',          v_shift_id,
      'opening_float_cfa', p_opening_float_cfa,
      'opened_at',         now()
    )
  );

  return jsonb_build_object(
    'shift_id',          v_shift_id,
    'depot_id',          v_eff_depot,
    'opening_float_cfa', p_opening_float_cfa,
    'opened_at',         now()
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.open_shift(uuid, numeric) from public;
grant execute on function public.open_shift(uuid, numeric) to authenticated;

comment on function public.open_shift(uuid, numeric) is
  'SECURITY DEFINER. Opens a new shift for a depot. No one-open-shift constraint.';

-- ─── close_shift ─────────────────────────────────────────────────
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
begin
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  if p_shift_id is null then
    perform private.raise_vhm_error('SHIFT_NOT_FOUND', '{"reason":"shift_id_required"}'::jsonb);
  end if;

  if p_actual_cash_cfa is null or p_actual_cash_cfa < 0 then
    perform private.raise_vhm_error('INVALID_AMOUNT',
      '{"reason":"actual_cash_must_be_non_negative"}'::jsonb);
  end if;

  -- ── Lock shift (FOR UPDATE) ───────────────────────────────────
  select * into v_shift
  from public.shifts
  where id = p_shift_id
  for update;

  if not found then
    perform private.raise_vhm_error('SHIFT_NOT_FOUND',
      jsonb_build_object('shift_id', p_shift_id));
  end if;

  -- Depot isolation
  if v_ctx.role = 'cashier' and v_shift.depot_id != v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('shift_depot', v_shift.depot_id, 'caller_depot', v_ctx.depot_id));
  end if;

  if v_shift.status != 'open' then
    perform private.raise_vhm_error('SHIFT_NOT_OPEN',
      jsonb_build_object('shift_id', p_shift_id, 'status', v_shift.status));
  end if;

  -- ── Compute expected cash (server-authoritative) ──────────────
  -- Cash received from sales (directly from sales table, not payments)
  -- Voided sales excluded via status filter.
  select coalesce(sum(amount_applied_cfa), 0)
  into v_sales_cash
  from public.sales
  where shift_id = p_shift_id
    and status != 'voided';

  -- Standalone customer debt payments collected during this shift
  -- (NOT sale_payments — those are already counted in sales.amount_applied_cfa)
  select coalesce(sum(amount_cfa), 0)
  into v_customer_pmts
  from public.payments
  where shift_id = p_shift_id
    and payment_type = 'customer_payment'
    and is_reversed = false;

  -- Cash refunded to customers during returns in this shift
  select coalesce(sum(cash_refunded_cfa), 0)
  into v_return_cash
  from public.sale_returns
  where shift_id = p_shift_id;

  v_expected_cash := v_shift.opening_float_cfa
                   + v_sales_cash
                   + v_customer_pmts
                   - v_return_cash;

  v_discrepancy := p_actual_cash_cfa - v_expected_cash;

  -- ── Close the shift ───────────────────────────────────────────
  update public.shifts
  set
    status            = 'closed',
    closed_at         = now(),
    closed_by         = v_ctx.staff_id,
    expected_cash_cfa = v_expected_cash,
    actual_cash_cfa   = p_actual_cash_cfa,
    discrepancy_cfa   = v_discrepancy
  where id = p_shift_id;

  -- ── Write audit log ───────────────────────────────────────────
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
      'return_cash_cfa',    v_return_cash
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
      'return_cash_cfa',     v_return_cash
    )
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.close_shift(uuid, numeric) from public;
grant execute on function public.close_shift(uuid, numeric) to authenticated;

comment on function public.close_shift(uuid, numeric) is
  'SECURITY DEFINER. Closes an open shift. Computes expected_cash server-side from sales.amount_applied_cfa + customer payments - cash refunds.';
