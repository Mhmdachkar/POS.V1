-- ================================================================
-- Soft Gestion C: Bons de livraison (multi BL / sale)
-- ================================================================
-- Number: {depot.code}-BL-{8 digits} via depots.delivery_note_seq (never receipt_seq)
-- Qty per line: sold - returned - already delivered; remaining = GREATEST(0, ...)
-- No stock / money / shift movement
-- ================================================================

ALTER TABLE public.depots
  ADD COLUMN IF NOT EXISTS delivery_note_seq integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.depots.delivery_note_seq IS
  'Next BL sequence. Only incremented inside create_delivery_note (FOR UPDATE). Never touches receipt_seq.';

CREATE TABLE IF NOT EXISTS public.delivery_notes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_id           uuid NOT NULL REFERENCES public.depots(id),
  sale_id            uuid NOT NULL REFERENCES public.sales(id),
  number             text NOT NULL UNIQUE,
  show_prices        boolean NOT NULL DEFAULT false,
  received_by_name   text,
  document_date      date NOT NULL DEFAULT (timezone('Africa/Abidjan', now()))::date,
  created_by         uuid NOT NULL REFERENCES public.staff(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_notes_sale_idx ON public.delivery_notes (sale_id, created_at DESC);
CREATE INDEX IF NOT EXISTS delivery_notes_depot_idx ON public.delivery_notes (depot_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.delivery_note_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id   uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  sale_item_id       uuid NOT NULL REFERENCES public.sale_items(id),
  product_id         uuid NOT NULL REFERENCES public.products(id),
  unit_level         smallint NOT NULL CHECK (unit_level >= 0 AND unit_level <= 2),
  quantity_in_unit   numeric(14,3) NOT NULL CHECK (quantity_in_unit > 0),
  unit_price_cfa     numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price_cfa >= 0),
  line_discount_cfa  numeric(14,2) NOT NULL DEFAULT 0 CHECK (line_discount_cfa >= 0),
  line_total_cfa     numeric(14,2) NOT NULL DEFAULT 0 CHECK (line_total_cfa >= 0),
  product_name       text NOT NULL,
  unit_name          text NOT NULL,
  serial_number      text,
  sort_index         integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS delivery_note_items_note_idx ON public.delivery_note_items (delivery_note_id);
CREATE INDEX IF NOT EXISTS delivery_note_items_sale_item_idx ON public.delivery_note_items (sale_item_id);

ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_notes_select_admin ON public.delivery_notes;
CREATE POLICY delivery_notes_select_admin ON public.delivery_notes FOR SELECT
  USING (public.is_current_staff_admin());

DROP POLICY IF EXISTS delivery_notes_select_cashier ON public.delivery_notes;
CREATE POLICY delivery_notes_select_cashier ON public.delivery_notes FOR SELECT
  USING (
    public.is_current_staff_cashier()
    AND depot_id = public.get_current_staff_depot_id()
  );

DROP POLICY IF EXISTS delivery_note_items_select_admin ON public.delivery_note_items;
CREATE POLICY delivery_note_items_select_admin ON public.delivery_note_items FOR SELECT
  USING (public.is_current_staff_admin());

DROP POLICY IF EXISTS delivery_note_items_select_cashier ON public.delivery_note_items;
CREATE POLICY delivery_note_items_select_cashier ON public.delivery_note_items FOR SELECT
  USING (
    public.is_current_staff_cashier()
    AND EXISTS (
      SELECT 1 FROM public.delivery_notes n
      WHERE n.id = delivery_note_id
        AND n.depot_id = public.get_current_staff_depot_id()
    )
  );

REVOKE ALL ON public.delivery_notes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.delivery_note_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.delivery_notes TO authenticated;
GRANT SELECT ON public.delivery_note_items TO authenticated;

CREATE OR REPLACE FUNCTION private.allocate_delivery_note_number(p_depot_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_depot public.depots%ROWTYPE;
  v_number text;
BEGIN
  SELECT * INTO v_depot FROM public.depots WHERE id = p_depot_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('depot_id', p_depot_id));
  END IF;
  v_number := v_depot.code || '-BL-' || lpad(v_depot.delivery_note_seq::text, 8, '0');
  UPDATE public.depots SET delivery_note_seq = delivery_note_seq + 1 WHERE id = p_depot_id;
  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION private.allocate_delivery_note_number(uuid) FROM PUBLIC;

-- Remaining deliverable qty (never negative after returns)
CREATE OR REPLACE FUNCTION private.sale_item_bl_remaining(p_sale_item_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_sold numeric;
  v_returned numeric;
  v_delivered numeric;
BEGIN
  SELECT si.quantity_in_unit INTO v_sold
  FROM public.sale_items si WHERE si.id = p_sale_item_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT coalesce(sum(sri.quantity_in_unit), 0) INTO v_returned
  FROM public.sale_return_items sri
  WHERE sri.sale_item_id = p_sale_item_id;

  SELECT coalesce(sum(dni.quantity_in_unit), 0) INTO v_delivered
  FROM public.delivery_note_items dni
  WHERE dni.sale_item_id = p_sale_item_id;

  RETURN greatest(0, v_sold - v_returned - v_delivered);
END;
$$;

REVOKE ALL ON FUNCTION private.sale_item_bl_remaining(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sale_delivery_remaining(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_sale public.sales%ROWTYPE;
  v_rows jsonb;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('sale_id', p_sale_id));
  END IF;
  IF v_ctx.role = 'cashier' AND v_sale.depot_id IS DISTINCT FROM v_ctx.depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'cashier_depot_only'));
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'sale_item_id', x.id,
    'product_id', x.product_id,
    'unit_level', x.unit_level,
    'product_name', x.product_name,
    'unit_name', x.unit_name,
    'sold_qty', x.sold_qty,
    'returned_qty', x.returned_qty,
    'delivered_qty', x.delivered_qty,
    'remaining_qty', x.remaining_qty,
    'unit_price_cfa', x.unit_price_cfa,
    'line_discount_cfa', x.line_discount_cfa,
    'line_total_cfa', x.line_total_cfa
  ) ORDER BY x.sort_key), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      si.id,
      si.product_id,
      si.unit_level,
      coalesce(p.name, '') AS product_name,
      coalesce(pu.unit_name, '') AS unit_name,
      si.quantity_in_unit AS sold_qty,
      coalesce((
        SELECT sum(sri.quantity_in_unit) FROM public.sale_return_items sri
        WHERE sri.sale_item_id = si.id
      ), 0) AS returned_qty,
      coalesce((
        SELECT sum(dni.quantity_in_unit) FROM public.delivery_note_items dni
        WHERE dni.sale_item_id = si.id
      ), 0) AS delivered_qty,
      private.sale_item_bl_remaining(si.id) AS remaining_qty,
      si.unit_price_cfa,
      coalesce(si.line_discount_cfa, 0) AS line_discount_cfa,
      coalesce(si.net_line_total_cfa, si.line_total_cfa) AS line_total_cfa,
      si.id AS sort_key
    FROM public.sale_items si
    LEFT JOIN public.products p ON p.id = si.product_id
    LEFT JOIN public.product_units pu
      ON pu.product_id = si.product_id AND pu.unit_level = si.unit_level
    WHERE si.sale_id = v_sale.id
  ) x;

  RETURN jsonb_build_object(
    'sale_id', v_sale.id,
    'receipt_number', v_sale.receipt_number,
    'status', v_sale.status,
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sale_delivery_remaining(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sale_delivery_remaining(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_delivery_note(
  p_sale_id uuid,
  p_show_prices boolean DEFAULT false,
  p_received_by_name text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
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

  -- Validate all lines before insert
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

    INSERT INTO public.delivery_note_items (
      delivery_note_id, sale_item_id, product_id, unit_level, quantity_in_unit,
      unit_price_cfa, line_discount_cfa, line_total_cfa,
      product_name, unit_name, serial_number, sort_index
    ) VALUES (
      v_id, v_sale_item.id, v_sale_item.product_id, v_sale_item.unit_level, v_qty,
      v_sale_item.unit_price_cfa,
      coalesce(v_sale_item.line_discount_cfa, 0),
      coalesce(v_sale_item.net_line_total_cfa, v_sale_item.line_total_cfa),
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

REVOKE ALL ON FUNCTION public.create_delivery_note(uuid, boolean, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_delivery_note(uuid, boolean, text, jsonb) TO authenticated;

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

  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.sort_index, i.id), '[]'::jsonb)
  INTO v_items
  FROM public.delivery_note_items i
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

REVOKE ALL ON FUNCTION public.get_delivery_note(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_delivery_note(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_delivery_notes_for_sale(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_sale public.sales%ROWTYPE;
  v_rows jsonb;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('sale_id', p_sale_id));
  END IF;
  IF v_ctx.role = 'cashier' AND v_sale.depot_id IS DISTINCT FROM v_ctx.depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'cashier_depot_only'));
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.delivery_notes n
  WHERE n.sale_id = v_sale.id;

  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.list_delivery_notes_for_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_delivery_notes_for_sale(uuid) TO authenticated;
