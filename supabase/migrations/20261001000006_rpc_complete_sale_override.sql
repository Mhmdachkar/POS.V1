-- ================================================================
-- CEO Notes Phase — RPC: complete_sale with Admin Total Override
-- ================================================================
--
-- NEW PARAMETER: p_override_total_cfa (numeric, default NULL)
--   - Admin-only. Server REJECTS if a non-admin supplies this.
--   - When provided: the final authoritative total becomes p_override_total_cfa
--   - sales.total_cfa retains the CALCULATED total (pre-override)
--   - sales.admin_override_total_cfa stores the override value
--   - Reports must use COALESCE(admin_override_total_cfa, total_cfa) as revenue
--
-- ACCOUNTING:
--   v_final_total = COALESCE(p_override_total_cfa, v_total)
--   amount_applied = MIN(amount_tendered, v_final_total)
--   change_given   = amount_tendered - amount_applied
--   balance_added  = v_final_total - amount_applied
--   customer balance uses v_final_total
--
-- AUDIT:
--   When override is used: audit records original_total + override_total
--
-- CONSTRAINTS:
--   override >= 0 (zero is valid — admin can waive the total)
--   cashier cannot supply override (server rejects with NOT_AUTHORIZED)
--   override must be < (not validated at DB level) ... but >= 0 is enforced
--
-- HISTORICAL SAFETY:
--   All historical sales have admin_override_total_cfa = NULL.
--   This migration only changes future behavior.
-- ================================================================

-- Drop old 9-arg signature so PostgREST unambiguously routes to the new 10-arg version
DROP FUNCTION IF EXISTS public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid);

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_depot_id              uuid,
  p_customer_id           uuid     DEFAULT NULL,
  p_cart_items            jsonb    DEFAULT '[]',
  p_amount_tendered_cfa   numeric  DEFAULT 0,
  p_display_currency      text     DEFAULT 'CFA',
  p_discount_type         text     DEFAULT NULL,
  p_discount_value        numeric  DEFAULT NULL,
  p_shift_id              uuid     DEFAULT NULL,
  p_idempotency_key       uuid     DEFAULT NULL,
  p_override_total_cfa    numeric  DEFAULT NULL   -- admin-only
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx              private.caller_ctx;
  v_depot            public.depots%rowtype;
  v_effective_depot  uuid;
  v_item             jsonb;
  v_product          public.products%rowtype;
  v_unit             public.product_units%rowtype;
  v_qty_in_unit      numeric;
  v_qty_pieces       numeric;
  v_line_total       numeric;
  v_cost_price       numeric;
  v_product_ids      uuid[];
  v_product_qty_map  jsonb := '{}'::jsonb;
  v_subtotal         numeric := 0;
  v_discount_amount  numeric := 0;
  v_total            numeric := 0;    -- calculated total (pre-override)
  v_final_total      numeric := 0;    -- authoritative total (post-override if any)
  v_amount_applied   numeric := 0;
  v_change_given     numeric := 0;
  v_balance_added    numeric := 0;
  v_rate             numeric;
  v_items_data       jsonb[] := array[]::jsonb[];
  v_item_count       int;
  v_net_line_total   numeric;
  v_net_sum_so_far   numeric := 0;
  v_sale_id          uuid;
  v_payment_id       uuid;
  v_receipt_number   text;
  v_item_data        jsonb;
  v_existing_sale    record;
  v_customer         public.customers%rowtype;
  v_prod_id          uuid;
  v_agg_qty          numeric;
  v_already_acc      numeric;
  v_result           jsonb;
  v_idx              int;
  v_item_total       int;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  -- ── Admin-only override guard ──────────────────────────────────
  IF p_override_total_cfa IS NOT NULL AND v_ctx.role != 'admin' THEN
    PERFORM private.raise_vhm_error('NOT_AUTHORIZED',
      jsonb_build_object('reason', 'total_override_requires_admin_role',
                         'role', v_ctx.role));
  END IF;

  -- ── Override must be >= 0 ──────────────────────────────────────
  IF p_override_total_cfa IS NOT NULL AND p_override_total_cfa < 0 THEN
    PERFORM private.raise_vhm_error('INVALID_AMOUNT',
      jsonb_build_object('reason', 'override_total_cannot_be_negative',
                         'value', p_override_total_cfa));
  END IF;

  IF v_ctx.role = 'cashier' THEN
    v_effective_depot := v_ctx.depot_id;
  ELSE
    v_effective_depot := p_depot_id;
    IF v_effective_depot IS NULL THEN
      PERFORM private.raise_vhm_error('INVALID_DEPOT',
        '{"reason": "admin_must_supply_depot_id"}'::jsonb);
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_idempotency_key::text, 0)
    );
    SELECT id, receipt_number, subtotal_cfa, discount_amount_cfa,
           total_cfa, amount_applied_cfa, change_given_cfa, balance_added_cfa,
           admin_override_total_cfa
    INTO v_existing_sale
    FROM public.sales
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'sale_id',                  v_existing_sale.id,
        'receipt_number',           v_existing_sale.receipt_number,
        'subtotal_cfa',             v_existing_sale.subtotal_cfa,
        'discount_amount_cfa',      v_existing_sale.discount_amount_cfa,
        'total_cfa',                v_existing_sale.total_cfa,
        'admin_override_total_cfa', v_existing_sale.admin_override_total_cfa,
        'amount_applied_cfa',       v_existing_sale.amount_applied_cfa,
        'change_given_cfa',         v_existing_sale.change_given_cfa,
        'balance_added_cfa',        v_existing_sale.balance_added_cfa,
        'idempotent',               true
      );
    END IF;
  END IF;

  IF p_display_currency NOT IN ('CFA', 'USD') THEN
    PERFORM private.raise_vhm_error('INVALID_CURRENCY',
      jsonb_build_object('value', p_display_currency));
  END IF;

  IF p_amount_tendered_cfa < 0 THEN
    PERFORM private.raise_vhm_error('INVALID_AMOUNT',
      '{"reason": "amount_tendered_cannot_be_negative"}'::jsonb);
  END IF;

  IF p_cart_items IS NULL OR jsonb_array_length(p_cart_items) = 0 THEN
    PERFORM private.raise_vhm_error('CART_EMPTY', NULL);
  END IF;

  IF p_discount_type IS NOT NULL AND p_discount_type NOT IN ('flat', 'percent') THEN
    PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
      jsonb_build_object('reason', 'invalid_discount_type', 'value', p_discount_type));
  END IF;
  IF (p_discount_type IS NULL) != (p_discount_value IS NULL) THEN
    PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
      '{"reason": "discount_type_and_value_must_both_be_set_or_both_null"}'::jsonb);
  END IF;

  PERFORM private.validate_shift(p_shift_id, v_effective_depot);

  SELECT * INTO v_depot
  FROM public.depots
  WHERE id = v_effective_depot
  FOR UPDATE;

  IF NOT FOUND OR NOT v_depot.is_active THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', v_effective_depot, 'reason', 'not_found_or_inactive'));
  END IF;

  v_item_count := jsonb_array_length(p_cart_items);

  SELECT array_agg(DISTINCT (item->>'product_id')::uuid ORDER BY (item->>'product_id')::uuid)
  INTO v_product_ids
  FROM jsonb_array_elements(p_cart_items) AS item;

  IF v_product_ids IS NOT NULL THEN
    PERFORM 1
    FROM public.products
    WHERE id = ANY(v_product_ids)
    ORDER BY id
    FOR UPDATE;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
  LOOP
    IF (v_item->>'quantity_in_unit') IS NULL THEN
      PERFORM private.raise_vhm_error('INVALID_QUANTITY',
        '{"reason": "quantity_in_unit_required"}'::jsonb);
    END IF;
    v_qty_in_unit := (v_item->>'quantity_in_unit')::numeric;
    IF v_qty_in_unit <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_QUANTITY',
        jsonb_build_object('reason', 'quantity_must_be_positive', 'value', v_qty_in_unit));
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
        jsonb_build_object('product_id', v_item->>'product_id', 'reason', 'product_not_found'));
    END IF;

    IF NOT v_product.is_active THEN
      PERFORM private.raise_vhm_error('PRODUCT_INACTIVE',
        jsonb_build_object('product_id', v_product.id));
    END IF;

    IF v_product.depot_id != v_effective_depot THEN
      PERFORM private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
        jsonb_build_object('product_id', v_product.id, 'depot_id', v_product.depot_id));
    END IF;

    SELECT * INTO v_unit
    FROM public.product_units
    WHERE product_id = v_product.id
      AND unit_level = (v_item->>'unit_level')::smallint;

    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('INVALID_UNIT',
        jsonb_build_object('product_id', v_product.id, 'unit_level', v_item->>'unit_level'));
    END IF;

    IF v_unit.conversion_to_base <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_UNIT',
        jsonb_build_object('reason', 'conversion_to_base_must_be_positive',
                           'product_id', v_product.id));
    END IF;

    IF v_unit.selling_price_cfa <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_PRICE',
        jsonb_build_object('reason', 'selling_price_must_be_positive',
                           'product_id', v_product.id));
    END IF;

    v_qty_pieces := v_qty_in_unit * v_unit.conversion_to_base;
    v_line_total := v_qty_in_unit * v_unit.selling_price_cfa;
    v_cost_price := v_unit.cost_price_cfa;

    v_already_acc := coalesce((v_product_qty_map->>v_product.id::text)::numeric, 0);
    IF v_product.current_stock_pieces < v_already_acc + v_qty_pieces THEN
      PERFORM private.raise_vhm_error('INSUFFICIENT_STOCK',
        jsonb_build_object(
          'product_id',        v_product.id,
          'product_name',      v_product.name,
          'requested_pieces',  v_already_acc + v_qty_pieces,
          'available_pieces',  v_product.current_stock_pieces
        ));
    END IF;

    v_subtotal := v_subtotal + v_line_total;

    v_items_data := v_items_data || jsonb_build_object(
      'product_id',       v_product.id,
      'unit_level',       v_unit.unit_level,
      'quantity_in_unit', v_qty_in_unit,
      'quantity_pieces',  v_qty_pieces,
      'unit_price_cfa',   v_unit.selling_price_cfa,
      'cost_price_cfa',   v_cost_price,
      'line_total_cfa',   v_line_total
    );

    v_product_qty_map := jsonb_set(
      v_product_qty_map,
      array[v_product.id::text],
      to_jsonb(v_already_acc + v_qty_pieces)
    );
  END LOOP;

  IF v_subtotal <= 0 THEN
    PERFORM private.raise_vhm_error('INVALID_CART',
      '{"reason": "subtotal_must_be_positive"}'::jsonb);
  END IF;

  IF p_discount_type = 'flat' THEN
    IF p_discount_value < 0 OR p_discount_value > v_subtotal THEN
      PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
        jsonb_build_object(
          'reason', 'flat_discount_out_of_range',
          'value', p_discount_value,
          'subtotal', v_subtotal
        ));
    END IF;
    v_discount_amount := p_discount_value;
  ELSIF p_discount_type = 'percent' THEN
    IF p_discount_value < 0 OR p_discount_value > 100 THEN
      PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
        jsonb_build_object(
          'reason', 'percent_discount_out_of_range',
          'value', p_discount_value
        ));
    END IF;
    v_discount_amount := round(v_subtotal * p_discount_value / 100, 2);
  ELSE
    v_discount_amount := 0;
  END IF;

  -- Calculated total (pre-override)
  v_total := greatest(0, v_subtotal - v_discount_amount);

  -- Authoritative final total (override if admin provided one)
  v_final_total := COALESCE(p_override_total_cfa, v_total);

  -- Cash arithmetic uses the final authoritative total
  v_amount_applied := least(p_amount_tendered_cfa, v_final_total);
  v_change_given   := p_amount_tendered_cfa - v_amount_applied;
  v_balance_added  := v_final_total - v_amount_applied;

  IF v_balance_added > 0 AND p_customer_id IS NULL THEN
    PERFORM private.raise_vhm_error('CUSTOMER_REQUIRED',
      '{"reason": "credit_sale_requires_named_customer"}'::jsonb);
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT * INTO v_customer
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
        jsonb_build_object('customer_id', p_customer_id));
    END IF;

    IF NOT v_customer.is_active THEN
      PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
        jsonb_build_object(
          'reason',      'customer_is_inactive',
          'customer_id', p_customer_id
        ));
    END IF;
  END IF;

  SELECT cfa_to_usd_rate INTO v_rate FROM public.business_settings LIMIT 1;

  v_receipt_number := v_depot.code || '-' || lpad(v_depot.receipt_seq::text, 8, '0');

  UPDATE public.depots
  SET receipt_seq = receipt_seq + 1
  WHERE id = v_effective_depot;

  INSERT INTO public.sales (
    depot_id, cashier_id, customer_id, shift_id,
    receipt_number, status, display_currency, cfa_to_usd_rate_used,
    subtotal_cfa, discount_type, discount_value, discount_amount_cfa,
    total_cfa, admin_override_total_cfa,
    amount_tendered_cfa, amount_applied_cfa,
    change_given_cfa, balance_added_cfa, idempotency_key
  ) VALUES (
    v_effective_depot, v_ctx.staff_id, p_customer_id, p_shift_id,
    v_receipt_number, 'completed', p_display_currency, coalesce(v_rate, 620),
    v_subtotal, p_discount_type, p_discount_value, v_discount_amount,
    v_total, p_override_total_cfa,
    p_amount_tendered_cfa, v_amount_applied,
    v_change_given, v_balance_added, p_idempotency_key
  )
  RETURNING id INTO v_sale_id;

  -- Write sale_items with discount pro-rated against CALCULATED total (v_total)
  -- so that line-level accounting is internally consistent.
  -- The override is an order-level adjustment; individual lines use catalog prices.
  v_idx        := 0;
  v_item_total := array_length(v_items_data, 1);

  FOREACH v_item_data IN ARRAY v_items_data
  LOOP
    v_idx := v_idx + 1;

    IF v_idx < v_item_total THEN
      v_net_line_total := round(
        (v_item_data->>'line_total_cfa')::numeric
        - round(
            ((v_item_data->>'line_total_cfa')::numeric / v_subtotal) * v_discount_amount,
            2
          ),
        2
      );
    ELSE
      -- Last item absorbs rounding residual (net lines sum to calculated v_total)
      v_net_line_total := v_total - v_net_sum_so_far;
    END IF;

    v_net_sum_so_far := v_net_sum_so_far + v_net_line_total;

    INSERT INTO public.sale_items (
      sale_id, product_id, unit_level,
      quantity_in_unit, quantity_pieces,
      unit_price_cfa, cost_price_cfa,
      line_total_cfa, net_line_total_cfa
    ) VALUES (
      v_sale_id,
      (v_item_data->>'product_id')::uuid,
      (v_item_data->>'unit_level')::smallint,
      (v_item_data->>'quantity_in_unit')::numeric,
      (v_item_data->>'quantity_pieces')::numeric,
      (v_item_data->>'unit_price_cfa')::numeric,
      (v_item_data->>'cost_price_cfa')::numeric,
      (v_item_data->>'line_total_cfa')::numeric,
      v_net_line_total
    );
  END LOOP;

  -- Update stock
  FOR v_prod_id IN
    SELECT key::uuid FROM jsonb_each_text(v_product_qty_map)
  LOOP
    v_agg_qty := (v_product_qty_map->>v_prod_id::text)::numeric;

    UPDATE public.products
    SET current_stock_pieces = current_stock_pieces - v_agg_qty
    WHERE id = v_prod_id;

    INSERT INTO public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by, metadata
    ) VALUES (
      v_effective_depot,
      v_prod_id,
      -v_agg_qty,
      'SALE',
      'sale',
      v_sale_id,
      v_ctx.staff_id,
      jsonb_build_object('sale_id', v_sale_id)
    );
  END LOOP;

  -- Customer payment record uses the final total amounts
  IF v_amount_applied > 0 AND p_customer_id IS NOT NULL THEN
    INSERT INTO public.payments (
      customer_id, sale_id, shift_id, payment_type,
      amount_cfa, recorded_by, note
    ) VALUES (
      p_customer_id,
      v_sale_id, p_shift_id, 'sale_payment',
      v_amount_applied, v_ctx.staff_id,
      'Cash payment at point of sale'
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- Customer balance uses final total
  IF v_balance_added > 0 THEN
    UPDATE public.customers
    SET balance_owed_cfa = balance_owed_cfa + v_balance_added
    WHERE id = p_customer_id;
  END IF;

  -- Phase 18C: enqueue print jobs
  PERFORM private.create_print_jobs_for_sale(v_sale_id);

  -- Audit: record both calculated total and override if applied
  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'complete_sale',
    p_entity_type := 'sale',
    p_entity_id   := v_sale_id,
    p_depot_id    := v_effective_depot,
    p_before_val  := null,
    p_after_val   := jsonb_build_object(
      'receipt_number',           v_receipt_number,
      'calculated_total_cfa',     v_total,
      'admin_override_total_cfa', p_override_total_cfa,
      'final_total_cfa',          v_final_total,
      'amount_applied_cfa',       v_amount_applied,
      'balance_added_cfa',        v_balance_added,
      'customer_id',              p_customer_id,
      'items_count',              array_length(v_items_data, 1),
      'override_actor',           CASE WHEN p_override_total_cfa IS NOT NULL
                                       THEN v_ctx.staff_id ELSE NULL END
    )
  );

  RETURN jsonb_build_object(
    'sale_id',                  v_sale_id,
    'receipt_number',           v_receipt_number,
    'subtotal_cfa',             v_subtotal,
    'discount_amount_cfa',      v_discount_amount,
    'total_cfa',                v_total,
    'admin_override_total_cfa', p_override_total_cfa,
    'amount_tendered_cfa',      p_amount_tendered_cfa,
    'amount_applied_cfa',       v_amount_applied,
    'change_given_cfa',         v_change_given,
    'balance_added_cfa',        v_balance_added,
    'customer_id',              p_customer_id,
    'payment_id',               v_payment_id,
    'idempotent',               false
  );

EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid, numeric) TO authenticated;

COMMENT ON FUNCTION public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid, numeric) IS
  'CEO Notes: adds p_override_total_cfa (admin-only). Authoritative total = COALESCE(override, calculated). Phase 18C print jobs preserved.';
