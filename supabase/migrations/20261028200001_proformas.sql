-- ================================================================
-- Soft Gestion B: Proformas (quote) — no stock/money/shift movement
-- ================================================================
-- Number: {depot.code}-PRO-{8 digits} via depots.proforma_seq (never receipt_seq)
-- Statuses: draft | sent | converted | cancelled
-- ================================================================

ALTER TABLE public.depots
  ADD COLUMN IF NOT EXISTS proforma_seq integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.depots.proforma_seq IS
  'Next proforma sequence. Only incremented inside create/duplicate proforma RPCs (FOR UPDATE). Never touches receipt_seq.';

CREATE TABLE IF NOT EXISTS public.proformas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_id           uuid NOT NULL REFERENCES public.depots(id),
  number             text NOT NULL UNIQUE,
  status             text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'converted', 'cancelled')),
  customer_id        uuid REFERENCES public.customers(id),
  document_date      date NOT NULL DEFAULT (timezone('Africa/Abidjan', now()))::date,
  external_ref       text,
  notes              text,
  subtotal_cfa       numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_cfa >= 0),
  discount_type      text CHECK (discount_type IS NULL OR discount_type IN ('flat', 'percent')),
  discount_value     numeric(14,2) CHECK (discount_value IS NULL OR discount_value >= 0),
  discount_amount_cfa numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount_cfa >= 0),
  total_cfa          numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_cfa >= 0),
  converted_sale_id  uuid UNIQUE REFERENCES public.sales(id),
  created_by         uuid NOT NULL REFERENCES public.staff(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proforma_discount_consistency CHECK (
    (discount_type IS NULL AND discount_value IS NULL)
    OR (discount_type IS NOT NULL AND discount_value IS NOT NULL)
  ),
  CONSTRAINT proforma_converted_consistency CHECK (
    (status = 'converted' AND converted_sale_id IS NOT NULL)
    OR (status <> 'converted' AND converted_sale_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS proformas_depot_created_idx ON public.proformas (depot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proformas_status_idx ON public.proformas (status);
CREATE INDEX IF NOT EXISTS proformas_customer_idx ON public.proformas (customer_id);

CREATE TABLE IF NOT EXISTS public.proforma_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id        uuid NOT NULL REFERENCES public.proformas(id) ON DELETE CASCADE,
  product_id         uuid NOT NULL REFERENCES public.products(id),
  unit_level         smallint NOT NULL CHECK (unit_level >= 0 AND unit_level <= 2),
  quantity_in_unit   numeric(14,3) NOT NULL CHECK (quantity_in_unit > 0),
  unit_price_cfa     numeric(14,2) NOT NULL CHECK (unit_price_cfa >= 0),
  line_discount_cfa  numeric(14,2) NOT NULL DEFAULT 0 CHECK (line_discount_cfa >= 0),
  line_total_cfa     numeric(14,2) NOT NULL CHECK (line_total_cfa >= 0),
  cost_price_cfa     numeric(14,2) NOT NULL DEFAULT 0 CHECK (cost_price_cfa >= 0),
  product_name       text NOT NULL,
  unit_name          text NOT NULL,
  serial_number      text,
  sort_index         integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS proforma_items_proforma_idx ON public.proforma_items (proforma_id);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS proforma_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_proforma_id_fkey'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_proforma_id_fkey
      FOREIGN KEY (proforma_id) REFERENCES public.proformas(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_proforma_id_unique'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_proforma_id_unique UNIQUE (proforma_id);
  END IF;
END $$;

COMMENT ON COLUMN public.sales.proforma_id IS
  'Optional source proforma. At most one sale per proforma.';

ALTER TABLE public.proformas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proforma_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proformas_select_admin ON public.proformas;
CREATE POLICY proformas_select_admin ON public.proformas FOR SELECT
  USING (public.is_current_staff_admin());

DROP POLICY IF EXISTS proformas_select_cashier ON public.proformas;
CREATE POLICY proformas_select_cashier ON public.proformas FOR SELECT
  USING (
    public.is_current_staff_cashier()
    AND depot_id = public.get_current_staff_depot_id()
  );

DROP POLICY IF EXISTS proforma_items_select_admin ON public.proforma_items;
CREATE POLICY proforma_items_select_admin ON public.proforma_items FOR SELECT
  USING (public.is_current_staff_admin());

DROP POLICY IF EXISTS proforma_items_select_cashier ON public.proforma_items;
CREATE POLICY proforma_items_select_cashier ON public.proforma_items FOR SELECT
  USING (
    public.is_current_staff_cashier()
    AND EXISTS (
      SELECT 1 FROM public.proformas p
      WHERE p.id = proforma_id
        AND p.depot_id = public.get_current_staff_depot_id()
    )
  );

-- Mutations only via SECURITY DEFINER RPCs
REVOKE ALL ON public.proformas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.proforma_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.proformas TO authenticated;
GRANT SELECT ON public.proforma_items TO authenticated;

CREATE OR REPLACE FUNCTION private.allocate_proforma_number(p_depot_id uuid)
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
  v_number := v_depot.code || '-PRO-' || lpad(v_depot.proforma_seq::text, 8, '0');
  UPDATE public.depots SET proforma_seq = proforma_seq + 1 WHERE id = p_depot_id;
  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION private.allocate_proforma_number(uuid) FROM PUBLIC;


-- ─── create_proforma ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_proforma(
  p_depot_id      uuid,
  p_customer_id   uuid DEFAULT NULL,
  p_document_date date DEFAULT NULL,
  p_external_ref  text DEFAULT NULL,
  p_notes         text DEFAULT NULL,
  p_discount_type text DEFAULT NULL,
  p_discount_value numeric DEFAULT NULL,
  p_items         jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_depot_id uuid;
  v_number text;
  v_id uuid;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_unit public.product_units%ROWTYPE;
  v_unit_price numeric;
  v_line_discount numeric;
  v_qty numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_total numeric := 0;
  v_doc_date date;
  v_sort int := 0;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  v_depot_id := coalesce(p_depot_id, v_ctx.depot_id);
  IF v_depot_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'depot_required'));
  END IF;
  IF v_ctx.role = 'cashier' AND v_depot_id IS DISTINCT FROM v_ctx.depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'cashier_depot_only'));
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    PERFORM private.raise_vhm_error('INVALID_CART', jsonb_build_object('reason', 'items_required'));
  END IF;

  v_doc_date := coalesce(p_document_date, (timezone('Africa/Abidjan', now()))::date);
  IF v_doc_date > (timezone('Africa/Abidjan', now()))::date THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'document_date_in_future'));
  END IF;

  v_number := private.allocate_proforma_number(v_depot_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity_in_unit')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_QUANTITY', jsonb_build_object('reason', 'quantity_must_be_positive'));
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    IF NOT FOUND OR v_product.depot_id IS DISTINCT FROM v_depot_id THEN
      PERFORM private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT', jsonb_build_object('product_id', v_item->>'product_id'));
    END IF;
    IF NOT v_product.is_active THEN
      PERFORM private.raise_vhm_error('PRODUCT_INACTIVE', jsonb_build_object('product_id', v_product.id));
    END IF;

    SELECT * INTO v_unit FROM public.product_units
    WHERE product_id = v_product.id AND unit_level = (v_item->>'unit_level')::smallint;
    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('INVALID_UNIT', jsonb_build_object('product_id', v_product.id));
    END IF;

    v_unit_price := v_unit.selling_price_cfa;
    v_line_discount := 0;
    IF v_ctx.role = 'admin' THEN
      IF (v_item ? 'unit_price_cfa') AND (v_item->>'unit_price_cfa') IS NOT NULL THEN
        v_unit_price := (v_item->>'unit_price_cfa')::numeric;
      END IF;
      IF (v_item ? 'line_discount_cfa') AND (v_item->>'line_discount_cfa') IS NOT NULL THEN
        v_line_discount := coalesce((v_item->>'line_discount_cfa')::numeric, 0);
      END IF;
    END IF;
    IF v_unit_price < 0 OR v_line_discount < 0 THEN
      PERFORM private.raise_vhm_error('INVALID_PRICE', jsonb_build_object('reason', 'negative_not_allowed'));
    END IF;
    IF v_line_discount > round(v_qty * v_unit_price, 2) THEN
      PERFORM private.raise_vhm_error('INVALID_DISCOUNT', jsonb_build_object('reason', 'line_discount_exceeds_line_gross'));
    END IF;
    v_line_total := round(v_qty * v_unit_price, 2) - v_line_discount;
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  IF p_discount_type = 'flat' THEN
    IF p_discount_value IS NULL OR p_discount_value < 0 OR p_discount_value > v_subtotal THEN
      PERFORM private.raise_vhm_error('INVALID_DISCOUNT', jsonb_build_object('reason', 'flat_out_of_range'));
    END IF;
    v_discount_amount := p_discount_value;
  ELSIF p_discount_type = 'percent' THEN
    IF p_discount_value IS NULL OR p_discount_value < 0 OR p_discount_value > 100 THEN
      PERFORM private.raise_vhm_error('INVALID_DISCOUNT', jsonb_build_object('reason', 'percent_out_of_range'));
    END IF;
    v_discount_amount := round(v_subtotal * p_discount_value / 100, 2);
  ELSE
    v_discount_amount := 0;
  END IF;
  v_total := greatest(0, v_subtotal - v_discount_amount);

  INSERT INTO public.proformas (
    depot_id, number, status, customer_id, document_date, external_ref, notes,
    subtotal_cfa, discount_type, discount_value, discount_amount_cfa, total_cfa, created_by
  ) VALUES (
    v_depot_id, v_number, 'draft', p_customer_id, v_doc_date,
    nullif(btrim(coalesce(p_external_ref, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_subtotal, p_discount_type, p_discount_value, v_discount_amount, v_total, v_ctx.staff_id
  ) RETURNING id INTO v_id;

  -- second pass insert items (same rules)
  v_sort := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sort := v_sort + 1;
    v_qty := (v_item->>'quantity_in_unit')::numeric;
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    SELECT * INTO v_unit FROM public.product_units
    WHERE product_id = v_product.id AND unit_level = (v_item->>'unit_level')::smallint;
    v_unit_price := v_unit.selling_price_cfa;
    v_line_discount := 0;
    IF v_ctx.role = 'admin' THEN
      IF (v_item ? 'unit_price_cfa') AND (v_item->>'unit_price_cfa') IS NOT NULL THEN
        v_unit_price := (v_item->>'unit_price_cfa')::numeric;
      END IF;
      IF (v_item ? 'line_discount_cfa') AND (v_item->>'line_discount_cfa') IS NOT NULL THEN
        v_line_discount := coalesce((v_item->>'line_discount_cfa')::numeric, 0);
      END IF;
    END IF;
    v_line_total := round(v_qty * v_unit_price, 2) - v_line_discount;
    INSERT INTO public.proforma_items (
      proforma_id, product_id, unit_level, quantity_in_unit,
      unit_price_cfa, line_discount_cfa, line_total_cfa, cost_price_cfa,
      product_name, unit_name, serial_number, sort_index
    ) VALUES (
      v_id, v_product.id, v_unit.unit_level, v_qty,
      v_unit_price, v_line_discount, v_line_total, v_unit.cost_price_cfa,
      v_product.name, v_unit.unit_name, v_unit.serial_number, v_sort
    );
  END LOOP;

  PERFORM private.write_audit(
    p_actor_id := v_ctx.staff_id,
    p_action := 'create_proforma',
    p_entity_type := 'proforma',
    p_entity_id := v_id,
    p_depot_id := v_depot_id,
    p_before_val := NULL,
    p_after_val := jsonb_build_object('number', v_number, 'total_cfa', v_total)
  );

  RETURN jsonb_build_object('id', v_id, 'number', v_number, 'total_cfa', v_total, 'status', 'draft');
END;
$$;

REVOKE ALL ON FUNCTION public.create_proforma(uuid, uuid, date, text, text, text, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_proforma(uuid, uuid, date, text, text, text, numeric, jsonb) TO authenticated;

-- ─── update_proforma (draft/sent only; not converted/cancelled) ───
CREATE OR REPLACE FUNCTION public.update_proforma(
  p_proforma_id   uuid,
  p_customer_id   uuid DEFAULT NULL,
  p_document_date date DEFAULT NULL,
  p_external_ref  text DEFAULT NULL,
  p_notes         text DEFAULT NULL,
  p_discount_type text DEFAULT NULL,
  p_discount_value numeric DEFAULT NULL,
  p_items         jsonb DEFAULT NULL,
  p_clear_customer boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_pf public.proformas%ROWTYPE;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_unit public.product_units%ROWTYPE;
  v_unit_price numeric;
  v_line_discount numeric;
  v_qty numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_total numeric := 0;
  v_sort int := 0;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  SELECT * INTO v_pf FROM public.proformas WHERE id = p_proforma_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('proforma_id', p_proforma_id));
  END IF;
  IF v_ctx.role = 'cashier' AND v_pf.depot_id IS DISTINCT FROM v_ctx.depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'cashier_depot_only'));
  END IF;
  IF v_pf.status IN ('converted', 'cancelled') THEN
    PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'proforma_not_editable', 'status', v_pf.status));
  END IF;

  IF p_items IS NOT NULL THEN
    IF jsonb_array_length(p_items) = 0 THEN
      PERFORM private.raise_vhm_error('INVALID_CART', jsonb_build_object('reason', 'items_required'));
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_qty := (v_item->>'quantity_in_unit')::numeric;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        PERFORM private.raise_vhm_error('INVALID_QUANTITY', jsonb_build_object('reason', 'quantity_must_be_positive'));
      END IF;
      SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
      IF NOT FOUND OR v_product.depot_id IS DISTINCT FROM v_pf.depot_id THEN
        PERFORM private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT', jsonb_build_object('product_id', v_item->>'product_id'));
      END IF;
      SELECT * INTO v_unit FROM public.product_units
      WHERE product_id = v_product.id AND unit_level = (v_item->>'unit_level')::smallint;
      IF NOT FOUND THEN
        PERFORM private.raise_vhm_error('INVALID_UNIT', jsonb_build_object('product_id', v_product.id));
      END IF;
      v_unit_price := v_unit.selling_price_cfa;
      v_line_discount := 0;
      IF v_ctx.role = 'admin' THEN
        IF (v_item ? 'unit_price_cfa') AND (v_item->>'unit_price_cfa') IS NOT NULL THEN
          v_unit_price := (v_item->>'unit_price_cfa')::numeric;
        END IF;
        IF (v_item ? 'line_discount_cfa') AND (v_item->>'line_discount_cfa') IS NOT NULL THEN
          v_line_discount := coalesce((v_item->>'line_discount_cfa')::numeric, 0);
        END IF;
      END IF;
      v_line_total := round(v_qty * v_unit_price, 2) - v_line_discount;
      IF v_line_total < 0 THEN
        PERFORM private.raise_vhm_error('INVALID_AMOUNT', jsonb_build_object('reason', 'line_total_negative'));
      END IF;
      v_subtotal := v_subtotal + v_line_total;
    END LOOP;

    IF p_discount_type = 'flat' THEN
      v_discount_amount := coalesce(p_discount_value, 0);
    ELSIF p_discount_type = 'percent' THEN
      v_discount_amount := round(v_subtotal * coalesce(p_discount_value, 0) / 100, 2);
    ELSE
      v_discount_amount := 0;
    END IF;
    v_total := greatest(0, v_subtotal - v_discount_amount);

    DELETE FROM public.proforma_items WHERE proforma_id = v_pf.id;
    v_sort := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_sort := v_sort + 1;
      v_qty := (v_item->>'quantity_in_unit')::numeric;
      SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
      SELECT * INTO v_unit FROM public.product_units
      WHERE product_id = v_product.id AND unit_level = (v_item->>'unit_level')::smallint;
      v_unit_price := v_unit.selling_price_cfa;
      v_line_discount := 0;
      IF v_ctx.role = 'admin' THEN
        IF (v_item ? 'unit_price_cfa') AND (v_item->>'unit_price_cfa') IS NOT NULL THEN
          v_unit_price := (v_item->>'unit_price_cfa')::numeric;
        END IF;
        IF (v_item ? 'line_discount_cfa') AND (v_item->>'line_discount_cfa') IS NOT NULL THEN
          v_line_discount := coalesce((v_item->>'line_discount_cfa')::numeric, 0);
        END IF;
      END IF;
      v_line_total := round(v_qty * v_unit_price, 2) - v_line_discount;
      INSERT INTO public.proforma_items (
        proforma_id, product_id, unit_level, quantity_in_unit,
        unit_price_cfa, line_discount_cfa, line_total_cfa, cost_price_cfa,
        product_name, unit_name, serial_number, sort_index
      ) VALUES (
        v_pf.id, v_product.id, v_unit.unit_level, v_qty,
        v_unit_price, v_line_discount, v_line_total, v_unit.cost_price_cfa,
        v_product.name, v_unit.unit_name, v_unit.serial_number, v_sort
      );
    END LOOP;

    UPDATE public.proformas SET
      subtotal_cfa = v_subtotal,
      discount_type = p_discount_type,
      discount_value = p_discount_value,
      discount_amount_cfa = v_discount_amount,
      total_cfa = v_total,
      updated_at = now()
    WHERE id = v_pf.id;
  END IF;

  UPDATE public.proformas SET
    customer_id = CASE WHEN p_clear_customer THEN NULL ELSE coalesce(p_customer_id, customer_id) END,
    document_date = coalesce(p_document_date, document_date),
    external_ref = CASE WHEN p_external_ref IS NULL THEN external_ref ELSE nullif(btrim(p_external_ref), '') END,
    notes = CASE WHEN p_notes IS NULL THEN notes ELSE nullif(btrim(p_notes), '') END,
    updated_at = now()
  WHERE id = v_pf.id;

  RETURN jsonb_build_object('id', v_pf.id, 'number', v_pf.number, 'ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_proforma(uuid, uuid, date, text, text, text, numeric, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_proforma(uuid, uuid, date, text, text, text, numeric, jsonb, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_proforma_status(
  p_proforma_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_pf public.proformas%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  SELECT * INTO v_pf FROM public.proformas WHERE id = p_proforma_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('proforma_id', p_proforma_id));
  END IF;
  IF v_ctx.role = 'cashier' AND v_pf.depot_id IS DISTINCT FROM v_ctx.depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'cashier_depot_only'));
  END IF;
  IF p_status NOT IN ('sent', 'cancelled') THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'status_must_be_sent_or_cancelled'));
  END IF;
  IF v_pf.status = 'converted' THEN
    PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'already_converted'));
  END IF;
  IF v_pf.status = 'cancelled' AND p_status = 'sent' THEN
    PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'cancelled_cannot_send'));
  END IF;
  IF p_status = 'cancelled' AND v_pf.status = 'converted' THEN
    PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'converted_cannot_cancel'));
  END IF;

  UPDATE public.proformas SET status = p_status, updated_at = now() WHERE id = v_pf.id;
  RETURN jsonb_build_object('id', v_pf.id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.set_proforma_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_proforma_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.duplicate_proforma(p_proforma_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_pf public.proformas%ROWTYPE;
  v_number text;
  v_id uuid;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  SELECT * INTO v_pf FROM public.proformas WHERE id = p_proforma_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('proforma_id', p_proforma_id));
  END IF;
  IF v_ctx.role = 'cashier' AND v_pf.depot_id IS DISTINCT FROM v_ctx.depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'cashier_depot_only'));
  END IF;

  v_number := private.allocate_proforma_number(v_pf.depot_id);
  INSERT INTO public.proformas (
    depot_id, number, status, customer_id, document_date, external_ref, notes,
    subtotal_cfa, discount_type, discount_value, discount_amount_cfa, total_cfa, created_by
  ) VALUES (
    v_pf.depot_id, v_number, 'draft', v_pf.customer_id,
    (timezone('Africa/Abidjan', now()))::date, v_pf.external_ref, v_pf.notes,
    v_pf.subtotal_cfa, v_pf.discount_type, v_pf.discount_value, v_pf.discount_amount_cfa, v_pf.total_cfa,
    v_ctx.staff_id
  ) RETURNING id INTO v_id;

  INSERT INTO public.proforma_items (
    proforma_id, product_id, unit_level, quantity_in_unit,
    unit_price_cfa, line_discount_cfa, line_total_cfa, cost_price_cfa,
    product_name, unit_name, serial_number, sort_index
  )
  SELECT v_id, product_id, unit_level, quantity_in_unit,
    unit_price_cfa, line_discount_cfa, line_total_cfa, cost_price_cfa,
    product_name, unit_name, serial_number, sort_index
  FROM public.proforma_items WHERE proforma_id = v_pf.id;

  RETURN jsonb_build_object('id', v_id, 'number', v_number, 'status', 'draft');
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_proforma(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duplicate_proforma(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_proforma(p_proforma_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_pf public.proformas%ROWTYPE;
  v_items jsonb;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  SELECT * INTO v_pf FROM public.proformas WHERE id = p_proforma_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('proforma_id', p_proforma_id));
  END IF;
  IF v_ctx.role = 'cashier' AND v_pf.depot_id IS DISTINCT FROM v_ctx.depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'cashier_depot_only'));
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.sort_index, i.id), '[]'::jsonb)
  INTO v_items
  FROM public.proforma_items i
  WHERE i.proforma_id = v_pf.id;

  RETURN jsonb_build_object('proforma', to_jsonb(v_pf), 'items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_proforma(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_proforma(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_proformas(
  p_depot_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_depot uuid;
  v_rows jsonb;
  v_count int;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  v_depot := CASE
    WHEN v_ctx.role = 'cashier' THEN v_ctx.depot_id
    ELSE p_depot_id
  END;

  SELECT count(*) INTO v_count
  FROM public.proformas p
  WHERE (v_depot IS NULL OR p.depot_id = v_depot)
    AND (p_status IS NULL OR p.status = p_status);

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT p.*
    FROM public.proformas p
    WHERE (v_depot IS NULL OR p.depot_id = v_depot)
      AND (p_status IS NULL OR p.status = p_status)
    ORDER BY p.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) x;

  RETURN jsonb_build_object('rows', v_rows, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.list_proformas(uuid, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_proformas(uuid, text, int, int) TO authenticated;

-- Mark converted (called from complete_sale when p_proforma_id set)
CREATE OR REPLACE FUNCTION private.mark_proforma_converted(
  p_proforma_id uuid,
  p_sale_id uuid,
  p_depot_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_pf public.proformas%ROWTYPE;
BEGIN
  SELECT * INTO v_pf FROM public.proformas WHERE id = p_proforma_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('proforma_id', p_proforma_id));
  END IF;
  IF v_pf.depot_id IS DISTINCT FROM p_depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'proforma_depot_mismatch'));
  END IF;
  IF v_pf.status = 'converted' THEN
    PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'proforma_already_converted'));
  END IF;
  IF v_pf.status = 'cancelled' THEN
    PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'proforma_cancelled'));
  END IF;
  UPDATE public.proformas
  SET status = 'converted', converted_sale_id = p_sale_id, updated_at = now()
  WHERE id = p_proforma_id;
END;
$$;

REVOKE ALL ON FUNCTION private.mark_proforma_converted(uuid, uuid, uuid) FROM PUBLIC;
