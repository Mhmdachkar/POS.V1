-- ================================================================
-- Phase 12 — Admin reports (date-range, Africa/Abidjan calendar)
-- ================================================================
-- All functions: admin-only via private.get_caller_ctx(ARRAY['admin']).
-- Date bounds p_start_date / p_end_date are inclusive calendar days
-- in Africa/Abidjan (same convention as admin_dashboard_summary).
-- ================================================================

CREATE OR REPLACE FUNCTION private.assert_report_depot(p_depot_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF p_depot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.depots WHERE id = p_depot_id
  ) THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.assert_report_depot(uuid) FROM PUBLIC;


CREATE OR REPLACE FUNCTION public.admin_report_sales(
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
  v_sales_activity   numeric := 0;
  v_returns_activity numeric := 0;
  v_net_sales        numeric := 0;
  v_txn              integer := 0;
  v_avg              numeric := 0;
  v_gp               numeric := 0;
  v_sales_cogs       numeric := 0;
  v_return_cogs      numeric := 0;
  v_products         jsonb   := '[]'::jsonb;
  v_returns_rows     jsonb   := '[]'::jsonb;
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);
  PERFORM private.assert_report_depot(p_depot_id);

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'invalid_report_date_range'));
  END IF;

  -- Sales activity: checkout revenue for sales created in period (excludes voided)
  SELECT COALESCE(SUM(si.net_line_total_cfa), 0)
  INTO v_sales_activity
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id);

  -- Returns activity: refunds processed in period
  SELECT COALESCE(SUM(sr.refund_amount_cfa), 0)
  INTO v_returns_activity
  FROM public.sale_returns sr
  WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id);

  v_net_sales := v_sales_activity - v_returns_activity;

  SELECT COUNT(*)
  INTO v_txn
  FROM public.sales s
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id);

  IF v_txn > 0 THEN
    v_avg := ROUND(v_sales_activity / v_txn, 2);
  END IF;

  -- Event-based GP (historical period, not dashboard lifetime netting):
  --   sales-period COGS  = cost_price_cfa * quantity_in_unit for sales created in period
  --   return-period COGS = cost_price_cfa * quantity_in_unit for returns processed in period
  --   net GP = net sales - (sales COGS - return COGS)
  -- Future returns must not reduce a past sale period.
  SELECT COALESCE(SUM(si.cost_price_cfa * si.quantity_in_unit), 0)
  INTO v_sales_cogs
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id);

  SELECT COALESCE(SUM(si.cost_price_cfa * sri.quantity_in_unit), 0)
  INTO v_return_cogs
  FROM public.sale_returns sr
  JOIN public.sale_return_items sri ON sri.return_id = sr.id
  JOIN public.sale_items si ON si.id = sri.sale_item_id
  WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id);

  v_gp := v_net_sales - (v_sales_cogs - v_return_cogs);

  -- Product performance is also event-based (sale date vs return date).
  WITH events AS (
    SELECT
      si.product_id,
      si.quantity_pieces AS pieces,
      si.net_line_total_cfa AS revenue
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
    UNION ALL
    SELECT
      si.product_id,
      -sri.quantity_pieces,
      -sri.refund_amount_cfa
    FROM public.sale_returns sr
    JOIN public.sale_return_items sri ON sri.return_id = sr.id
    JOIN public.sale_items si ON si.id = sri.sale_item_id
    WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
  ),
  agg AS (
    SELECT
      product_id,
      SUM(pieces)  AS net_pieces,
      SUM(revenue) AS net_revenue
    FROM events
    GROUP BY product_id
    HAVING SUM(pieces) <> 0 OR SUM(revenue) <> 0
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', a.product_id,
      'name', p.name,
      'net_pieces', a.net_pieces,
      'net_revenue_cfa', a.net_revenue
    ) ORDER BY a.net_revenue DESC
  ), '[]'::jsonb)
  INTO v_products
  FROM (
    SELECT * FROM agg ORDER BY net_revenue DESC LIMIT 25
  ) a
  JOIN public.products p ON p.id = a.product_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'return_id', sr.id,
      'sale_id', sr.sale_id,
      'depot_id', sr.depot_id,
      'refund_amount_cfa', sr.refund_amount_cfa,
      'cash_refunded_cfa', sr.cash_refunded_cfa,
      'balance_adjustment_cfa', sr.balance_adjustment_cfa,
      'created_at', sr.created_at
    ) ORDER BY sr.created_at DESC
  ), '[]'::jsonb)
  INTO v_returns_rows
  FROM (
    SELECT *
    FROM public.sale_returns sr
    WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
    ORDER BY sr.created_at DESC
    LIMIT 100
  ) sr;

  RETURN jsonb_build_object(
    'sales_activity_cfa', v_sales_activity,
    'returns_activity_cfa', v_returns_activity,
    'net_sales_cfa', v_net_sales,
    'transaction_count', v_txn,
    'average_sale_cfa', v_avg,
    'gross_profit_cfa', v_gp,
    'product_performance', v_products,
    'returns', v_returns_rows,
    'start_date', p_start_date,
    'end_date', p_end_date
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_report_sales(uuid, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_report_sales(uuid, date, date) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_report_inventory(
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
  v_stock_rows   jsonb := '[]'::jsonb;
  v_low_rows     jsonb := '[]'::jsonb;
  v_out_rows     jsonb := '[]'::jsonb;
  v_total_value  numeric := 0;
  v_movement     jsonb := '[]'::jsonb;
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);
  PERFORM private.assert_report_depot(p_depot_id);

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'invalid_report_date_range'));
  END IF;

  SELECT COALESCE(SUM(
    p.current_stock_pieces * COALESCE(pu.cost_price_cfa, 0)
  ), 0)
  INTO v_total_value
  FROM public.products p
  LEFT JOIN public.product_units pu
    ON pu.product_id = p.id AND pu.unit_level = 0
  WHERE p.is_active = true
    AND (p_depot_id IS NULL OR p.depot_id = p_depot_id);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', p.id,
      'name', p.name,
      'depot_id', p.depot_id,
      'current_stock_pieces', p.current_stock_pieces,
      'unit_cost_cfa', COALESCE(pu.cost_price_cfa, 0),
      'value_cfa', p.current_stock_pieces * COALESCE(pu.cost_price_cfa, 0)
    ) ORDER BY p.name
  ), '[]'::jsonb)
  INTO v_stock_rows
  FROM public.products p
  LEFT JOIN public.product_units pu
    ON pu.product_id = p.id AND pu.unit_level = 0
  WHERE p.is_active = true
    AND (p_depot_id IS NULL OR p.depot_id = p_depot_id);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', p.id,
      'name', p.name,
      'depot_id', p.depot_id,
      'current_stock_pieces', p.current_stock_pieces
    ) ORDER BY p.current_stock_pieces, p.name
  ), '[]'::jsonb)
  INTO v_low_rows
  FROM public.products p
  WHERE p.is_active = true
    AND p.current_stock_pieces > 0
    AND p.current_stock_pieces <= 10
    AND (p_depot_id IS NULL OR p.depot_id = p_depot_id);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', p.id,
      'name', p.name,
      'depot_id', p.depot_id,
      'current_stock_pieces', p.current_stock_pieces
    ) ORDER BY p.name
  ), '[]'::jsonb)
  INTO v_out_rows
  FROM public.products p
  WHERE p.is_active = true
    AND p.current_stock_pieces <= 0
    AND (p_depot_id IS NULL OR p.depot_id = p_depot_id);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'transaction_type', t.transaction_type,
      'quantity_pieces', t.qty
    ) ORDER BY t.transaction_type
  ), '[]'::jsonb)
  INTO v_movement
  FROM (
    SELECT transaction_type, SUM(quantity_pieces) AS qty
    FROM public.inventory_transactions it
    WHERE (it.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR it.depot_id = p_depot_id)
    GROUP BY transaction_type
  ) t;

  RETURN jsonb_build_object(
    'inventory_value_cfa', v_total_value,
    'current_stock', v_stock_rows,
    'low_stock', v_low_rows,
    'out_of_stock', v_out_rows,
    'period_movement', v_movement,
    'start_date', p_start_date,
    'end_date', p_end_date
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_report_inventory(uuid, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_report_inventory(uuid, date, date) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_report_customers(
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
  v_outstanding_total numeric := 0;
  v_outstanding_count integer := 0;
  v_credit_cfa        numeric := 0;
  v_credit_count      integer := 0;
  v_payment_cfa       numeric := 0;
  v_payment_count     integer := 0;
  v_unattr_cfa        numeric := 0;
  v_unattr_count      integer := 0;
  v_customers         jsonb   := '[]'::jsonb;
  v_payments          jsonb   := '[]'::jsonb;
  v_unattr_payments   jsonb   := '[]'::jsonb;
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);
  PERFORM private.assert_report_depot(p_depot_id);
  -- Customer balances are global pooled; p_depot_id does not scope balances.

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'invalid_report_date_range'));
  END IF;

  SELECT COALESCE(SUM(balance_owed_cfa), 0), COUNT(*)
  INTO v_outstanding_total, v_outstanding_count
  FROM public.customers
  WHERE balance_owed_cfa > 0;

  SELECT COALESCE(SUM(s.balance_added_cfa), 0), COUNT(*)
  INTO v_credit_cfa, v_credit_count
  FROM public.sales s
  WHERE s.balance_added_cfa > 0
    AND s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id);

  -- All-depots: every non-reversed customer payment in period.
  -- Single depot: only payments whose shift is that depot. Unattributed
  -- (shift_id IS NULL) are never assigned to a depot.
  SELECT COALESCE(SUM(p.amount_cfa), 0), COUNT(*)
  INTO v_payment_cfa, v_payment_count
  FROM public.payments p
  WHERE p.payment_type = 'customer_payment'
    AND p.is_reversed = false
    AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (
      p_depot_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.shifts sh
        WHERE sh.id = p.shift_id AND sh.depot_id = p_depot_id
      )
    );

  SELECT COALESCE(SUM(p.amount_cfa), 0), COUNT(*)
  INTO v_unattr_cfa, v_unattr_count
  FROM public.payments p
  WHERE p.payment_type = 'customer_payment'
    AND p.is_reversed = false
    AND p.shift_id IS NULL
    AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'customer_id', c.id,
      'name', c.name,
      'balance_owed_cfa', c.balance_owed_cfa,
      'is_active', c.is_active
    ) ORDER BY c.balance_owed_cfa DESC, c.name
  ), '[]'::jsonb)
  INTO v_customers
  FROM (
    SELECT * FROM public.customers
    WHERE balance_owed_cfa > 0
    ORDER BY balance_owed_cfa DESC
    LIMIT 100
  ) c;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'payment_id', p.id,
      'customer_id', p.customer_id,
      'amount_cfa', p.amount_cfa,
      'recorded_at', p.recorded_at,
      'shift_id', p.shift_id
    ) ORDER BY p.recorded_at DESC
  ), '[]'::jsonb)
  INTO v_payments
  FROM (
    SELECT *
    FROM public.payments p
    WHERE p.payment_type = 'customer_payment'
      AND p.is_reversed = false
      AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (
        p_depot_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.shifts sh
          WHERE sh.id = p.shift_id AND sh.depot_id = p_depot_id
        )
      )
    ORDER BY p.recorded_at DESC
    LIMIT 100
  ) p;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'payment_id', p.id,
      'customer_id', p.customer_id,
      'amount_cfa', p.amount_cfa,
      'recorded_at', p.recorded_at,
      'shift_id', p.shift_id
    ) ORDER BY p.recorded_at DESC
  ), '[]'::jsonb)
  INTO v_unattr_payments
  FROM (
    SELECT *
    FROM public.payments p
    WHERE p.payment_type = 'customer_payment'
      AND p.is_reversed = false
      AND p.shift_id IS NULL
      AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
    ORDER BY p.recorded_at DESC
    LIMIT 100
  ) p;

  RETURN jsonb_build_object(
    'outstanding_total_cfa', v_outstanding_total,
    'outstanding_count', v_outstanding_count,
    'credit_activity_cfa', v_credit_cfa,
    'credit_activity_count', v_credit_count,
    'payment_activity_cfa', v_payment_cfa,
    'payment_activity_count', v_payment_count,
    'unattributed_payment_activity_cfa', v_unattr_cfa,
    'unattributed_payment_activity_count', v_unattr_count,
    'customers_with_balance', v_customers,
    'payments', v_payments,
    'unattributed_payments', v_unattr_payments,
    'balances_are_global', true,
    'start_date', p_start_date,
    'end_date', p_end_date
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_report_customers(uuid, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_report_customers(uuid, date, date) TO authenticated;


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
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);
  PERFORM private.assert_report_depot(p_depot_id);

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'invalid_report_date_range'));
  END IF;

  SELECT
    COALESCE(SUM(expected_cash_cfa), 0),
    COALESCE(SUM(actual_cash_cfa), 0),
    COALESCE(SUM(discrepancy_cfa), 0)
  INTO v_sum_expected, v_sum_actual, v_sum_disc
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
      'cashier_id', s.cashier_id,
      'status', s.status,
      'opened_at', s.opened_at,
      'closed_at', s.closed_at,
      'opening_float_cfa', s.opening_float_cfa,
      'expected_cash_cfa', s.expected_cash_cfa,
      'actual_cash_cfa', s.actual_cash_cfa,
      'discrepancy_cfa', s.discrepancy_cfa
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
  ) s;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'shift_id', s.id,
      'depot_id', s.depot_id,
      'cashier_id', s.cashier_id,
      'status', s.status,
      'opened_at', s.opened_at,
      'closed_at', s.closed_at,
      'opening_float_cfa', s.opening_float_cfa,
      'expected_cash_cfa', s.expected_cash_cfa,
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
  ) s;

  RETURN jsonb_build_object(
    'closed_shifts', v_closed,
    'open_shifts', v_open,
    'closed_expected_total_cfa', v_sum_expected,
    'closed_actual_total_cfa', v_sum_actual,
    'closed_discrepancy_total_cfa', v_sum_disc,
    'start_date', p_start_date,
    'end_date', p_end_date
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_report_cash(uuid, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_report_cash(uuid, date, date) TO authenticated;
