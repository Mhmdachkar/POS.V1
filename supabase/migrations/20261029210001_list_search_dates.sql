-- List search + date filters for purchase receipts, supplier payments, proformas.
-- DROP old signatures then recreate (Postgres cannot add args in-place).
-- Max page size raised to 2000 for filtered CSV/Excel export.

DROP FUNCTION IF EXISTS public.list_purchase_receipts(uuid, uuid, text, int, int);
DROP FUNCTION IF EXISTS public.list_supplier_payments(uuid, int, int);
DROP FUNCTION IF EXISTS public.list_proformas(uuid, text, int, int);

CREATE OR REPLACE FUNCTION public.list_purchase_receipts(
  p_depot_id uuid DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL,
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL
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
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT count(*) INTO v_count
  FROM public.purchase_receipts r
  JOIN public.suppliers s ON s.id = r.supplier_id
  WHERE (p_depot_id IS NULL OR r.depot_id = p_depot_id)
    AND (p_supplier_id IS NULL OR r.supplier_id = p_supplier_id)
    AND (p_status IS NULL OR r.status = p_status)
    AND (p_start_at IS NULL OR r.created_at >= p_start_at)
    AND (p_end_at IS NULL OR r.created_at <= p_end_at)
    AND (
      v_q IS NULL
      OR r.number ILIKE '%' || v_q || '%'
      OR coalesce(r.external_ref, '') ILIKE '%' || v_q || '%'
      OR s.name ILIKE '%' || v_q || '%'
    );

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
      AND (p_start_at IS NULL OR r.created_at >= p_start_at)
      AND (p_end_at IS NULL OR r.created_at <= p_end_at)
      AND (
        v_q IS NULL
        OR r.number ILIKE '%' || v_q || '%'
        OR coalesce(r.external_ref, '') ILIKE '%' || v_q || '%'
        OR s.name ILIKE '%' || v_q || '%'
      )
    ORDER BY r.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 2000))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) x;

  RETURN jsonb_build_object('rows', v_rows, 'count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.list_purchase_receipts(uuid, uuid, text, int, int, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_purchase_receipts(uuid, uuid, text, int, int, text, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_supplier_payments(
  p_supplier_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL,
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL
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
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT count(*) INTO v_count
  FROM public.supplier_payments sp
  JOIN public.suppliers s ON s.id = sp.supplier_id
  WHERE (p_supplier_id IS NULL OR sp.supplier_id = p_supplier_id)
    AND (p_start_at IS NULL OR sp.recorded_at >= p_start_at)
    AND (p_end_at IS NULL OR sp.recorded_at <= p_end_at)
    AND (
      v_q IS NULL
      OR coalesce(sp.receipt_number, '') ILIKE '%' || v_q || '%'
      OR s.name ILIKE '%' || v_q || '%'
    );

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.recorded_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT sp.*, s.name AS supplier_name
    FROM public.supplier_payments sp
    JOIN public.suppliers s ON s.id = sp.supplier_id
    WHERE (p_supplier_id IS NULL OR sp.supplier_id = p_supplier_id)
      AND (p_start_at IS NULL OR sp.recorded_at >= p_start_at)
      AND (p_end_at IS NULL OR sp.recorded_at <= p_end_at)
      AND (
        v_q IS NULL
        OR coalesce(sp.receipt_number, '') ILIKE '%' || v_q || '%'
        OR s.name ILIKE '%' || v_q || '%'
      )
    ORDER BY sp.recorded_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 2000))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) x;
  RETURN jsonb_build_object('rows', v_rows, 'count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.list_supplier_payments(uuid, int, int, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_supplier_payments(uuid, int, int, text, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_proformas(
  p_depot_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL,
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL
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
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);
  v_depot := CASE
    WHEN v_ctx.role = 'cashier' THEN v_ctx.depot_id
    ELSE p_depot_id
  END;

  SELECT count(*) INTO v_count
  FROM public.proformas p
  LEFT JOIN public.customers c ON c.id = p.customer_id
  WHERE (v_depot IS NULL OR p.depot_id = v_depot)
    AND (p_status IS NULL OR p.status = p_status)
    AND (p_start_at IS NULL OR p.created_at >= p_start_at)
    AND (p_end_at IS NULL OR p.created_at <= p_end_at)
    AND (
      v_q IS NULL
      OR p.number ILIKE '%' || v_q || '%'
      OR coalesce(c.name, '') ILIKE '%' || v_q || '%'
    );

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT p.*
    FROM public.proformas p
    LEFT JOIN public.customers c ON c.id = p.customer_id
    WHERE (v_depot IS NULL OR p.depot_id = v_depot)
      AND (p_status IS NULL OR p.status = p_status)
      AND (p_start_at IS NULL OR p.created_at >= p_start_at)
      AND (p_end_at IS NULL OR p.created_at <= p_end_at)
      AND (
        v_q IS NULL
        OR p.number ILIKE '%' || v_q || '%'
        OR coalesce(c.name, '') ILIKE '%' || v_q || '%'
      )
    ORDER BY p.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 2000))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) x;

  RETURN jsonb_build_object('rows', v_rows, 'count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.list_proformas(uuid, text, int, int, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_proformas(uuid, text, int, int, text, timestamptz, timestamptz) TO authenticated;
