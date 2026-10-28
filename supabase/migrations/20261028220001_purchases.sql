-- ================================================================
-- Soft Gestion D: Achats (admin-only)
-- ================================================================
-- {depot.code}-BR-{8 digits} via depots.purchase_receipt_seq (never receipt_seq)
-- Validate: stock + WA L0 (0/null -> new) + Paye/A credit
-- Cancel validated blocked if stock would go < 0
-- Supplier payments: cash|mobile|bank — no shift
-- ================================================================

ALTER TABLE public.depots
  ADD COLUMN IF NOT EXISTS purchase_receipt_seq integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.depots.purchase_receipt_seq IS
  'Next BR sequence. Only incremented inside create/upsert purchase receipt RPCs (FOR UPDATE). Never touches receipt_seq.';

CREATE TABLE IF NOT EXISTS public.suppliers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  phone              text,
  address            text,
  balance_owed_cfa   numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance_owed_cfa >= 0),
  is_active          boolean NOT NULL DEFAULT true,
  created_by         uuid NOT NULL REFERENCES public.staff(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suppliers_name_idx ON public.suppliers (lower(name));
CREATE INDEX IF NOT EXISTS suppliers_active_idx ON public.suppliers (is_active);

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_id           uuid NOT NULL REFERENCES public.depots(id),
  supplier_id        uuid NOT NULL REFERENCES public.suppliers(id),
  number             text NOT NULL UNIQUE,
  status             text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validated', 'cancelled')),
  document_date      date NOT NULL DEFAULT (timezone('Africa/Abidjan', now()))::date,
  external_ref       text,
  notes              text,
  subtotal_cfa       numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_cfa >= 0),
  total_cfa          numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_cfa >= 0),
  payment_mode       text CHECK (payment_mode IS NULL OR payment_mode IN ('paid', 'credit')),
  payment_method     text CHECK (payment_method IS NULL OR payment_method IN ('cash', 'mobile', 'bank')),
  validated_at       timestamptz,
  validated_by       uuid REFERENCES public.staff(id),
  cancelled_at       timestamptz,
  cancelled_by       uuid REFERENCES public.staff(id),
  created_by         uuid NOT NULL REFERENCES public.staff(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_receipt_validated_consistency CHECK (
    (status = 'validated' AND validated_at IS NOT NULL AND payment_mode IS NOT NULL)
    OR (status <> 'validated')
  ),
  CONSTRAINT purchase_receipt_paid_method CHECK (
    payment_mode IS DISTINCT FROM 'paid' OR payment_method IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS purchase_receipts_depot_idx ON public.purchase_receipts (depot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_receipts_supplier_idx ON public.purchase_receipts (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_receipts_status_idx ON public.purchase_receipts (status);

CREATE TABLE IF NOT EXISTS public.purchase_receipt_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  product_id         uuid NOT NULL REFERENCES public.products(id),
  unit_level         smallint NOT NULL CHECK (unit_level >= 0 AND unit_level <= 2),
  quantity_in_unit   numeric(14,3) NOT NULL CHECK (quantity_in_unit > 0),
  quantity_pieces    numeric(14,3) NOT NULL CHECK (quantity_pieces > 0),
  unit_cost_cfa      numeric(14,2) NOT NULL CHECK (unit_cost_cfa >= 0),
  line_total_cfa     numeric(14,2) NOT NULL CHECK (line_total_cfa >= 0),
  product_name       text NOT NULL,
  unit_name          text NOT NULL,
  sort_index         integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS purchase_receipt_items_receipt_idx
  ON public.purchase_receipt_items (purchase_receipt_id);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        uuid NOT NULL REFERENCES public.suppliers(id),
  depot_id           uuid REFERENCES public.depots(id),
  purchase_receipt_id uuid REFERENCES public.purchase_receipts(id),
  amount_cfa         numeric(14,2) NOT NULL CHECK (amount_cfa > 0),
  method             text NOT NULL CHECK (method IN ('cash', 'mobile', 'bank')),
  note               text,
  recorded_by        uuid NOT NULL REFERENCES public.staff(id),
  recorded_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx
  ON public.supplier_payments (supplier_id, recorded_at DESC);

-- Allow purchase_receipt on inventory ledger
ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_reference_type_check;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_reference_type_check
  CHECK (reference_type IN (
    'sale','sale_return','void','stock_entry','inventory_adjustment','stock_transfer','purchase_receipt'
  ));

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_select_admin ON public.suppliers;
CREATE POLICY suppliers_select_admin ON public.suppliers FOR SELECT
  USING (public.is_current_staff_admin());

DROP POLICY IF EXISTS purchase_receipts_select_admin ON public.purchase_receipts;
CREATE POLICY purchase_receipts_select_admin ON public.purchase_receipts FOR SELECT
  USING (public.is_current_staff_admin());

DROP POLICY IF EXISTS purchase_receipt_items_select_admin ON public.purchase_receipt_items;
CREATE POLICY purchase_receipt_items_select_admin ON public.purchase_receipt_items FOR SELECT
  USING (public.is_current_staff_admin());

DROP POLICY IF EXISTS supplier_payments_select_admin ON public.supplier_payments;
CREATE POLICY supplier_payments_select_admin ON public.supplier_payments FOR SELECT
  USING (public.is_current_staff_admin());

REVOKE ALL ON public.suppliers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.purchase_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.purchase_receipt_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.supplier_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.suppliers TO authenticated;
GRANT SELECT ON public.purchase_receipts TO authenticated;
GRANT SELECT ON public.purchase_receipt_items TO authenticated;
GRANT SELECT ON public.supplier_payments TO authenticated;

CREATE OR REPLACE FUNCTION private.allocate_purchase_receipt_number(p_depot_id uuid)
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
  v_number := v_depot.code || '-BR-' || lpad(v_depot.purchase_receipt_seq::text, 8, '0');
  UPDATE public.depots SET purchase_receipt_seq = purchase_receipt_seq + 1 WHERE id = p_depot_id;
  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION private.allocate_purchase_receipt_number(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.apply_purchase_wa_cost(
  p_product_id uuid,
  p_qty_pieces numeric,
  p_cost_per_piece numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_l0 public.product_units%ROWTYPE;
  v_old_l0 numeric;
  v_new_l0 numeric;
  v_old_pieces numeric;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_l0 FROM public.product_units
  WHERE product_id = p_product_id AND unit_level = 0;
  IF NOT FOUND THEN RETURN; END IF;

  v_old_l0 := coalesce(v_l0.cost_price_cfa, 0);
  -- Stock BEFORE this receipt line is applied
  v_old_pieces := greatest(0, coalesce(v_product.current_stock_pieces, 0));

  IF v_old_l0 <= 0 OR v_old_pieces <= 0 THEN
    v_new_l0 := round(p_cost_per_piece, 2);
  ELSE
    v_new_l0 := round(
      (v_old_pieces * v_old_l0 + p_qty_pieces * p_cost_per_piece)
      / (v_old_pieces + p_qty_pieces),
      2
    );
  END IF;

  UPDATE public.product_units u
  SET cost_price_cfa = round(v_new_l0 * u.conversion_to_base, 2)
  WHERE u.product_id = p_product_id;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_purchase_wa_cost(uuid, numeric, numeric) FROM PUBLIC;

-- ─── suppliers ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_supplier(
  p_name text,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_id uuid;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'name_required'));
  END IF;
  INSERT INTO public.suppliers (name, phone, address, created_by)
  VALUES (
    btrim(p_name),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    v_ctx.staff_id
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.create_supplier(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_supplier(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_supplier(
  p_supplier_id uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_row public.suppliers%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT * INTO v_row FROM public.suppliers WHERE id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('supplier_id', p_supplier_id));
  END IF;
  UPDATE public.suppliers SET
    name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
    phone = CASE WHEN p_phone IS NULL THEN phone ELSE nullif(btrim(p_phone), '') END,
    address = CASE WHEN p_address IS NULL THEN address ELSE nullif(btrim(p_address), '') END,
    is_active = coalesce(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_supplier_id;
  RETURN jsonb_build_object('id', p_supplier_id, 'ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.update_supplier(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_supplier(uuid, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_suppliers(
  p_active_only boolean DEFAULT true,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_rows jsonb;
  v_count int;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT count(*) INTO v_count FROM public.suppliers s
  WHERE (NOT p_active_only OR s.is_active);
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT * FROM public.suppliers s
    WHERE (NOT p_active_only OR s.is_active)
    ORDER BY s.name
    LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) x;
  RETURN jsonb_build_object('rows', v_rows, 'count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.list_suppliers(boolean, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_suppliers(boolean, int, int) TO authenticated;

-- ─── upsert draft BR ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_purchase_receipt(
  p_depot_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_purchase_receipt_id uuid DEFAULT NULL,
  p_document_date date DEFAULT NULL,
  p_external_ref text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_id uuid;
  v_number text;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_unit public.product_units%ROWTYPE;
  v_qty numeric;
  v_cost numeric;
  v_pieces numeric;
  v_line numeric;
  v_subtotal numeric := 0;
  v_sort int := 0;
  v_existing public.purchase_receipts%ROWTYPE;
  v_doc date;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  IF p_depot_id IS NULL OR p_supplier_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'depot_and_supplier_required'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND is_active) THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('supplier_id', p_supplier_id));
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    PERFORM private.raise_vhm_error('INVALID_CART', jsonb_build_object('reason', 'items_required'));
  END IF;

  v_doc := coalesce(p_document_date, (timezone('Africa/Abidjan', now()))::date);
  IF v_doc > (timezone('Africa/Abidjan', now()))::date THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'document_date_in_future'));
  END IF;

  -- First pass validate + totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity_in_unit')::numeric;
    v_cost := coalesce((v_item->>'unit_cost_cfa')::numeric, 0);
    IF v_qty IS NULL OR v_qty <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_QUANTITY', jsonb_build_object('reason', 'quantity_must_be_positive'));
    END IF;
    IF v_cost < 0 THEN
      PERFORM private.raise_vhm_error('INVALID_PRICE', jsonb_build_object('reason', 'negative_cost'));
    END IF;
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    IF NOT FOUND OR v_product.depot_id IS DISTINCT FROM p_depot_id THEN
      PERFORM private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT', jsonb_build_object('product_id', v_item->>'product_id'));
    END IF;
    SELECT * INTO v_unit FROM public.product_units
    WHERE product_id = v_product.id AND unit_level = (v_item->>'unit_level')::smallint;
    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('INVALID_UNIT', jsonb_build_object('product_id', v_product.id));
    END IF;
    v_line := round(v_qty * v_cost, 2);
    v_subtotal := v_subtotal + v_line;
  END LOOP;

  IF p_purchase_receipt_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.purchase_receipts WHERE id = p_purchase_receipt_id FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('purchase_receipt_id', p_purchase_receipt_id));
    END IF;
    IF v_existing.status <> 'draft' THEN
      PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'only_draft_editable'));
    END IF;
    v_id := v_existing.id;
    v_number := v_existing.number;
    UPDATE public.purchase_receipts SET
      supplier_id = p_supplier_id,
      document_date = v_doc,
      external_ref = nullif(btrim(coalesce(p_external_ref, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      subtotal_cfa = v_subtotal,
      total_cfa = v_subtotal,
      updated_at = now()
    WHERE id = v_id;
    DELETE FROM public.purchase_receipt_items WHERE purchase_receipt_id = v_id;
  ELSE
    v_number := private.allocate_purchase_receipt_number(p_depot_id);
    INSERT INTO public.purchase_receipts (
      depot_id, supplier_id, number, status, document_date, external_ref, notes,
      subtotal_cfa, total_cfa, created_by
    ) VALUES (
      p_depot_id, p_supplier_id, v_number, 'draft', v_doc,
      nullif(btrim(coalesce(p_external_ref, '')), ''),
      nullif(btrim(coalesce(p_notes, '')), ''),
      v_subtotal, v_subtotal, v_ctx.staff_id
    ) RETURNING id INTO v_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_sort := v_sort + 1;
    v_qty := (v_item->>'quantity_in_unit')::numeric;
    v_cost := coalesce((v_item->>'unit_cost_cfa')::numeric, 0);
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    SELECT * INTO v_unit FROM public.product_units
    WHERE product_id = v_product.id AND unit_level = (v_item->>'unit_level')::smallint;
    v_pieces := v_qty * v_unit.conversion_to_base;
    v_line := round(v_qty * v_cost, 2);
    INSERT INTO public.purchase_receipt_items (
      purchase_receipt_id, product_id, unit_level, quantity_in_unit, quantity_pieces,
      unit_cost_cfa, line_total_cfa, product_name, unit_name, sort_index
    ) VALUES (
      v_id, v_product.id, v_unit.unit_level, v_qty, v_pieces,
      v_cost, v_line, v_product.name, v_unit.unit_name, v_sort
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_id, 'number', v_number, 'total_cfa', v_subtotal, 'status', 'draft');
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_purchase_receipt(uuid, uuid, jsonb, uuid, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_purchase_receipt(uuid, uuid, jsonb, uuid, date, text, text) TO authenticated;

-- ─── validate BR ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_purchase_receipt(
  p_purchase_receipt_id uuid,
  p_payment_mode text,
  p_payment_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_br public.purchase_receipts%ROWTYPE;
  v_item public.purchase_receipt_items%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_unit public.product_units%ROWTYPE;
  v_cost_per_piece numeric;
  v_entry_id uuid;
  v_pay_id uuid;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  IF p_payment_mode NOT IN ('paid', 'credit') THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'payment_mode_paid_or_credit'));
  END IF;
  IF p_payment_mode = 'paid' AND (p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'mobile', 'bank')) THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'payment_method_required_when_paid'));
  END IF;

  SELECT * INTO v_br FROM public.purchase_receipts WHERE id = p_purchase_receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('purchase_receipt_id', p_purchase_receipt_id));
  END IF;
  IF v_br.status = 'validated' THEN
    RETURN jsonb_build_object('id', v_br.id, 'number', v_br.number, 'status', 'validated', 'idempotent', true);
  END IF;
  IF v_br.status <> 'draft' THEN
    PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'only_draft_can_validate'));
  END IF;

  FOR v_item IN
    SELECT * FROM public.purchase_receipt_items
    WHERE purchase_receipt_id = v_br.id
    ORDER BY sort_index, id
  LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id FOR UPDATE;
    IF NOT FOUND OR v_product.depot_id IS DISTINCT FROM v_br.depot_id THEN
      PERFORM private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT', jsonb_build_object('product_id', v_item.product_id));
    END IF;
    SELECT * INTO v_unit FROM public.product_units
    WHERE product_id = v_item.product_id AND unit_level = v_item.unit_level;
    IF NOT FOUND OR v_unit.conversion_to_base <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_UNIT', jsonb_build_object('product_id', v_item.product_id));
    END IF;

    v_cost_per_piece := round(v_item.unit_cost_cfa / v_unit.conversion_to_base, 6);

    -- WA before stock increase (uses current stock as old_pieces)
    PERFORM private.apply_purchase_wa_cost(v_item.product_id, v_item.quantity_pieces, v_cost_per_piece);

    INSERT INTO public.stock_entries (
      product_id, depot_id, unit_level,
      quantity_in_unit, quantity_pieces,
      unit_cost_price_cfa, total_cost_cfa,
      note, entered_by
    ) VALUES (
      v_item.product_id, v_br.depot_id, v_item.unit_level,
      v_item.quantity_in_unit, v_item.quantity_pieces,
      v_cost_per_piece, v_item.line_total_cfa,
      'BR ' || v_br.number, v_ctx.staff_id
    ) RETURNING id INTO v_entry_id;

    UPDATE public.products
    SET current_stock_pieces = current_stock_pieces + v_item.quantity_pieces
    WHERE id = v_item.product_id;

    INSERT INTO public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by, metadata
    ) VALUES (
      v_br.depot_id, v_item.product_id, v_item.quantity_pieces,
      'RESTOCK', 'purchase_receipt', v_br.id,
      v_ctx.staff_id,
      jsonb_build_object(
        'purchase_receipt_item_id', v_item.id,
        'stock_entry_id', v_entry_id,
        'unit_level', v_item.unit_level,
        'quantity_in_unit', v_item.quantity_in_unit,
        'unit_cost_per_piece', v_cost_per_piece
      )
    );
  END LOOP;

  IF p_payment_mode = 'credit' THEN
    UPDATE public.suppliers
    SET balance_owed_cfa = balance_owed_cfa + v_br.total_cfa, updated_at = now()
    WHERE id = v_br.supplier_id;
  ELSE
    INSERT INTO public.supplier_payments (
      supplier_id, depot_id, purchase_receipt_id, amount_cfa, method, note, recorded_by
    ) VALUES (
      v_br.supplier_id, v_br.depot_id, v_br.id, v_br.total_cfa, p_payment_method,
      'BR ' || v_br.number || ' paye a la validation', v_ctx.staff_id
    ) RETURNING id INTO v_pay_id;
  END IF;

  UPDATE public.purchase_receipts SET
    status = 'validated',
    payment_mode = p_payment_mode,
    payment_method = CASE WHEN p_payment_mode = 'paid' THEN p_payment_method ELSE NULL END,
    validated_at = now(),
    validated_by = v_ctx.staff_id,
    updated_at = now()
  WHERE id = v_br.id;

  PERFORM private.write_audit(
    p_actor_id := v_ctx.staff_id,
    p_action := 'validate_purchase_receipt',
    p_entity_type := 'purchase_receipt',
    p_entity_id := v_br.id,
    p_depot_id := v_br.depot_id,
    p_before_val := jsonb_build_object('status', 'draft'),
    p_after_val := jsonb_build_object(
      'status', 'validated',
      'payment_mode', p_payment_mode,
      'total_cfa', v_br.total_cfa
    )
  );

  RETURN jsonb_build_object(
    'id', v_br.id,
    'number', v_br.number,
    'status', 'validated',
    'payment_mode', p_payment_mode,
    'supplier_payment_id', v_pay_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.validate_purchase_receipt(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_purchase_receipt(uuid, text, text) TO authenticated;

-- ─── cancel validated BR ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_purchase_receipt(p_purchase_receipt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_br public.purchase_receipts%ROWTYPE;
  v_item public.purchase_receipt_items%ROWTYPE;
  v_product public.products%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT * INTO v_br FROM public.purchase_receipts WHERE id = p_purchase_receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('purchase_receipt_id', p_purchase_receipt_id));
  END IF;
  IF v_br.status = 'cancelled' THEN
    RETURN jsonb_build_object('id', v_br.id, 'status', 'cancelled', 'idempotent', true);
  END IF;
  IF v_br.status = 'draft' THEN
    UPDATE public.purchase_receipts SET
      status = 'cancelled', cancelled_at = now(), cancelled_by = v_ctx.staff_id, updated_at = now()
    WHERE id = v_br.id;
    RETURN jsonb_build_object('id', v_br.id, 'status', 'cancelled');
  END IF;
  IF v_br.status <> 'validated' THEN
    PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'cannot_cancel'));
  END IF;

  -- Pre-check stock
  FOR v_item IN SELECT * FROM public.purchase_receipt_items WHERE purchase_receipt_id = v_br.id LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id FOR UPDATE;
    IF v_product.current_stock_pieces < v_item.quantity_pieces THEN
      PERFORM private.raise_vhm_error('INSUFFICIENT_STOCK', jsonb_build_object(
        'reason', 'cancel_would_make_stock_negative',
        'product_id', v_item.product_id,
        'stock', v_product.current_stock_pieces,
        'needed', v_item.quantity_pieces
      ));
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM public.purchase_receipt_items WHERE purchase_receipt_id = v_br.id LOOP
    UPDATE public.products
    SET current_stock_pieces = current_stock_pieces - v_item.quantity_pieces
    WHERE id = v_item.product_id;

    INSERT INTO public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by, metadata
    ) VALUES (
      v_br.depot_id, v_item.product_id, -v_item.quantity_pieces,
      'ADJUSTMENT', 'purchase_receipt', v_br.id,
      v_ctx.staff_id,
      jsonb_build_object('reason', 'cancel_purchase_receipt', 'purchase_receipt_item_id', v_item.id)
    );
  END LOOP;

  IF v_br.payment_mode = 'credit' THEN
    UPDATE public.suppliers
    SET balance_owed_cfa = greatest(0, balance_owed_cfa - v_br.total_cfa), updated_at = now()
    WHERE id = v_br.supplier_id;
  END IF;

  UPDATE public.purchase_receipts SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = v_ctx.staff_id,
    updated_at = now()
  WHERE id = v_br.id;

  RETURN jsonb_build_object('id', v_br.id, 'number', v_br.number, 'status', 'cancelled');
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_purchase_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_receipt(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_purchase_receipt(p_purchase_receipt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_br public.purchase_receipts%ROWTYPE;
  v_items jsonb;
  v_supplier jsonb;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT * INTO v_br FROM public.purchase_receipts WHERE id = p_purchase_receipt_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('purchase_receipt_id', p_purchase_receipt_id));
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.sort_index, i.id), '[]'::jsonb)
  INTO v_items FROM public.purchase_receipt_items i WHERE i.purchase_receipt_id = v_br.id;
  SELECT jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone, 'balance_owed_cfa', s.balance_owed_cfa)
  INTO v_supplier FROM public.suppliers s WHERE s.id = v_br.supplier_id;
  RETURN jsonb_build_object('receipt', to_jsonb(v_br), 'items', v_items, 'supplier', v_supplier);
END;
$$;
REVOKE ALL ON FUNCTION public.get_purchase_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_purchase_receipt(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_purchase_receipts(
  p_depot_id uuid DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
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
  v_rows jsonb;
  v_count int;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT count(*) INTO v_count
  FROM public.purchase_receipts r
  WHERE (p_depot_id IS NULL OR r.depot_id = p_depot_id)
    AND (p_supplier_id IS NULL OR r.supplier_id = p_supplier_id)
    AND (p_status IS NULL OR r.status = p_status);

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT r.*, s.name AS supplier_name
    FROM public.purchase_receipts r
    JOIN public.suppliers s ON s.id = r.supplier_id
    WHERE (p_depot_id IS NULL OR r.depot_id = p_depot_id)
      AND (p_supplier_id IS NULL OR r.supplier_id = p_supplier_id)
      AND (p_status IS NULL OR r.status = p_status)
    ORDER BY r.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) x;

  RETURN jsonb_build_object('rows', v_rows, 'count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.list_purchase_receipts(uuid, uuid, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_purchase_receipts(uuid, uuid, text, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_supplier_payment(
  p_supplier_id uuid,
  p_amount_cfa numeric,
  p_method text,
  p_note text DEFAULT NULL,
  p_depot_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_sup public.suppliers%ROWTYPE;
  v_id uuid;
  v_new_balance numeric;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  IF p_method NOT IN ('cash', 'mobile', 'bank') THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'method_cash_mobile_bank'));
  END IF;
  IF p_amount_cfa IS NULL OR p_amount_cfa <= 0 THEN
    PERFORM private.raise_vhm_error('INVALID_AMOUNT', jsonb_build_object('reason', 'amount_must_be_positive'));
  END IF;

  SELECT * INTO v_sup FROM public.suppliers WHERE id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('supplier_id', p_supplier_id));
  END IF;
  IF p_amount_cfa > v_sup.balance_owed_cfa + 0.01 THEN
    PERFORM private.raise_vhm_error('INVALID_AMOUNT', jsonb_build_object(
      'reason', 'exceeds_supplier_balance',
      'balance', v_sup.balance_owed_cfa,
      'amount', p_amount_cfa
    ));
  END IF;

  v_new_balance := greatest(0, round(v_sup.balance_owed_cfa - p_amount_cfa, 2));
  UPDATE public.suppliers SET balance_owed_cfa = v_new_balance, updated_at = now() WHERE id = v_sup.id;

  INSERT INTO public.supplier_payments (
    supplier_id, depot_id, amount_cfa, method, note, recorded_by
  ) VALUES (
    v_sup.id, p_depot_id, p_amount_cfa, p_method,
    nullif(btrim(coalesce(p_note, '')), ''), v_ctx.staff_id
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'supplier_id', v_sup.id,
    'amount_cfa', p_amount_cfa,
    'new_balance_owed_cfa', v_new_balance
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_supplier_payment(uuid, numeric, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(uuid, numeric, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_supplier_payments(
  p_supplier_id uuid DEFAULT NULL,
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
  v_rows jsonb;
  v_count int;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT count(*) INTO v_count FROM public.supplier_payments sp
  WHERE (p_supplier_id IS NULL OR sp.supplier_id = p_supplier_id);
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.recorded_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT sp.*, s.name AS supplier_name
    FROM public.supplier_payments sp
    JOIN public.suppliers s ON s.id = sp.supplier_id
    WHERE (p_supplier_id IS NULL OR sp.supplier_id = p_supplier_id)
    ORDER BY sp.recorded_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) x;
  RETURN jsonb_build_object('rows', v_rows, 'count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.list_supplier_payments(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_supplier_payments(uuid, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_report_purchases(
  p_depot_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_rows jsonb;
  v_totals jsonb;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.supplier_name), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      s.id AS supplier_id,
      s.name AS supplier_name,
      coalesce(sum(r.total_cfa) FILTER (WHERE r.status = 'validated'), 0) AS purchased_cfa,
      coalesce(sum(r.total_cfa) FILTER (WHERE r.status = 'validated' AND r.payment_mode = 'credit'), 0) AS credit_cfa,
      coalesce(sum(r.total_cfa) FILTER (WHERE r.status = 'validated' AND r.payment_mode = 'paid'), 0) AS paid_at_validate_cfa,
      count(*) FILTER (WHERE r.status = 'validated') AS receipt_count,
      s.balance_owed_cfa
    FROM public.suppliers s
    LEFT JOIN public.purchase_receipts r
      ON r.supplier_id = s.id
     AND (p_depot_id IS NULL OR r.depot_id = p_depot_id)
     AND (p_start_date IS NULL OR r.document_date >= p_start_date)
     AND (p_end_date IS NULL OR r.document_date <= p_end_date)
    WHERE (p_supplier_id IS NULL OR s.id = p_supplier_id)
    GROUP BY s.id, s.name, s.balance_owed_cfa
    HAVING count(*) FILTER (WHERE r.status = 'validated') > 0 OR s.balance_owed_cfa > 0
  ) x;

  SELECT jsonb_build_object(
    'purchased_cfa', coalesce(sum((row_el->>'purchased_cfa')::numeric), 0),
    'credit_cfa', coalesce(sum((row_el->>'credit_cfa')::numeric), 0),
    'paid_at_validate_cfa', coalesce(sum((row_el->>'paid_at_validate_cfa')::numeric), 0),
    'receipt_count', coalesce(sum((row_el->>'receipt_count')::numeric), 0)
  ) INTO v_totals
  FROM jsonb_array_elements(v_rows) AS row_el;

  RETURN jsonb_build_object('rows', v_rows, 'totals', v_totals);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_report_purchases(uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_report_purchases(uuid, date, date, uuid) TO authenticated;
