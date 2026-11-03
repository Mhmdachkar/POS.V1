-- process_return audit: include sale receipt number on new returns.

-- Return line cap is least(value of the pieces still out, sale remaining collected).
-- An earlier under-refund does not raise the next piece.
-- Also: batch displayed client balances for the client list.
-- Idempotent. Does not rewrite historical returns.

create or replace function public.process_return(
  p_sale_id         uuid,
  p_items           jsonb,          -- [{sale_item_id, quantity_in_unit, refund_amount_cfa?}] — NO quantity_pieces
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
  v_already_returned_units numeric;
  v_is_final_return        boolean;
  v_remaining_refundable   numeric;
  v_prefix_full            numeric;
  v_remaining_line_value   numeric;
  v_selected_value         numeric;
  v_custom_refund          numeric;
  v_item_refund            numeric;
  v_total_refund           numeric := 0;
  v_payable                numeric;
  v_taken                  numeric;
  v_refund_pool            numeric;
  v_already_sale_refunded  numeric;
  v_line_basis             numeric;
  v_sale_remaining         numeric;

  -- Product locks
  v_product_ids            uuid[];
  v_item_data              jsonb[] := array[]::jsonb[];

  -- Balance calculation
  v_previous_balance_adj   numeric;
  v_remaining_credit       numeric;
  v_balance_adjustment     numeric;
  v_cash_refunded          numeric;
  v_ledger_payable         numeric;

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

  -- Payable total vs cash+credit actually taken. Cap refunds at the lesser.
  v_payable := coalesce(v_sale.admin_override_total_cfa, v_sale.total_cfa);
  v_taken := v_sale.amount_applied_cfa + v_sale.balance_added_cfa;
  v_refund_pool := least(greatest(v_payable, 0), greatest(v_taken, 0));

  select coalesce(sum(sri.refund_amount_cfa), 0)
  into v_already_sale_refunded
  from public.sale_return_items sri
  join public.sale_returns sr on sr.id = sri.return_id
  where sr.sale_id = p_sale_id;

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

    -- Line share of the payable/taken pool (B1).
    -- Cap is the value of the pieces still out, not basis minus prior refunds.
    select coalesce(sum(sri.refund_amount_cfa), 0),
           coalesce(sum(sri.quantity_in_unit), 0)
    into v_already_returned_refund, v_already_returned_units
    from public.sale_return_items sri
    join public.sale_returns sr on sr.id = sri.return_id
    where sri.sale_item_id = v_sale_item.id
      and sr.sale_id = p_sale_id;

    if v_sale.total_cfa > 0 then
      v_line_basis := round(
        (v_sale_item.net_line_total_cfa / v_sale.total_cfa) * v_refund_pool,
        2
      );
    elsif v_sale.subtotal_cfa > 0 then
      v_line_basis := round(
        (v_sale_item.line_total_cfa / v_sale.subtotal_cfa) * v_refund_pool,
        2
      );
    else
      v_line_basis := 0;
    end if;

    -- Value of quantity already returned, as one prefix of the line.
    -- A smaller earlier refund does not increase the pieces still out.
    if v_already_returned_units <= 0 then
      v_prefix_full := 0;
    else
      v_prefix_full := round(
        (v_already_returned_units / v_sale_item.quantity_in_unit) * v_line_basis,
        2
      );
    end if;
    v_remaining_line_value := greatest(v_line_basis - v_prefix_full, 0);
    v_sale_remaining := greatest(v_refund_pool - v_already_sale_refunded - v_total_refund, 0);

    if v_is_final_return then
      v_selected_value := v_remaining_line_value;
    else
      v_selected_value := least(
        round(
          (v_return_qty_in_unit / v_sale_item.quantity_in_unit) * v_line_basis,
          2
        ),
        v_remaining_line_value
      );
    end if;

    -- Default amount for the selected qty (also the maximum custom refund).
    v_item_refund := least(greatest(v_selected_value, 0), v_sale_remaining);
    v_remaining_refundable := v_item_refund;

    -- Optional client override: restore stock at full qty, refund a lower amount.
    if v_ri ? 'refund_amount_cfa'
       and (v_ri->>'refund_amount_cfa') is not null
       and btrim(v_ri->>'refund_amount_cfa') <> '' then
      begin
        v_custom_refund := round((v_ri->>'refund_amount_cfa')::numeric, 2);
      exception when invalid_text_representation then
        perform private.raise_vhm_error('INVALID_AMOUNT',
          jsonb_build_object(
            'reason', 'refund_amount_invalid',
            'sale_item_id', v_sale_item.id
          ));
      end;
      if v_custom_refund < 0 then
        perform private.raise_vhm_error('INVALID_AMOUNT',
          jsonb_build_object(
            'reason', 'refund_amount_cannot_be_negative',
            'sale_item_id', v_sale_item.id
          ));
      end if;
      if v_custom_refund > v_item_refund + 0.01 then
        perform private.raise_vhm_error('INVALID_AMOUNT',
          jsonb_build_object(
            'reason', 'refund_exceeds_line',
            'sale_item_id', v_sale_item.id,
            'proposed', v_custom_refund,
            'max_refund', v_item_refund
          ));
      end if;
      v_item_refund := least(greatest(v_custom_refund, 0), v_item_refund);
    end if;

    v_total_refund := v_total_refund + v_item_refund;

    if v_already_sale_refunded + v_total_refund > v_refund_pool + 0.01 then
      perform private.raise_vhm_error('INVALID_AMOUNT',
        jsonb_build_object(
          'reason', 'refund_exceeds_collected',
          'requested', v_already_sale_refunded + v_total_refund,
          'collected', v_refund_pool
        ));
    end if;

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

    -- POOLED BALANCE RULE: cap at displayed ledger debt (same as UI), not owed.
    --   1. the total refund amount
    --   2. the remaining reversible credit from this sale
    --   3. greatest(0, ledger running) so the server cannot reverse more than the UI shows
    v_ledger_payable := private.customer_payable_debt_cfa(v_customer.id);
    v_balance_adjustment := least(v_total_refund, v_remaining_credit, v_ledger_payable);
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

  -- ── Sync owed from ledger (includes this return + cash_refund) ─
  if v_sale.customer_id is not null then
    perform private.sync_customer_balance_owed(v_sale.customer_id);
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
      'sale_receipt_number', v_sale.receipt_number,
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
  'Return stock and refund least(remaining piece value, sale remaining collected). Under-refunds do not roll onto the next piece.';

CREATE OR REPLACE FUNCTION public.customer_displayed_balances(p_customer_ids uuid[])
RETURNS TABLE (customer_id uuid, displayed_balance_cfa numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $$
  SELECT ids.id, public.customer_displayed_balance_cfa(ids.id)
  FROM unnest(COALESCE(p_customer_ids, ARRAY[]::uuid[])) AS ids(id);
$$;

REVOKE EXECUTE ON FUNCTION public.customer_displayed_balances(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_displayed_balances(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.customer_displayed_balances(uuid[]) IS
  'Displayed ledger solde for a page of customers, one round trip. Same figure as customer_displayed_balance_cfa.';


-- Dashboard GP: zero or missing cost makes the day margin non calculable (same rule as reports).
-- Dashboard GP: exclude 0 / missing cost the same way reports do.
-- Does not rewrite historical sale_items.cost_price_cfa. Idempotent.

CREATE OR REPLACE FUNCTION public.admin_dashboard_summary(p_depot_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_sales_cfa numeric := 0;
  v_gp        numeric;
  v_missing   integer := 0;
  v_txn       integer := 0;
  v_avg       numeric := 0;
  v_top       jsonb   := '[]'::jsonb;
  v_hourly    jsonb   := '[]'::jsonb;
  v_low       jsonb   := '[]'::jsonb;
  v_balances  integer := 0;
  v_shifts    jsonb   := '[]'::jsonb;
  v_rate      jsonb;
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);

  IF p_depot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.depots WHERE id = p_depot_id
  ) THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;

  WITH today_sales AS (
    SELECT s.id, s.created_at, s.depot_id,
           COALESCE(s.admin_override_total_cfa, s.total_cfa) AS payable_cfa
    FROM public.sales s
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
  ),
  returns_today AS (
    SELECT sr.sale_id, COALESCE(SUM(sr.refund_amount_cfa), 0) AS refunded_cfa
    FROM public.sale_returns sr
    JOIN today_sales ts ON ts.id = sr.sale_id
    GROUP BY sr.sale_id
  ),
  sale_net AS (
    SELECT
      ts.id,
      ts.created_at,
      ts.payable_cfa - COALESCE(rt.refunded_cfa, 0) AS remaining_net
    FROM today_sales ts
    LEFT JOIN returns_today rt ON rt.sale_id = ts.id
  ),
  item_net AS (
    SELECT
      si.id,
      si.product_id,
      sn.created_at,
      si.quantity_in_unit,
      si.quantity_pieces,
      si.cost_price_cfa,
      private.sale_line_payable_share(
        si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa
      ) AS payable_line,
      COALESCE(SUM(sri.quantity_in_unit), 0)  AS returned_units,
      COALESCE(SUM(sri.quantity_pieces), 0)   AS returned_pieces,
      COALESCE(SUM(sri.refund_amount_cfa), 0) AS returned_refund
    FROM sale_net sn
    JOIN public.sales s ON s.id = sn.id
    JOIN public.sale_items si ON si.sale_id = sn.id
    LEFT JOIN public.sale_return_items sri ON sri.sale_item_id = si.id
    GROUP BY si.id, si.product_id, sn.created_at, si.quantity_in_unit,
             si.quantity_pieces, si.cost_price_cfa, s.total_cfa,
             s.admin_override_total_cfa, si.net_line_total_cfa
  ),
  remaining AS (
    SELECT
      product_id,
      created_at,
      quantity_pieces - returned_pieces AS net_pieces,
      payable_line - returned_refund AS remaining_net,
      CASE
        WHEN COALESCE(cost_price_cfa, 0) <= 0 THEN NULL
        -- Stock is fully back but cash was kept (under-refund). No units
        -- remain to carry a cost, so this is not a product margin.
        WHEN abs(quantity_in_unit - returned_units) < 0.0001
             AND abs(payable_line - returned_refund) > 0.01 THEN NULL
        ELSE (payable_line - returned_refund)
          - (cost_price_cfa * (quantity_in_unit - returned_units))
      END AS remaining_gp,
      CASE
        WHEN COALESCE(cost_price_cfa, 0) <= 0 THEN 1
        WHEN abs(quantity_in_unit - returned_units) < 0.0001
             AND abs(payable_line - returned_refund) > 0.01 THEN 1
        ELSE 0
      END AS missing_cost
    FROM item_net
  )
  SELECT
    COALESCE((SELECT SUM(remaining_net) FROM sale_net), 0),
    CASE
      WHEN COALESCE(SUM(missing_cost), 0) > 0 THEN NULL
      ELSE COALESCE(SUM(remaining_gp), 0)
    END,
    COALESCE(SUM(missing_cost), 0)::integer
  INTO v_sales_cfa, v_gp, v_missing
  FROM remaining;

  SELECT COUNT(*) INTO v_txn
  FROM public.sales s
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        = (now() AT TIME ZONE 'Africa/Abidjan')::date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id);

  IF v_txn > 0 THEN
    v_avg := ROUND(v_sales_cfa / v_txn, 2);
  END IF;

  WITH today_sales AS (
    SELECT s.id
    FROM public.sales s
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
  ),
  item_net AS (
    SELECT
      si.product_id,
      si.quantity_pieces - COALESCE(SUM(sri.quantity_pieces), 0) AS net_pieces
    FROM today_sales ts
    JOIN public.sale_items si ON si.sale_id = ts.id
    LEFT JOIN public.sale_return_items sri ON sri.sale_item_id = si.id
    GROUP BY si.id, si.product_id, si.quantity_pieces
  ),
  net AS (
    SELECT product_id, SUM(net_pieces) AS net_pieces
    FROM item_net
    GROUP BY product_id
    HAVING SUM(net_pieces) > 0
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', n.product_id,
      'name', p.name,
      'net_pieces', n.net_pieces
    ) ORDER BY n.net_pieces DESC
  ), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT * FROM net ORDER BY net_pieces DESC LIMIT 8
  ) n
  JOIN public.products p ON p.id = n.product_id;

  WITH today_sales AS (
    SELECT s.id, s.created_at
    FROM public.sales s
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
  ),
  item_net AS (
    SELECT
      EXTRACT(HOUR FROM (ts.created_at AT TIME ZONE 'Africa/Abidjan'))::int AS hour,
      private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa)
        - COALESCE(SUM(sri.refund_amount_cfa), 0) AS remaining_net
    FROM today_sales ts
    JOIN public.sales s ON s.id = ts.id
    JOIN public.sale_items si ON si.sale_id = ts.id
    LEFT JOIN public.sale_return_items sri ON sri.sale_item_id = si.id
    GROUP BY ts.created_at, si.id, s.total_cfa, s.admin_override_total_cfa, si.net_line_total_cfa
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('hour', h.hour, 'sales_cfa', h.sales_cfa) ORDER BY h.hour
  ), '[]'::jsonb)
  INTO v_hourly
  FROM (
    SELECT hour, SUM(remaining_net) AS sales_cfa
    FROM item_net
    GROUP BY hour
  ) h;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', p.id,
      'name', p.name,
      'depot_id', p.depot_id,
      'current_stock_pieces', p.current_stock_pieces
    ) ORDER BY p.current_stock_pieces, p.name
  ), '[]'::jsonb)
  INTO v_low
  FROM (
    SELECT id, name, depot_id, current_stock_pieces
    FROM public.products
    WHERE is_active = true
      AND current_stock_pieces <= 10
      AND (p_depot_id IS NULL OR depot_id = p_depot_id)
    ORDER BY current_stock_pieces, name
    LIMIT 20
  ) p;

  SELECT COUNT(*) INTO v_balances
  FROM public.customers
  WHERE balance_owed_cfa > 0;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'shift_id', s.id,
      'depot_id', s.depot_id,
      'discrepancy_cfa', s.discrepancy_cfa,
      'closed_at', s.closed_at
    ) ORDER BY s.closed_at DESC
  ), '[]'::jsonb)
  INTO v_shifts
  FROM (
    SELECT id, depot_id, discrepancy_cfa, closed_at
    FROM public.shifts
    WHERE status = 'closed'
      AND discrepancy_cfa <> 0
      AND (closed_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR depot_id = p_depot_id)
    ORDER BY closed_at DESC
    LIMIT 20
  ) s;

  SELECT jsonb_build_object(
    'cfa_to_usd_rate', bs.cfa_to_usd_rate,
    'rate_updated_at', bs.rate_updated_at
  )
  INTO v_rate
  FROM public.business_settings bs
  WHERE bs.id = true;

  RETURN jsonb_build_object(
    'sales_cfa', v_sales_cfa,
    'gross_profit_cfa', v_gp,
    'lines_without_cost_count', v_missing,
    'margin_status', CASE WHEN v_missing > 0 THEN 'marge non calculable' ELSE NULL END,
    'txn_count', v_txn,
    'avg_sale_cfa', v_avg,
    'top_products', coalesce(v_top, '[]'::jsonb),
    'hourly_sales', coalesce(v_hourly, '[]'::jsonb),
    'action_required', jsonb_build_object(
      'low_stock', coalesce(v_low, '[]'::jsonb),
      'outstanding_balances_count', v_balances,
      'shift_discrepancies', coalesce(v_shifts, '[]'::jsonb),
      'exchange_rate', v_rate
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_summary(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_dashboard_summary(uuid) TO authenticated;
