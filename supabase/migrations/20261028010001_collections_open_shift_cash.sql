-- Encaissements: split shift cash into open vs closed (period activity, no float).
-- collected = closed_shift_cash + open_shift_cash + no_shift_cash.

CREATE OR REPLACE FUNCTION public.admin_report_collections(
  p_depot_id uuid,
  p_start_date date,
  p_end_date date,
  p_cashier_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_cash_sales numeric := 0;
  v_credit numeric := 0;
  v_customer_payments numeric := 0;
  v_cash_refunds numeric := 0;
  v_balance_adj numeric := 0;
  v_shift_cash numeric := 0;
  v_open_shift_cash numeric := 0;
  v_closed_shift_cash numeric := 0;
  v_no_shift_cash numeric := 0;
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);
  PERFORM private.assert_report_depot(p_depot_id);

  SELECT
    COALESCE(SUM(s.amount_applied_cfa), 0),
    COALESCE(SUM(s.balance_added_cfa), 0)
  INTO v_cash_sales, v_credit
  FROM public.sales s
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id);

  SELECT COALESCE(SUM(p.amount_cfa), 0)
  INTO v_customer_payments
  FROM public.payments p
  WHERE p.payment_type = 'customer_payment'
    AND p.is_reversed = false
    AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
    AND (p_cashier_id IS NULL OR p.recorded_by = p_cashier_id)
    AND private.payment_matches_report_depot(p.shift_id, p.recorded_by, p_depot_id);

  SELECT
    COALESCE(SUM(sr.cash_refunded_cfa), 0),
    COALESCE(SUM(sr.balance_adjustment_cfa), 0)
  INTO v_cash_refunds, v_balance_adj
  FROM public.sale_returns sr
  JOIN public.sales s ON s.id = sr.sale_id
  WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id);

  -- Open-shift cash: sales + customer payments − cash refunds on shifts still open.
  v_open_shift_cash :=
    COALESCE((
      SELECT SUM(s.amount_applied_cfa)
      FROM public.sales s
      JOIN public.shifts sh ON sh.id = s.shift_id
      WHERE s.status <> 'voided'
        AND sh.closed_at IS NULL
        AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
        AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
        AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    ), 0)
    + COALESCE((
      SELECT SUM(p.amount_cfa)
      FROM public.payments p
      JOIN public.shifts sh ON sh.id = p.shift_id
      WHERE p.payment_type = 'customer_payment'
        AND p.is_reversed = false
        AND sh.closed_at IS NULL
        AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
        AND (p_cashier_id IS NULL OR p.recorded_by = p_cashier_id)
        AND (p_depot_id IS NULL OR sh.depot_id = p_depot_id)
    ), 0)
    - COALESCE((
      SELECT SUM(sr.cash_refunded_cfa)
      FROM public.sale_returns sr
      JOIN public.sales s ON s.id = sr.sale_id
      JOIN public.shifts sh ON sh.id = sr.shift_id
      WHERE sh.closed_at IS NULL
        AND (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
        AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
        AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    ), 0);

  -- Closed-shift cash: same components on shifts that have been closed.
  v_closed_shift_cash :=
    COALESCE((
      SELECT SUM(s.amount_applied_cfa)
      FROM public.sales s
      JOIN public.shifts sh ON sh.id = s.shift_id
      WHERE s.status <> 'voided'
        AND sh.closed_at IS NOT NULL
        AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
        AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
        AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    ), 0)
    + COALESCE((
      SELECT SUM(p.amount_cfa)
      FROM public.payments p
      JOIN public.shifts sh ON sh.id = p.shift_id
      WHERE p.payment_type = 'customer_payment'
        AND p.is_reversed = false
        AND sh.closed_at IS NOT NULL
        AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
        AND (p_cashier_id IS NULL OR p.recorded_by = p_cashier_id)
        AND private.payment_matches_report_depot(p.shift_id, p.recorded_by, p_depot_id)
    ), 0)
    - COALESCE((
      SELECT SUM(sr.cash_refunded_cfa)
      FROM public.sale_returns sr
      JOIN public.sales s ON s.id = sr.sale_id
      JOIN public.shifts sh ON sh.id = sr.shift_id
      WHERE sh.closed_at IS NOT NULL
        AND (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
        AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
        AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    ), 0);

  v_shift_cash := v_open_shift_cash + v_closed_shift_cash;

  v_no_shift_cash :=
    COALESCE((
      SELECT SUM(s.amount_applied_cfa)
      FROM public.sales s
      WHERE s.status <> 'voided' AND s.shift_id IS NULL
        AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
        AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
        AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    ), 0)
    + COALESCE((
      SELECT SUM(p.amount_cfa)
      FROM public.payments p
      WHERE p.payment_type = 'customer_payment' AND p.is_reversed = false AND p.shift_id IS NULL
        AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
        AND (p_cashier_id IS NULL OR p.recorded_by = p_cashier_id)
        AND private.payment_matches_report_depot(p.shift_id, p.recorded_by, p_depot_id)
    ), 0)
    - COALESCE((
      SELECT SUM(sr.cash_refunded_cfa)
      FROM public.sale_returns sr
      JOIN public.sales s ON s.id = sr.sale_id
      WHERE sr.shift_id IS NULL
        AND (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date BETWEEN p_start_date AND p_end_date
        AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
        AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    ), 0);

  RETURN jsonb_build_object(
    'cash_on_sales_cfa', v_cash_sales,
    'credit_cfa', v_credit,
    'customer_payments_cfa', v_customer_payments,
    'cash_refunds_cfa', v_cash_refunds,
    'balance_adjustments_cfa', v_balance_adj,
    'collected_cfa', v_cash_sales + v_customer_payments - v_cash_refunds,
    'shift_cash_cfa', v_shift_cash,
    'open_shift_cash_cfa', v_open_shift_cash,
    'closed_shift_cash_cfa', v_closed_shift_cash,
    'no_shift_cash_cfa', v_no_shift_cash
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_report_collections(uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_report_collections(uuid, date, date, uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_report_collections(uuid, date, date, uuid) IS
  'Collected cash split: closed_shift_cash + open_shift_cash + no_shift_cash = collected (no float).';
