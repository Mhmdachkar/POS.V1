-- Retest polish: supplier RGF print queue + richer supplier/BR audit.

ALTER TABLE public.print_jobs ALTER COLUMN sale_id DROP NOT NULL;

ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS supplier_payment_id uuid
  REFERENCES public.supplier_payments(id) ON DELETE CASCADE;

ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_document_type_check;
ALTER TABLE public.print_jobs ADD CONSTRAINT print_jobs_document_type_check
  CHECK (document_type IN ('customer_receipt', 'depot_order', 'supplier_payment_rgf'));

ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_sale_id_destination_document_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_sale_doc_uq
  ON public.print_jobs (sale_id, destination, document_type)
  WHERE sale_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_supplier_payment_doc_uq
  ON public.print_jobs (supplier_payment_id, destination, document_type)
  WHERE supplier_payment_id IS NOT NULL;

ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_ref_check;
ALTER TABLE public.print_jobs ADD CONSTRAINT print_jobs_ref_check CHECK (
  (sale_id IS NOT NULL AND supplier_payment_id IS NULL)
  OR (sale_id IS NULL AND supplier_payment_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION private.build_supplier_payment_rgf_payload(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_pay public.supplier_payments%ROWTYPE;
  v_sup public.suppliers%ROWTYPE;
  v_depot_name text;
  v_business_name text;
  v_staff_name text;
BEGIN
  SELECT * INTO v_pay FROM public.supplier_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_sup FROM public.suppliers WHERE id = v_pay.supplier_id;
  SELECT d.name INTO v_depot_name FROM public.depots d WHERE d.id = v_pay.depot_id;
  SELECT coalesce(bs.business_name, 'VHM POS') INTO v_business_name FROM public.business_settings bs LIMIT 1;
  SELECT st.full_name INTO v_staff_name FROM public.staff st WHERE st.id = v_pay.recorded_by;
  RETURN jsonb_build_object(
    'business_name', v_business_name,
    'depot_name', v_depot_name,
    'receipt_number', v_pay.receipt_number,
    'created_at', v_pay.recorded_at,
    'cashier_name', v_staff_name,
    'supplier_name', v_sup.name,
    'supplier_phone', v_sup.phone,
    'amount_cfa', v_pay.amount_cfa,
    'method', v_pay.method,
    'note', v_pay.note,
    'new_balance_owed_cfa', v_sup.balance_owed_cfa
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_supplier_payment_print(p_supplier_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_pay public.supplier_payments%ROWTYPE;
  v_payload jsonb;
  v_job_id uuid;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT * INTO v_pay FROM public.supplier_payments WHERE id = p_supplier_payment_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('supplier_payment_id', p_supplier_payment_id));
  END IF;
  v_payload := private.build_supplier_payment_rgf_payload(p_supplier_payment_id);
  IF v_payload IS NULL THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('reason', 'payload_missing'));
  END IF;
  INSERT INTO public.print_jobs (
    sale_id, supplier_payment_id, depot_id, destination, document_type, status, payload
  ) VALUES (
    NULL, v_pay.id, v_pay.depot_id, 'cashier', 'supplier_payment_rgf', 'queued', v_payload
  )
  ON CONFLICT (supplier_payment_id, destination, document_type)
  WHERE supplier_payment_id IS NOT NULL
  DO UPDATE SET
    status = 'queued', payload = EXCLUDED.payload, error_detail = NULL,
    printed_at = NULL, claimed_at = NULL, claimed_by_agent = NULL
  RETURNING id INTO v_job_id;
  RETURN jsonb_build_object('job_id', v_job_id, 'receipt_number', v_pay.receipt_number);
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_supplier_payment_print(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_supplier_payment_print(uuid) TO authenticated;

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
  v_depot_id uuid;
  v_receipt_number text;
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

  v_depot_id := COALESCE(
    p_depot_id,
    v_ctx.depot_id,
    (SELECT d.id FROM public.depots d WHERE d.is_active ORDER BY d.code LIMIT 1),
    (SELECT d.id FROM public.depots d ORDER BY d.code LIMIT 1)
  );
  IF v_depot_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('reason', 'no_depot_for_rgf'));
  END IF;

  v_receipt_number := private.allocate_supplier_payment_number(v_depot_id);
  v_new_balance := greatest(0, round(v_sup.balance_owed_cfa - p_amount_cfa, 2));
  UPDATE public.suppliers SET balance_owed_cfa = v_new_balance, updated_at = now() WHERE id = v_sup.id;

  INSERT INTO public.supplier_payments (
    supplier_id, depot_id, amount_cfa, method, note, recorded_by, receipt_number
  ) VALUES (
    v_sup.id, v_depot_id, p_amount_cfa, p_method,
    nullif(btrim(coalesce(p_note, '')), ''), v_ctx.staff_id, v_receipt_number
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit(
    p_actor_id := v_ctx.staff_id,
    p_action := 'record_supplier_payment',
    p_entity_type := 'supplier_payment',
    p_entity_id := v_id,
    p_depot_id := v_depot_id,
    p_before_val := jsonb_build_object('balance_owed_cfa', v_sup.balance_owed_cfa),
    p_after_val := jsonb_build_object(
      'amount_cfa', p_amount_cfa,
      'new_balance_owed_cfa', v_new_balance,
      'receipt_number', v_receipt_number,
      'method', p_method,
      'supplier_name', v_sup.name
    )
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'supplier_id', v_sup.id,
    'amount_cfa', p_amount_cfa,
    'new_balance_owed_cfa', v_new_balance,
    'receipt_number', v_receipt_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_payment(uuid, numeric, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(uuid, numeric, text, text, uuid) TO authenticated;

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
  v_receipt_number text;
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
    v_receipt_number := private.allocate_supplier_payment_number(v_br.depot_id);
    INSERT INTO public.supplier_payments (
      supplier_id, depot_id, purchase_receipt_id, amount_cfa, method, note, recorded_by, receipt_number
    ) VALUES (
      v_br.supplier_id, v_br.depot_id, v_br.id, v_br.total_cfa, p_payment_method,
      'BR ' || v_br.number || ' paye a la validation', v_ctx.staff_id, v_receipt_number
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
      'total_cfa', v_br.total_cfa,
      'number', v_br.number,
      'supplier_name', (SELECT name FROM public.suppliers WHERE id = v_br.supplier_id),
      'supplier_payment_receipt_number', v_receipt_number
    )
  );

  RETURN jsonb_build_object(
    'id', v_br.id,
    'number', v_br.number,
    'status', 'validated',
    'payment_mode', p_payment_mode,
    'supplier_payment_id', v_pay_id,
    'supplier_payment_receipt_number', v_receipt_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_purchase_receipt(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_purchase_receipt(uuid, text, text) TO authenticated;

