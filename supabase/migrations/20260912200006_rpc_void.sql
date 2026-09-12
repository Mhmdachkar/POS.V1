-- ================================================================
-- VHM POS — Migration 020: void_sale() RPC
-- ================================================================
--
-- SECURITY DEFINER. Voids a completed sale.
-- Only 'completed' sales can be voided (partially_returned/returned cannot).
-- Voiding is a terminal transition — no further state changes.
--
-- PHYSICAL CONSEQUENCES:
--   1. Stock restored for each sale item
--   2. Customer balance reduced by MIN(balance_added_cfa, customer.balance_owed_cfa)
--      if the sale had credit (pooled balance rule, consistent with returns)
--   3. sale_payment reversed (is_reversed = true) if one exists
--   4. Two audit entries written:
--      a. 'void_sale' — documents the sale status change
--      b. 'void_sale_cash_reversal' — documents the payment reversal
--         (only when a sale_payment record exists i.e. customer+cash sale)
--
-- SHIFT RECONCILIATION:
--   Voided sales are excluded via sales.status filter.
--   Reversed payments are excluded via payments.is_reversed filter.
--   The audit entries make both consequences independently queryable.
--
-- LOCK ORDER:
--   1. sale FOR UPDATE
--   2. products FOR UPDATE (ascending UUID order — all sale items)
--   3. customer FOR UPDATE (if credit reversal needed)
-- ================================================================

create or replace function public.void_sale(
  p_sale_id  uuid,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx              private.caller_ctx;
  v_sale             public.sales%rowtype;
  v_customer         public.customers%rowtype;
  v_payment          public.payments%rowtype;
  v_product_ids      uuid[];
  v_si               public.sale_items%rowtype;
  v_balance_reversal numeric := 0;
  v_items_restored   jsonb[] := array[]::jsonb[];
begin
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  if p_sale_id is null then
    perform private.raise_vhm_error('SALE_NOT_FOUND', '{"reason":"sale_id_required"}'::jsonb);
  end if;

  -- ── Lock sale row (FIRST lock) ────────────────────────────────
  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    perform private.raise_vhm_error('SALE_NOT_FOUND',
      jsonb_build_object('sale_id', p_sale_id));
  end if;

  -- Depot isolation
  if v_ctx.role = 'cashier' and v_sale.depot_id != v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('sale_depot', v_sale.depot_id, 'caller_depot', v_ctx.depot_id));
  end if;

  -- Only completed sales can be voided
  if v_sale.status = 'voided' then
    perform private.raise_vhm_error('SALE_VOIDED',
      jsonb_build_object('sale_id', p_sale_id, 'reason', 'already_voided'));
  end if;
  if v_sale.status in ('partially_returned', 'returned') then
    perform private.raise_vhm_error('SALE_FULLY_RETURNED',
      jsonb_build_object(
        'sale_id', p_sale_id,
        'status',  v_sale.status,
        'reason',  'cannot_void_sale_with_returns'
      ));
  end if;

  -- ── Lock all products (ascending UUID order — SECOND lock set) ─
  select array_agg(distinct si.product_id order by si.product_id)
  into v_product_ids
  from public.sale_items si
  where si.sale_id = p_sale_id;

  perform 1 from public.products
  where id = any(v_product_ids)
  order by id
  for update;

  -- ── Restore stock + write inventory_transactions per item ──────
  for v_si in
    select * from public.sale_items where sale_id = p_sale_id
  loop
    update public.products
    set current_stock_pieces = current_stock_pieces + v_si.quantity_pieces
    where id = v_si.product_id;

    -- VOID row in inventory ledger (positive = stock returned to shelf)
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by, metadata
    ) values (
      v_sale.depot_id, v_si.product_id, v_si.quantity_pieces,
      'VOID', 'void', p_sale_id,
      v_ctx.staff_id,
      jsonb_build_object('voided_sale_id', p_sale_id, 'reason', p_reason)
    );

    v_items_restored := v_items_restored || jsonb_build_object(
      'product_id',    v_si.product_id,
      'quantity_pieces', v_si.quantity_pieces
    );
  end loop;

  -- ── Customer balance reversal (THIRD lock — after products) ───
  if v_sale.customer_id is not null and v_sale.balance_added_cfa > 0 then
    select * into v_customer
    from public.customers
    where id = v_sale.customer_id
    for update;

    -- Pooled balance rule: cannot reverse more than currently owed
    v_balance_reversal := least(v_sale.balance_added_cfa, v_customer.balance_owed_cfa);

    if v_balance_reversal > 0 then
      update public.customers
      set balance_owed_cfa = balance_owed_cfa - v_balance_reversal
      where id = v_sale.customer_id;
    end if;
  end if;

  -- ── Reverse sale_payment (if one exists) ─────────────────────
  -- Only customer+cash sales have a sale_payment record.
  -- Walk-in cash sales have no payment record (cash in sales.amount_applied_cfa only).
  select * into v_payment
  from public.payments
  where sale_id = p_sale_id
    and payment_type = 'sale_payment'
    and is_reversed = false;

  if found then
    update public.payments
    set
      is_reversed = true,
      reversed_at = now(),
      reversed_by = v_ctx.staff_id
    where id = v_payment.id;

    -- Explicit cash-reversal audit entry (separate from void_sale entry below)
    -- Makes the cash consequence independently queryable from audit_log
    -- without needing to join through voided sales.
    perform private.write_audit(
      p_actor_id    := v_ctx.staff_id,
      p_action      := 'void_sale_cash_reversal',
      p_entity_type := 'payment',
      p_entity_id   := v_payment.id,
      p_depot_id    := v_sale.depot_id,
      p_before_val  := jsonb_build_object(
        'is_reversed', false,
        'amount_cfa',  v_payment.amount_cfa,
        'shift_id',    v_payment.shift_id,
        'sale_id',     p_sale_id
      ),
      p_after_val   := jsonb_build_object(
        'is_reversed', true,
        'reversed_at', now(),
        'reversed_by', v_ctx.staff_id,
        'reason',      p_reason
      )
    );
  end if;

  -- ── Update sale status ────────────────────────────────────────
  update public.sales set status = 'voided' where id = p_sale_id;

  -- ── Write main void audit entry ───────────────────────────────
  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'void_sale',
    p_entity_type := 'sale',
    p_entity_id   := p_sale_id,
    p_depot_id    := v_sale.depot_id,
    p_before_val  := jsonb_build_object(
      'status',           v_sale.status,
      'total_cfa',        v_sale.total_cfa,
      'amount_applied_cfa', v_sale.amount_applied_cfa,
      'balance_added_cfa',  v_sale.balance_added_cfa
    ),
    p_after_val   := jsonb_build_object(
      'status',              'voided',
      'voided_at',           now(),
      'voided_by',           v_ctx.staff_id,
      'reason',              p_reason,
      'stock_restored_items', array_length(v_items_restored, 1),
      'balance_reversed',    v_balance_reversal,
      'payment_reversed',    v_payment.id is not null
    )
  );

  return jsonb_build_object(
    'sale_id',              p_sale_id,
    'voided_at',            now(),
    'stock_restored_items', v_items_restored,
    'balance_reversed_cfa', v_balance_reversal,
    'payment_reversed',     v_payment.id is not null
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.void_sale(uuid, text) from public;
grant execute on function public.void_sale(uuid, text) to authenticated;

comment on function public.void_sale(uuid, text) is
  'SECURITY DEFINER. Voids a completed sale. Restores stock, reverses payment, adjusts customer balance. Writes 1 or 2 audit entries depending on whether a sale_payment record exists.';
