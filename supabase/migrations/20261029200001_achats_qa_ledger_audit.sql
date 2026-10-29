-- Achats live QA: supplier_ledger as jsonb (PostgREST-safe), BR cancel audit,
-- and a depot stamp on supplier create/update so Audit log can show them.
-- No data backfill.

DROP FUNCTION IF EXISTS public.supplier_ledger(uuid);

CREATE OR REPLACE FUNCTION public.supplier_ledger(p_supplier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_running numeric := 0;
  r record;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id) THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('supplier_id', p_supplier_id));
  END IF;

  FOR r IN
    WITH events AS (
      SELECT
        pr.id::text AS id,
        'purchase'::text AS kind,
        pr.validated_at AS occurred_at,
        pr.number AS reference,
        CASE
          WHEN pr.payment_mode = 'paid' THEN 'BR payé'
          ELSE 'BR à crédit'
        END AS detail,
        pr.total_cfa AS amount_cfa,
        pr.id AS purchase_receipt_id,
        NULL::uuid AS supplier_payment_id,
        1 AS sort_kind
      FROM public.purchase_receipts pr
      WHERE pr.supplier_id = p_supplier_id
        AND pr.validated_at IS NOT NULL

      UNION ALL

      SELECT
        pr.id::text || ':cancel',
        'purchase_cancel',
        pr.cancelled_at,
        pr.number,
        'Annulation BR',
        -pr.total_cfa,
        pr.id,
        NULL::uuid,
        3
      FROM public.purchase_receipts pr
      WHERE pr.supplier_id = p_supplier_id
        AND pr.status = 'cancelled'
        AND pr.validated_at IS NOT NULL
        AND pr.cancelled_at IS NOT NULL

      UNION ALL

      SELECT
        sp.id::text,
        'payment',
        sp.recorded_at,
        COALESCE(sp.receipt_number, pr.number, NULLIF(btrim(COALESCE(sp.note, '')), '')),
        COALESCE(
          NULLIF(btrim(sp.note), ''),
          CASE
            WHEN pr.number IS NOT NULL THEN 'Règlement BR ' || pr.number
            ELSE 'Règlement fournisseur'
          END
        ),
        -sp.amount_cfa,
        sp.purchase_receipt_id,
        sp.id,
        2
      FROM public.supplier_payments sp
      LEFT JOIN public.purchase_receipts pr ON pr.id = sp.purchase_receipt_id
      WHERE sp.supplier_id = p_supplier_id

      UNION ALL

      SELECT
        sp.id::text || ':rev',
        'payment_reversal',
        pr.cancelled_at,
        COALESCE(sp.receipt_number, pr.number),
        'Annulation règlement BR',
        sp.amount_cfa,
        pr.id,
        sp.id,
        4
      FROM public.supplier_payments sp
      JOIN public.purchase_receipts pr ON pr.id = sp.purchase_receipt_id
      WHERE sp.supplier_id = p_supplier_id
        AND pr.status = 'cancelled'
        AND pr.payment_mode = 'paid'
        AND pr.cancelled_at IS NOT NULL
    )
    SELECT * FROM events
    ORDER BY occurred_at, sort_kind, id
  LOOP
    v_running := greatest(0, round(v_running + r.amount_cfa, 2));
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id', r.id,
      'kind', r.kind,
      'occurred_at', r.occurred_at,
      'reference', r.reference,
      'detail', r.detail,
      'amount_cfa', r.amount_cfa,
      'running_balance_cfa', v_running,
      'purchase_receipt_id', r.purchase_receipt_id,
      'supplier_payment_id', r.supplier_payment_id
    ));
  END LOOP;

  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_ledger(uuid) TO authenticated;

COMMENT ON FUNCTION public.supplier_ledger(uuid) IS
  'Supplier payable ledger. BR validé = crédit (+), règlement/annulation = débit (-). Running balance = solde dû, floored at 0.';

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
    PERFORM private.write_audit(
      p_actor_id := v_ctx.staff_id,
      p_action := 'cancel_purchase_receipt',
      p_entity_type := 'purchase_receipt',
      p_entity_id := v_br.id,
      p_depot_id := v_br.depot_id,
      p_before_val := jsonb_build_object('status', 'draft'),
      p_after_val := jsonb_build_object('status', 'cancelled', 'number', v_br.number)
    );
    RETURN jsonb_build_object('id', v_br.id, 'status', 'cancelled');
  END IF;
  IF v_br.status <> 'validated' THEN
    PERFORM private.raise_vhm_error('INVALID_STATE', jsonb_build_object('reason', 'cannot_cancel'));
  END IF;

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

  PERFORM private.write_audit(
    p_actor_id := v_ctx.staff_id,
    p_action := 'cancel_purchase_receipt',
    p_entity_type := 'purchase_receipt',
    p_entity_id := v_br.id,
    p_depot_id := v_br.depot_id,
    p_before_val := jsonb_build_object(
      'status', 'validated',
      'payment_mode', v_br.payment_mode,
      'total_cfa', v_br.total_cfa
    ),
    p_after_val := jsonb_build_object('status', 'cancelled', 'number', v_br.number)
  );

  RETURN jsonb_build_object('id', v_br.id, 'number', v_br.number, 'status', 'cancelled');
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_purchase_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_receipt(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_supplier(
  p_name text,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_term_days int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_id uuid;
  v_days int;
  v_depot_id uuid;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'name_required'));
  END IF;
  IF p_payment_term_days IS NOT NULL AND p_payment_term_days < 0 THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'payment_term_days_negative'));
  END IF;
  v_days := p_payment_term_days;
  v_depot_id := COALESCE(
    v_ctx.depot_id,
    (SELECT d.id FROM public.depots d WHERE d.is_active ORDER BY d.code LIMIT 1),
    (SELECT d.id FROM public.depots d ORDER BY d.code LIMIT 1)
  );

  INSERT INTO public.suppliers (
    name, phone, address, email, notes, payment_term_days, created_by
  ) VALUES (
    btrim(p_name),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_days,
    v_ctx.staff_id
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'create_supplier',
    p_entity_type := 'supplier',
    p_entity_id   := v_id,
    p_depot_id    := v_depot_id,
    p_before_val  := null,
    p_after_val   := jsonb_build_object(
      'name', btrim(p_name),
      'phone', nullif(btrim(coalesce(p_phone, '')), ''),
      'email', nullif(btrim(coalesce(p_email, '')), ''),
      'payment_term_days', v_days
    )
  );

  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.create_supplier(text, text, text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_supplier(text, text, text, text, text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_supplier(
  p_supplier_id uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_term_days int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_before public.suppliers%ROWTYPE;
  v_after public.suppliers%ROWTYPE;
  v_profile boolean;
  v_depot_id uuid;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT * INTO v_before FROM public.suppliers WHERE id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('supplier_id', p_supplier_id));
  END IF;
  IF p_payment_term_days IS NOT NULL AND p_payment_term_days < 0 THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'payment_term_days_negative'));
  END IF;

  v_profile := p_name IS NOT NULL;
  v_depot_id := COALESCE(
    v_ctx.depot_id,
    (SELECT d.id FROM public.depots d WHERE d.is_active ORDER BY d.code LIMIT 1),
    (SELECT d.id FROM public.depots d ORDER BY d.code LIMIT 1)
  );

  UPDATE public.suppliers SET
    name = CASE WHEN v_profile THEN coalesce(nullif(btrim(p_name), ''), name) ELSE name END,
    phone = CASE WHEN p_phone IS NULL THEN phone ELSE nullif(btrim(p_phone), '') END,
    address = CASE WHEN p_address IS NULL THEN address ELSE nullif(btrim(p_address), '') END,
    email = CASE WHEN v_profile THEN nullif(btrim(coalesce(p_email, '')), '') ELSE email END,
    notes = CASE WHEN v_profile THEN nullif(btrim(coalesce(p_notes, '')), '') ELSE notes END,
    payment_term_days = CASE WHEN v_profile THEN p_payment_term_days ELSE payment_term_days END,
    is_active = coalesce(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_supplier_id;

  SELECT * INTO v_after FROM public.suppliers WHERE id = p_supplier_id;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'update_supplier',
    p_entity_type := 'supplier',
    p_entity_id   := p_supplier_id,
    p_depot_id    := v_depot_id,
    p_before_val  := jsonb_build_object(
      'name', v_before.name,
      'phone', v_before.phone,
      'address', v_before.address,
      'email', v_before.email,
      'notes', v_before.notes,
      'payment_term_days', v_before.payment_term_days,
      'is_active', v_before.is_active
    ),
    p_after_val   := jsonb_build_object(
      'name', v_after.name,
      'phone', v_after.phone,
      'address', v_after.address,
      'email', v_after.email,
      'notes', v_after.notes,
      'payment_term_days', v_after.payment_term_days,
      'is_active', v_after.is_active
    )
  );

  RETURN jsonb_build_object('id', p_supplier_id, 'ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.update_supplier(uuid, text, text, text, boolean, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_supplier(uuid, text, text, text, boolean, text, text, int) TO authenticated;
