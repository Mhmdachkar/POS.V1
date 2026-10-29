-- Phase 4: purchases reports — include-zero on Par fournisseur, Par produit, Par période.
-- Read-only analytics. Does not change balances, BR rows, or payments.

DROP FUNCTION IF EXISTS public.admin_report_purchases(uuid, date, date, uuid);
CREATE OR REPLACE FUNCTION public.admin_report_purchases(
  p_depot_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_include_zero boolean DEFAULT false
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
    HAVING
      p_include_zero
      OR count(*) FILTER (WHERE r.status = 'validated') > 0
      OR s.balance_owed_cfa > 0
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
REVOKE ALL ON FUNCTION public.admin_report_purchases(uuid, date, date, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_report_purchases(uuid, date, date, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_report_purchases_by_product(
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

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.product_name), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      i.product_id,
      max(i.product_name) AS product_name,
      coalesce(sum(i.quantity_pieces), 0) AS quantity_pieces,
      coalesce(sum(i.line_total_cfa), 0) AS purchased_cfa,
      count(DISTINCT r.id) AS receipt_count
    FROM public.purchase_receipt_items i
    JOIN public.purchase_receipts r ON r.id = i.purchase_receipt_id
    WHERE r.status = 'validated'
      AND (p_depot_id IS NULL OR r.depot_id = p_depot_id)
      AND (p_start_date IS NULL OR r.document_date >= p_start_date)
      AND (p_end_date IS NULL OR r.document_date <= p_end_date)
      AND (p_supplier_id IS NULL OR r.supplier_id = p_supplier_id)
    GROUP BY i.product_id
  ) x;

  SELECT jsonb_build_object(
    'purchased_cfa', coalesce(sum((row_el->>'purchased_cfa')::numeric), 0),
    'quantity_pieces', coalesce(sum((row_el->>'quantity_pieces')::numeric), 0),
    'receipt_count', coalesce(sum((row_el->>'receipt_count')::numeric), 0)
  ) INTO v_totals
  FROM jsonb_array_elements(v_rows) AS row_el;

  RETURN jsonb_build_object('rows', v_rows, 'totals', v_totals);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_report_purchases_by_product(uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_report_purchases_by_product(uuid, date, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_report_purchases_by_period(
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

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.document_date), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      r.document_date,
      coalesce(sum(r.total_cfa), 0) AS purchased_cfa,
      coalesce(sum(r.total_cfa) FILTER (WHERE r.payment_mode = 'credit'), 0) AS credit_cfa,
      coalesce(sum(r.total_cfa) FILTER (WHERE r.payment_mode = 'paid'), 0) AS paid_at_validate_cfa,
      count(*) AS receipt_count
    FROM public.purchase_receipts r
    WHERE r.status = 'validated'
      AND (p_depot_id IS NULL OR r.depot_id = p_depot_id)
      AND (p_start_date IS NULL OR r.document_date >= p_start_date)
      AND (p_end_date IS NULL OR r.document_date <= p_end_date)
      AND (p_supplier_id IS NULL OR r.supplier_id = p_supplier_id)
    GROUP BY r.document_date
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
REVOKE ALL ON FUNCTION public.admin_report_purchases_by_period(uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_report_purchases_by_period(uuid, date, date, uuid) TO authenticated;
