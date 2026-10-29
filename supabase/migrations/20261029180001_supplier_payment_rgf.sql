-- Phase 3: supplier payment RGF numbers + ledger reference.
-- Backfill-only for existing rows: sets receipt_number only (no amounts/dates/suppliers).
-- Before push, count rows to report in PR:
--   SELECT count(*) FROM public.supplier_payments WHERE receipt_number IS NULL;
-- After push, expect 0 nulls (except if no depots exist — then allocation fails on new inserts).

ALTER TABLE public.depots
  ADD COLUMN IF NOT EXISTS supplier_payment_seq integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.depots.supplier_payment_seq IS
  'Next {code}-RGF-{8 digits} for supplier_payments.receipt_number.';

ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS receipt_number text;

COMMENT ON COLUMN public.supplier_payments.receipt_number IS
  'Document number ({depot}-RGF-########).';

CREATE UNIQUE INDEX IF NOT EXISTS supplier_payments_receipt_number_uidx
  ON public.supplier_payments (receipt_number)
  WHERE receipt_number IS NOT NULL;

CREATE OR REPLACE FUNCTION private.allocate_supplier_payment_number(p_depot_id uuid)
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
  v_number := v_depot.code || '-RGF-' || lpad(v_depot.supplier_payment_seq::text, 8, '0');
  UPDATE public.depots
  SET supplier_payment_seq = supplier_payment_seq + 1
  WHERE id = p_depot_id;
  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION private.allocate_supplier_payment_number(uuid) FROM PUBLIC;

-- Backfill existing payments (numbers only).
WITH payment_depot AS (
  SELECT
    sp.id,
    COALESCE(
      sp.depot_id,
      st.depot_id,
      (SELECT d.id FROM public.depots d WHERE d.is_active ORDER BY d.code LIMIT 1),
      (SELECT d.id FROM public.depots d ORDER BY d.code LIMIT 1)
    ) AS depot_id,
    sp.recorded_at
  FROM public.supplier_payments sp
  LEFT JOIN public.staff st ON st.id = sp.recorded_by
  WHERE sp.receipt_number IS NULL
),
ranked AS (
  SELECT
    pd.id,
    d.code,
    GREATEST(COALESCE(d.supplier_payment_seq, 1), 1)
      + row_number() OVER (PARTITION BY d.id ORDER BY pd.recorded_at, pd.id)
      - 1 AS seq
  FROM payment_depot pd
  JOIN public.depots d ON d.id = pd.depot_id
)
UPDATE public.supplier_payments sp
SET
  receipt_number = r.code || '-RGF-' || lpad(r.seq::text, 8, '0'),
  depot_id = COALESCE(sp.depot_id, (
    SELECT pd.depot_id FROM payment_depot pd WHERE pd.id = sp.id
  ))
FROM ranked r
WHERE sp.id = r.id;

UPDATE public.depots d
SET supplier_payment_seq = GREATEST(
  d.supplier_payment_seq,
  COALESCE((
    SELECT max((regexp_match(sp.receipt_number, '-RGF-([0-9]+)$'))[1]::integer) + 1
    FROM public.supplier_payments sp
    WHERE sp.receipt_number IS NOT NULL
      AND sp.depot_id = d.id
  ), 1)
);

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
      'method', p_method
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
  SELECT jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'phone', s.phone,
    'address', s.address,
    'email', s.email,
    'payment_term_days', s.payment_term_days,
    'balance_owed_cfa', s.balance_owed_cfa
  )
  INTO v_supplier FROM public.suppliers s WHERE s.id = v_br.supplier_id;
  RETURN jsonb_build_object('receipt', to_jsonb(v_br), 'items', v_items, 'supplier', v_supplier);
END;
$$;

REVOKE ALL ON FUNCTION public.get_purchase_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_purchase_receipt(uuid) TO authenticated;

-- Prefer RGF number as ledger reference for payments.
CREATE OR REPLACE FUNCTION public.supplier_ledger(p_supplier_id uuid)
RETURNS TABLE (
  id text,
  kind text,
  occurred_at timestamptz,
  reference text,
  detail text,
  amount_cfa numeric,
  running_balance_cfa numeric,
  purchase_receipt_id uuid,
  supplier_payment_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_running numeric := 0;
  r record;
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
        AND pr.payment_mode IN ('credit', 'paid')

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
    id := r.id;
    kind := r.kind;
    occurred_at := r.occurred_at;
    reference := r.reference;
    detail := r.detail;
    amount_cfa := r.amount_cfa;
    running_balance_cfa := v_running;
    purchase_receipt_id := r.purchase_receipt_id;
    supplier_payment_id := r.supplier_payment_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_ledger(uuid) TO authenticated;


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
    SELECT
      r.*,
      s.name AS supplier_name,
      s.payment_term_days AS supplier_payment_term_days
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
