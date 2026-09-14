-- ================================================================
-- Phase 12 — Report semantics remediation (event-based GP, average,
-- customer payment depot attribution)
-- ================================================================
-- TEST already applied 20260915000001. Apply THIS file next.
-- CREATE OR REPLACE of admin_report_sales + admin_report_customers.
-- Parameter order unchanged: p_depot_id uuid, p_start_date date, p_end_date date
-- No DEFAULT on any parameter. NULL depot still means all depots.
-- ================================================================
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

