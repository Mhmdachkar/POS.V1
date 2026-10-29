-- BL line Montant = delivered qty x unit price - prorated line discount (not full sale line total).

CREATE OR REPLACE FUNCTION public.create_delivery_note(
  p_sale_id uuid,
  p_show_prices boolean DEFAULT false,
  p_received_by_name text DEFAULT NULL,
  p_items jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_sale public.sales%ROWTYPE;
  v_item jsonb;
  v_sale_item public.sale_items%ROWTYPE;
  v_remaining numeric;
  v_qty numeric;
  v_id uuid;
  v_number text;
  v_sort int := 0;
  v_product_name text;
  v_unit_name text;
  v_serial text;
  v_count int := 0;
  v_sale_qty numeric;
  v_prorated_discount numeric;
  v_line_total numeric;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('sale_id', p_sale_id));
  END IF;
  IF v_ctx.role = 'cashier' AND v_sale.depot_id IS DISTINCT FROM v_ctx.depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'cashier_depot_only'));
  END IF;
  IF v_sale.status = 'voided' THEN
    PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'sale_voided'));
  END IF;
  IF v_sale.status NOT IN ('completed', 'partially_returned') THEN
    PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'sale_not_deliverable'));
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    PERFORM private.raise_vhm_error('INVALID_CART', jsonb_build_object('reason', 'items_required'));
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity_in_unit')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_QUANTITY', jsonb_build_object('reason', 'quantity_must_be_positive'));
    END IF;
    SELECT * INTO v_sale_item FROM public.sale_items
    WHERE id = (v_item->>'sale_item_id')::uuid AND sale_id = v_sale.id;
    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('sale_item_id', v_item->>'sale_item_id'));
    END IF;
    v_remaining := private.sale_item_bl_remaining(v_sale_item.id);
    IF v_qty > v_remaining + 0.0001 THEN
      PERFORM private.raise_vhm_error('INVALID_QUANTITY', jsonb_build_object(
        'reason', 'exceeds_bl_remaining',
        'sale_item_id', v_sale_item.id,
        'remaining', v_remaining,
        'requested', v_qty
      ));
    END IF;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    PERFORM private.raise_vhm_error('INVALID_CART', jsonb_build_object('reason', 'items_required'));
  END IF;

  v_number := private.allocate_delivery_note_number(v_sale.depot_id);

  INSERT INTO public.delivery_notes (
    depot_id, sale_id, number, show_prices, received_by_name, created_by
  ) VALUES (
    v_sale.depot_id, v_sale.id, v_number, coalesce(p_show_prices, false),
    nullif(btrim(coalesce(p_received_by_name, '')), ''),
    v_ctx.staff_id
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sort := v_sort + 1;
    v_qty := (v_item->>'quantity_in_unit')::numeric;
    SELECT * INTO v_sale_item FROM public.sale_items
    WHERE id = (v_item->>'sale_item_id')::uuid;

    SELECT p.name, pu.unit_name, pu.serial_number
    INTO v_product_name, v_unit_name, v_serial
    FROM public.products p
    LEFT JOIN public.product_units pu
      ON pu.product_id = p.id AND pu.unit_level = v_sale_item.unit_level
    WHERE p.id = v_sale_item.product_id;

    v_sale_qty := greatest(v_sale_item.quantity_in_unit, 0);
    IF v_sale_qty > 0 THEN
      v_prorated_discount := round(
        coalesce(v_sale_item.line_discount_cfa, 0) * (v_qty / v_sale_qty),
        2
      );
    ELSE
      v_prorated_discount := 0;
    END IF;
    v_line_total := round(v_qty * v_sale_item.unit_price_cfa - v_prorated_discount, 2);

    INSERT INTO public.delivery_note_items (
      delivery_note_id, sale_item_id, product_id, unit_level, quantity_in_unit,
      unit_price_cfa, line_discount_cfa, line_total_cfa,
      product_name, unit_name, serial_number, sort_index
    ) VALUES (
      v_id, v_sale_item.id, v_sale_item.product_id, v_sale_item.unit_level, v_qty,
      v_sale_item.unit_price_cfa,
      v_prorated_discount,
      v_line_total,
      coalesce(v_product_name, ''),
      coalesce(v_unit_name, ''),
      v_serial,
      v_sort
    );
  END LOOP;

  PERFORM private.write_audit(
    p_actor_id := v_ctx.staff_id,
    p_action := 'create_delivery_note',
    p_entity_type := 'delivery_note',
    p_entity_id := v_id,
    p_depot_id := v_sale.depot_id,
    p_before_val := NULL,
    p_after_val := jsonb_build_object('number', v_number, 'sale_id', v_sale.id, 'show_prices', coalesce(p_show_prices, false))
  );

  RETURN jsonb_build_object('id', v_id, 'number', v_number, 'sale_id', v_sale.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_delivery_note(p_delivery_note_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_note public.delivery_notes%ROWTYPE;
  v_items jsonb;
  v_sale public.sales%ROWTYPE;
  v_customer jsonb;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  SELECT * INTO v_note FROM public.delivery_notes WHERE id = p_delivery_note_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('delivery_note_id', p_delivery_note_id));
  END IF;
  IF v_ctx.role = 'cashier' AND v_note.depot_id IS DISTINCT FROM v_ctx.depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'cashier_depot_only'));
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = v_note.sale_id;

  SELECT coalesce(
    jsonb_agg(
      to_jsonb(i) || jsonb_build_object(
        'sale_quantity_in_unit', si.quantity_in_unit,
        'sale_line_discount_cfa', coalesce(si.line_discount_cfa, 0),
        'line_discount_cfa',
          CASE WHEN si.quantity_in_unit > 0 THEN
            round(coalesce(si.line_discount_cfa, 0) * (i.quantity_in_unit / si.quantity_in_unit), 2)
          ELSE 0 END,
        'line_total_cfa',
          round(
            i.quantity_in_unit * i.unit_price_cfa
            - CASE WHEN si.quantity_in_unit > 0 THEN
                round(coalesce(si.line_discount_cfa, 0) * (i.quantity_in_unit / si.quantity_in_unit), 2)
              ELSE 0 END,
            2
          )
      )
      ORDER BY i.sort_index, i.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.delivery_note_items i
  JOIN public.sale_items si ON si.id = i.sale_item_id
  WHERE i.delivery_note_id = v_note.id;

  IF v_sale.customer_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address
    ) INTO v_customer
    FROM public.customers c WHERE c.id = v_sale.customer_id;
  ELSE
    v_customer := NULL;
  END IF;

  RETURN jsonb_build_object(
    'note', to_jsonb(v_note),
    'items', v_items,
    'receipt_number', v_sale.receipt_number,
    'customer', v_customer
  );
END;
$$;
