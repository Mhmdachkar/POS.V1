-- QA: live expected cash excludes voided sales; print line discounts.

CREATE OR REPLACE FUNCTION private.shift_expected_cash_cfa(p_shift_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_float numeric := 0;
  v_sales numeric := 0;
  v_pmts numeric := 0;
  v_refunds numeric := 0;
BEGIN
  SELECT opening_float_cfa INTO v_float
  FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(amount_applied_cfa), 0) INTO v_sales
  FROM public.sales
  WHERE shift_id = p_shift_id AND status <> 'voided';

  SELECT COALESCE(SUM(amount_cfa), 0) INTO v_pmts
  FROM public.payments
  WHERE shift_id = p_shift_id
    AND payment_type = 'customer_payment'
    AND is_reversed = false;

  SELECT COALESCE(SUM(cash_refunded_cfa), 0) INTO v_refunds
  FROM public.sale_returns
  WHERE shift_id = p_shift_id;

  RETURN COALESCE(v_float, 0) + v_sales + v_pmts - v_refunds;
END;
$$;

REVOKE ALL ON FUNCTION private.shift_expected_cash_cfa(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.recompute_shift_expected_after_void()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_expected numeric;
BEGIN
  IF NEW.shift_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'voided'
     AND OLD.status IS DISTINCT FROM 'voided' THEN
    v_expected := private.shift_expected_cash_cfa(NEW.shift_id);
    UPDATE public.shifts
    SET expected_cash_cfa = CASE WHEN status = 'closed' THEN v_expected ELSE expected_cash_cfa END,
        discrepancy_cfa = CASE
          WHEN status = 'closed' AND actual_cash_cfa IS NOT NULL
            THEN actual_cash_cfa - v_expected
          ELSE discrepancy_cfa
        END
    WHERE id = NEW.shift_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_shift_expected_after_void ON public.sales;
CREATE TRIGGER trg_recompute_shift_expected_after_void
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION private.recompute_shift_expected_after_void();

-- Rapport Z: live expected excluding voided.
CREATE OR REPLACE FUNCTION public.admin_report_cash(
  p_depot_id    uuid,
  p_start_date  date,
  p_end_date    date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_closed jsonb := '[]'::jsonb;
  v_open   jsonb := '[]'::jsonb;
  v_sum_expected numeric := 0;
  v_sum_actual   numeric := 0;
  v_sum_disc     numeric := 0;
  v_sum_activity numeric := 0;
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);
  PERFORM private.assert_report_depot(p_depot_id);

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'invalid_report_date_range'));
  END IF;

  SELECT
    COALESCE(SUM(private.shift_expected_cash_cfa(s.id)), 0),
    COALESCE(SUM(s.actual_cash_cfa), 0),
    COALESCE(SUM(s.actual_cash_cfa - private.shift_expected_cash_cfa(s.id)), 0),
    COALESCE(SUM(private.shift_expected_cash_cfa(s.id) - s.opening_float_cfa), 0)
  INTO v_sum_expected, v_sum_actual, v_sum_disc, v_sum_activity
  FROM public.shifts s
  WHERE s.status = 'closed'
    AND s.closed_at IS NOT NULL
    AND (s.closed_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'shift_id', s.id,
      'depot_id', s.depot_id,
      'depot_name', d.name,
      'cashier_id', s.cashier_id,
      'cashier_name', st.full_name,
      'status', s.status,
      'opened_at', s.opened_at,
      'closed_at', s.closed_at,
      'opening_float_cfa', s.opening_float_cfa,
      'expected_cash_cfa', private.shift_expected_cash_cfa(s.id),
      'cash_activity_cfa', private.shift_expected_cash_cfa(s.id) - s.opening_float_cfa,
      'actual_cash_cfa', s.actual_cash_cfa,
      'discrepancy_cfa', CASE
        WHEN s.actual_cash_cfa IS NULL THEN NULL
        ELSE s.actual_cash_cfa - private.shift_expected_cash_cfa(s.id)
      END
    ) ORDER BY s.closed_at DESC
  ), '[]'::jsonb)
  INTO v_closed
  FROM (
    SELECT *
    FROM public.shifts s
    WHERE s.status = 'closed'
      AND s.closed_at IS NOT NULL
      AND (s.closed_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
    ORDER BY s.closed_at DESC
    LIMIT 100
  ) s
  JOIN public.depots d ON d.id = s.depot_id
  JOIN public.staff st ON st.id = s.cashier_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'shift_id', s.id,
      'depot_id', s.depot_id,
      'depot_name', d.name,
      'cashier_id', s.cashier_id,
      'cashier_name', st.full_name,
      'status', s.status,
      'opened_at', s.opened_at,
      'closed_at', s.closed_at,
      'opening_float_cfa', s.opening_float_cfa,
      'expected_cash_cfa', private.shift_expected_cash_cfa(s.id),
      'cash_activity_cfa', private.shift_expected_cash_cfa(s.id) - s.opening_float_cfa,
      'actual_cash_cfa', s.actual_cash_cfa,
      'discrepancy_cfa', s.discrepancy_cfa
    ) ORDER BY s.opened_at DESC
  ), '[]'::jsonb)
  INTO v_open
  FROM (
    SELECT *
    FROM public.shifts s
    WHERE s.status = 'open'
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
    ORDER BY s.opened_at DESC
    LIMIT 50
  ) s
  JOIN public.depots d ON d.id = s.depot_id
  JOIN public.staff st ON st.id = s.cashier_id;

  RETURN jsonb_build_object(
    'closed_shifts', v_closed,
    'open_shifts', v_open,
    'closed_expected_total_cfa', v_sum_expected,
    'closed_actual_total_cfa', v_sum_actual,
    'closed_discrepancy_total_cfa', v_sum_disc,
    'closed_activity_total_cfa', v_sum_activity,
    'start_date', p_start_date,
    'end_date', p_end_date
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_report_cash(uuid, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_report_cash(uuid, date, date) TO authenticated;

-- Print payload: add line_discount_cfa (preserve existing fields).
CREATE OR REPLACE FUNCTION private.build_print_payload_for_sale(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_sale record;
  v_business_name text;
  v_items jsonb;
BEGIN
  SELECT
    s.*,
    d.name AS depot_name,
    d.code AS depot_code,
    st.full_name AS cashier_name,
    c.name AS customer_name,
    c.phone AS customer_phone
  INTO v_sale
  FROM public.sales s
  JOIN public.depots d ON d.id = s.depot_id
  JOIN public.staff st ON st.id = s.cashier_id
  LEFT JOIN public.customers c ON c.id = s.customer_id
  WHERE s.id = p_sale_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(bs.business_name, 'VHM POS') INTO v_business_name
  FROM public.business_settings bs
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', si.product_id,
      'product_name', p.name,
      'unit_name', pu.unit_name,
      'unit_level', si.unit_level,
      'quantity_in_unit', si.quantity_in_unit,
      'quantity_pieces', si.quantity_pieces,
      'unit_price_cfa', si.unit_price_cfa,
      'line_discount_cfa', COALESCE(si.line_discount_cfa, 0),
      'line_total_cfa', si.line_total_cfa,
      'net_line_total_cfa', si.net_line_total_cfa
    ) ORDER BY si.id
  ), '[]'::jsonb)
  INTO v_items
  FROM public.sale_items si
  JOIN public.products p ON p.id = si.product_id
  JOIN public.product_units pu
    ON pu.product_id = si.product_id AND pu.unit_level = si.unit_level
  WHERE si.sale_id = p_sale_id;

  RETURN jsonb_build_object(
    'business_name', v_business_name,
    'depot_name', v_sale.depot_name,
    'depot_code', v_sale.depot_code,
    'sale_id', p_sale_id,
    'receipt_number', v_sale.receipt_number,
    'created_at', v_sale.created_at,
    'status', v_sale.status,
    'cashier_name', v_sale.cashier_name,
    'customer_name', v_sale.customer_name,
    'customer_phone', v_sale.customer_phone,
    'display_currency', v_sale.display_currency,
    'subtotal_cfa', v_sale.subtotal_cfa,
    'discount_type', v_sale.discount_type,
    'discount_value', v_sale.discount_value,
    'discount_amount_cfa', v_sale.discount_amount_cfa,
    'total_cfa', v_sale.total_cfa,
    'amount_tendered_cfa', v_sale.amount_tendered_cfa,
    'amount_applied_cfa', v_sale.amount_applied_cfa,
    'change_given_cfa', v_sale.change_given_cfa,
    'balance_added_cfa', v_sale.balance_added_cfa,
    'items', v_items
  );
END;
$$;