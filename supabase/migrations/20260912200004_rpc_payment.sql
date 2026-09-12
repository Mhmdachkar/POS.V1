-- ================================================================
-- VHM POS — Migration 018: record_payment() RPC
-- ================================================================
--
-- SECURITY DEFINER. Records a standalone customer payment (debt payoff).
-- payment_type = 'customer_payment', sale_id = NULL.
-- Directly reduces customer.balance_owed_cfa (pooled balance model).
-- Does NOT reverse or modify any existing sale or sale_payment record.
--
-- LOCK ORDER:
--   1. shift (via private.validate_shift — FOR UPDATE if p_shift_id provided)
--   2. customer FOR UPDATE
--
-- No inventory_transactions row (no stock movement).
-- ================================================================

create or replace function public.record_payment(
  p_customer_id  uuid,
  p_amount_cfa   numeric,
  p_shift_id     uuid    default null,
  p_note         text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx        private.caller_ctx;
  v_customer   public.customers%rowtype;
  v_payment_id uuid;
  v_new_balance numeric;
begin
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  -- ── Validate inputs ───────────────────────────────────────────
  if p_customer_id is null then
    perform private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      '{"reason": "customer_id_required"}'::jsonb);
  end if;

  if p_amount_cfa is null or p_amount_cfa <= 0 then
    perform private.raise_vhm_error('INVALID_AMOUNT',
      jsonb_build_object('reason', 'amount_must_be_positive', 'value', p_amount_cfa));
  end if;

  -- ── Shift validation (FOR UPDATE if provided) ─────────────────
  -- LOCK ORDER: shift BEFORE customer
  perform private.validate_shift(p_shift_id,
    coalesce(v_ctx.depot_id,
      -- Admin has no depot_id, but shift must belong to some depot;
      -- for admin, look up shift depot dynamically
      (select depot_id from public.shifts where id = p_shift_id)));

  -- ── Lock and read customer ────────────────────────────────────
  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    perform private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      jsonb_build_object('customer_id', p_customer_id));
  end if;

  -- Validate: cannot pay more than owed
  if p_amount_cfa > v_customer.balance_owed_cfa then
    perform private.raise_vhm_error('PAYMENT_EXCEEDS_BALANCE',
      jsonb_build_object(
        'customer_id',     p_customer_id,
        'amount_cfa',      p_amount_cfa,
        'balance_owed_cfa', v_customer.balance_owed_cfa
      ));
  end if;

  -- ── Insert payment record ─────────────────────────────────────
  insert into public.payments (
    customer_id, sale_id, shift_id, payment_type,
    amount_cfa, recorded_by, note
  ) values (
    p_customer_id, null, p_shift_id, 'customer_payment',
    p_amount_cfa, v_ctx.staff_id, p_note
  )
  returning id into v_payment_id;

  -- ── Update customer balance ───────────────────────────────────
  update public.customers
  set balance_owed_cfa = balance_owed_cfa - p_amount_cfa
  where id = p_customer_id
  returning balance_owed_cfa into v_new_balance;

  -- ── Write audit log ───────────────────────────────────────────
  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'record_payment',
    p_entity_type := 'payment',
    p_entity_id   := v_payment_id,
    p_depot_id    := v_ctx.depot_id,
    p_before_val  := jsonb_build_object(
      'balance_owed_cfa', v_customer.balance_owed_cfa
    ),
    p_after_val   := jsonb_build_object(
      'payment_id',   v_payment_id,
      'amount_cfa',   p_amount_cfa,
      'new_balance',  v_new_balance,
      'customer_id',  p_customer_id
    )
  );

  return jsonb_build_object(
    'payment_id',       v_payment_id,
    'customer_id',      p_customer_id,
    'amount_cfa',       p_amount_cfa,
    'new_balance_owed_cfa', v_new_balance
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.record_payment(uuid, numeric, uuid, text) from public;
grant execute on function public.record_payment(uuid, numeric, uuid, text) to authenticated;

comment on function public.record_payment(uuid, numeric, uuid, text) is
  'SECURITY DEFINER. Records standalone customer debt payoff. Reduces balance_owed_cfa. Payment type = customer_payment, sale_id = null.';
