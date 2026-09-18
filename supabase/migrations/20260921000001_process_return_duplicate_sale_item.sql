-- ================================================================
-- Reject duplicate sale_item_id rows in one process_return payload.
-- Previously each copy only saw DB prior returns, so the same sold
-- qty could be restored twice in one call (stock + ledger).
-- ================================================================
--
-- SECURITY DEFINER. Processes a partial or full return on a completed sale.
-- Client NEVER supplies quantity_pieces — server derives it from frozen sale data.
-- Refund amounts are discount-aware via sale_items.net_line_total_cfa.
-- Partial-return rounding is handled by residual calculation on last item.
-- Multiple partial returns on the same sale item are tracked correctly.
--
-- QUANTITY DERIVATION (C2):
--   return_quantity_pieces = quantity_in_unit × (sale_item.quantity_pieces / sale_item.quantity_in_unit)
--   This uses the frozen conversion ratio from the original sale.
--
-- REFUND PER ITEM (C3 — discount-aware):
--   For non-final return of a sale item:
--     item_refund = ROUND(qty_in_unit / sale_item.quantity_in_unit × sale_item.net_line_total_cfa, 2)
--   For final remaining quantity (ensures SUM = net_line_total_cfa):
--     item_refund = sale_item.net_line_total_cfa - SUM(previous refund_amount_cfa for this sale_item)
--
-- POOLED BALANCE RULE (C1 — explicit accounting policy):
--   balance_adjustment_cfa = LEAST(
--     refund_amount_cfa,                             -- cannot recover more than refund value
--     remaining_credit_reversal,                     -- cannot reverse more credit than sale created
--     customer.balance_owed_cfa                      -- cannot make balance negative
--   )
--   where: remaining_credit_reversal =
--     GREATEST(sale.balance_added_cfa - SUM(previous_returns.balance_adjustment_cfa), 0)
--   This correctly handles multiple partial returns on the same sale.
--   cash_refunded_cfa = refund_amount_cfa - balance_adjustment_cfa
--
-- LOCK ORDER:
--   1. shift (via validate_shift — FOR UPDATE if p_shift_id provided)
--   2. sale FOR UPDATE
--   3. products FOR UPDATE (ascending UUID order)
--   4. customer FOR UPDATE (if balance adjustment needed)
-- ================================================================

create or replace function public.process_return(
  p_sale_id         uuid,
  p_items           jsonb,          -- [{sale_item_id, quantity_in_unit}] — NO quantity_pieces
  p_reason          text    default null,
  p_cash_refund_cfa numeric default 0,     -- proposed cash portion (server validates total)
  p_shift_id        uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx                    private.caller_ctx;
  v_sale                   public.sales%rowtype;
  v_customer               public.customers%rowtype;
  v_return_id              uuid;

  -- Per-item processing
  v_ri                     jsonb;
  v_sale_item              public.sale_items%rowtype;
  v_return_qty_in_unit     numeric;
  v_return_qty_pieces      numeric;
  v_already_returned_pieces numeric;
  v_returnable_pieces      numeric;
  v_already_returned_refund numeric;
  v_is_final_return        boolean;
  v_item_refund            numeric;
  v_total_refund           numeric := 0;

  -- Product locks
  v_product_ids            uuid[];
  v_item_data              jsonb[] := array[]::jsonb[];

  -- Balance calculation
  v_previous_balance_adj   numeric;
  v_remaining_credit       numeric;
  v_balance_adjustment     numeric;
  v_cash_refunded          numeric;

  -- New sale status
  v_new_status             text;
  v_total_items_count      int;
  v_fully_returned_count   int;

  -- Return item count
  v_item_count             int;
  v_idata                  jsonb;
begin
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  -- ── Input validation ──────────────────────────────────────────
  if p_sale_id is null then
    perform private.raise_vhm_error('SALE_NOT_FOUND', '{"reason":"sale_id_required"}'::jsonb);
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    perform private.raise_vhm_error('CART_EMPTY', '{"reason":"return_items_required"}'::jsonb);
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) elem
    group by elem->>'sale_item_id'
    having count(*) > 1
  ) then
    perform private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'duplicate_sale_item_id'));
  end if;
  if p_cash_refund_cfa < 0 then
    perform private.raise_vhm_error('INVALID_AMOUNT',
      '{"reason":"cash_refund_cannot_be_negative"}'::jsonb);
  end if;

  -- ── Shift validation (acquires shift FOR UPDATE) ──────────────
  -- LOCK ORDER: shift FIRST
  perform private.validate_shift(p_shift_id,
    coalesce(v_ctx.depot_id,
      (select depot_id from public.shifts where id = p_shift_id)));

  -- ── Lock sale row ─────────────────────────────────────────────
  -- LOCK ORDER: sale SECOND (before products and customer)
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

  -- Status checks
  if v_sale.status = 'voided' then
    perform private.raise_vhm_error('SALE_VOIDED',
      jsonb_build_object('sale_id', p_sale_id));
  end if;
  if v_sale.status = 'returned' then
    perform private.raise_vhm_error('SALE_FULLY_RETURNED',
      jsonb_build_object('sale_id', p_sale_id));
  end if;

  -- ── Collect product IDs for locking (ascending UUID order) ────
  -- LOCK ORDER: products THIRD (ascending UUID)
  select array_agg(distinct (si.product_id) order by si.product_id)
  into v_product_ids
  from public.sale_items si
  where si.id = any(
    select (elem->>'sale_item_id')::uuid from jsonb_array_elements(p_items) elem
  );

  -- Lock all products in ascending order
  perform 1 from public.products
  where id = any(v_product_ids)
  order by id
  for update;

  -- ── Validate and compute each return item ─────────────────────
  v_item_count := 0;
  for v_ri in select * from jsonb_array_elements(p_items)
  loop
    v_item_count := v_item_count + 1;
    v_return_qty_in_unit := (v_ri->>'quantity_in_unit')::numeric;

    if v_return_qty_in_unit is null or v_return_qty_in_unit <= 0 then
      perform private.raise_vhm_error('INVALID_QUANTITY',
        jsonb_build_object('reason', 'quantity_in_unit_must_be_positive'));
    end if;

    -- Fetch original sale item
    select * into v_sale_item
    from public.sale_items
    where id = (v_ri->>'sale_item_id')::uuid
      and sale_id = p_sale_id;

    if not found then
      perform private.raise_vhm_error('SALE_NOT_FOUND',
        jsonb_build_object('sale_item_id', v_ri->>'sale_item_id',
                           'reason', 'sale_item_not_found_in_sale'));
    end if;

    -- Server-derive return quantity in pieces from frozen sale conversion ratio
    v_return_qty_pieces := v_return_qty_in_unit
      * (v_sale_item.quantity_pieces / v_sale_item.quantity_in_unit);

    -- Check how many pieces of this item have already been returned
    select coalesce(sum(sri.quantity_pieces), 0)
    into v_already_returned_pieces
    from public.sale_return_items sri
    join public.sale_returns sr on sr.id = sri.return_id
    where sri.sale_item_id = v_sale_item.id
      and sr.sale_id = p_sale_id;

    v_returnable_pieces := v_sale_item.quantity_pieces - v_already_returned_pieces;

    if v_return_qty_pieces > v_returnable_pieces + 0.001 then   -- 0.001 tolerance for float
      perform private.raise_vhm_error('RETURN_QTY_EXCEEDED',
        jsonb_build_object(
          'sale_item_id',       v_sale_item.id,
          'requested_pieces',   v_return_qty_pieces,
          'returnable_pieces',  v_returnable_pieces
        ));
    end if;

    -- Check if this is the final return of this sale item
    -- (within tolerance for floating-point comparison)
    v_is_final_return := (v_return_qty_pieces >= v_returnable_pieces - 0.001);

    -- Compute per-item refund (discount-aware, C3)
    -- Sum of previous refund_amount_cfa for this sale_item across all prior returns
    select coalesce(sum(sri.refund_amount_cfa), 0)
    into v_already_returned_refund
    from public.sale_return_items sri
    join public.sale_returns sr on sr.id = sri.return_id
    where sri.sale_item_id = v_sale_item.id
      and sr.sale_id = p_sale_id;

    if v_is_final_return then
      -- Residual calculation: guarantees SUM(refund_amount_cfa) = net_line_total_cfa exactly
      v_item_refund := v_sale_item.net_line_total_cfa - v_already_returned_refund;
    else
      -- Proportional share of net_line_total_cfa
      v_item_refund := round(
        (v_return_qty_in_unit / v_sale_item.quantity_in_unit)
        * v_sale_item.net_line_total_cfa,
        2
      );
    end if;

    v_total_refund := v_total_refund + v_item_refund;

    -- Stash for INSERT phase
    v_item_data := v_item_data || jsonb_build_object(
      'sale_item_id',      v_sale_item.id,
      'product_id',        v_sale_item.product_id,
      'quantity_in_unit',  v_return_qty_in_unit,
      'quantity_pieces',   v_return_qty_pieces,
      'refund_amount_cfa', v_item_refund
    );
  end loop;

  -- ── Compute balance adjustment (pooled model, C1, multi-return safe) ──
  -- LOCK ORDER: customer FOURTH (after all product locks)
  if v_sale.customer_id is not null and v_sale.balance_added_cfa > 0 then
    select * into v_customer
    from public.customers
    where id = v_sale.customer_id
    for update;

    if not found then
      perform private.raise_vhm_error('CUSTOMER_NOT_FOUND',
        jsonb_build_object('customer_id', v_sale.customer_id));
    end if;

    -- Sum of balance already recovered across all previous returns on this sale
    select coalesce(sum(sr.balance_adjustment_cfa), 0)
    into v_previous_balance_adj
    from public.sale_returns sr
    where sr.sale_id = p_sale_id;

    -- Remaining credit that can still be reversed (cannot exceed sale's original credit)
    v_remaining_credit := greatest(v_sale.balance_added_cfa - v_previous_balance_adj, 0);

    -- POOLED BALANCE RULE (approved accounting policy):
    -- We reduce the customer's current pooled balance by up to:
    --   1. the total refund amount (cannot recover more than refund value)
    --   2. the remaining reversible credit from this sale
    --   3. the customer's current balance (cannot go negative)
    -- This does NOT imply these CFA "belonged" to the returned sale.
    v_balance_adjustment := least(v_total_refund, v_remaining_credit, v_customer.balance_owed_cfa);
  else
    v_balance_adjustment := 0;
    v_customer := null;
  end if;

  v_cash_refunded := v_total_refund - v_balance_adjustment;

  -- Validate client-proposed cash refund matches server computation
  -- Allow a 1 CFA tolerance for display rounding
  if abs(p_cash_refund_cfa - v_cash_refunded) > 1 then
    perform private.raise_vhm_error('INVALID_AMOUNT',
      jsonb_build_object(
        'reason',            'cash_refund_does_not_match_computed',
        'proposed_cash',     p_cash_refund_cfa,
        'computed_cash',     v_cash_refunded,
        'total_refund',      v_total_refund,
        'balance_adjustment',v_balance_adjustment
      ));
  end if;

  -- Use server-computed cash amount (ignore client proposal if within tolerance)
  -- p_cash_refund_cfa is validated but v_cash_refunded is the authoritative value

  -- ── Insert sale_return header ─────────────────────────────────
  insert into public.sale_returns (
    sale_id, depot_id, shift_id, processed_by, reason,
    refund_amount_cfa, balance_adjustment_cfa, cash_refunded_cfa
  ) values (
    p_sale_id, v_sale.depot_id, p_shift_id, v_ctx.staff_id, p_reason,
    v_total_refund, v_balance_adjustment, v_cash_refunded
  )
  returning id into v_return_id;

  -- ── Insert sale_return_items + restore stock + write ledger ───
  foreach v_idata in array v_item_data
  loop
    insert into public.sale_return_items (
      return_id, sale_item_id,
      quantity_in_unit, quantity_pieces, refund_amount_cfa
    ) values (
      v_return_id,
      (v_idata->>'sale_item_id')::uuid,
      (v_idata->>'quantity_in_unit')::numeric,
      (v_idata->>'quantity_pieces')::numeric,
      (v_idata->>'refund_amount_cfa')::numeric
    );

    -- Restore stock
    update public.products
    set current_stock_pieces = current_stock_pieces + (v_idata->>'quantity_pieces')::numeric
    where id = (v_idata->>'product_id')::uuid;

    -- Inventory ledger — RETURN row (positive = stock in)
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by, metadata
    ) values (
      v_sale.depot_id,
      (v_idata->>'product_id')::uuid,
      (v_idata->>'quantity_pieces')::numeric,    -- positive = stock back
      'RETURN',
      'sale_return',
      v_return_id,
      v_ctx.staff_id,
      jsonb_build_object('sale_id', p_sale_id, 'reason', p_reason)
    );
  end loop;

  -- ── Adjust customer balance ───────────────────────────────────
  if v_balance_adjustment > 0 then
    update public.customers
    set balance_owed_cfa = balance_owed_cfa - v_balance_adjustment
    where id = v_sale.customer_id;
  end if;

  -- ── Determine new sale status ─────────────────────────────────
  -- Count total distinct sale items vs fully-returned sale items
  select count(*) into v_total_items_count
  from public.sale_items
  where sale_id = p_sale_id;

  select count(*) into v_fully_returned_count
  from public.sale_items si
  where si.sale_id = p_sale_id
    and si.quantity_pieces <= (
      select coalesce(sum(sri.quantity_pieces), 0)
      from public.sale_return_items sri
      join public.sale_returns sr on sr.id = sri.return_id
      where sri.sale_item_id = si.id
        and sr.sale_id = p_sale_id
    );

  v_new_status := case
    when v_fully_returned_count >= v_total_items_count then 'returned'
    else 'partially_returned'
  end;

  update public.sales set status = v_new_status where id = p_sale_id;

  -- ── Write audit log ───────────────────────────────────────────
  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'process_return',
    p_entity_type := 'sale_return',
    p_entity_id   := v_return_id,
    p_depot_id    := v_sale.depot_id,
    p_before_val  := jsonb_build_object(
      'sale_status',     v_sale.status,
      'customer_balance', case when v_customer.id is not null then v_customer.balance_owed_cfa else null end
    ),
    p_after_val   := jsonb_build_object(
      'return_id',           v_return_id,
      'new_sale_status',     v_new_status,
      'refund_amount_cfa',   v_total_refund,
      'balance_adjustment',  v_balance_adjustment,
      'cash_refunded_cfa',   v_cash_refunded,
      'items_returned',      v_item_count
    )
  );

  return jsonb_build_object(
    'return_id',              v_return_id,
    'sale_id',                p_sale_id,
    'new_sale_status',        v_new_status,
    'refund_amount_cfa',      v_total_refund,
    'balance_adjustment_cfa', v_balance_adjustment,
    'cash_refunded_cfa',      v_cash_refunded
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.process_return(uuid, jsonb, text, numeric, uuid) from public;
grant execute on function public.process_return(uuid, jsonb, text, numeric, uuid) to authenticated;

comment on function public.process_return(uuid, jsonb, text, numeric, uuid) is
  'SECURITY DEFINER. Processes partial/full sale return. Derives quantity_pieces server-side. Discount-aware refunds via net_line_total_cfa. Multi-return pooled balance correctly tracked. Duplicate sale_item_id in one payload is rejected.';
