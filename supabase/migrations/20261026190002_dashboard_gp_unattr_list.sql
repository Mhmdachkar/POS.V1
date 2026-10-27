-- ================================================================
-- Round 4 -- Dashboard GP: payable_line from sale payable × share,
-- subtract returned_refund once. Unattr payments list uses
-- payment_matches_report_depot (same as count).
-- Requires: 20261026190001_report_sale_grain_payable.sql
-- ================================================================
CREATE OR REPLACE FUNCTION public.admin_dashboard_summary(p_depot_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_sales_cfa numeric := 0;
  v_gp        numeric := 0;
  v_txn       integer := 0;
  v_avg       numeric := 0;
  v_top       jsonb   := '[]'::jsonb;
  v_hourly    jsonb   := '[]'::jsonb;
  v_low       jsonb   := '[]'::jsonb;
  v_balances  integer := 0;
  v_shifts    jsonb   := '[]'::jsonb;
  v_rate      jsonb;
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);

  IF p_depot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.depots WHERE id = p_depot_id
  ) THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;

  WITH today_sales AS (
    SELECT s.id, s.created_at, s.depot_id,
           COALESCE(s.admin_override_total_cfa, s.total_cfa) AS payable_cfa
    FROM public.sales s
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
  ),
  returns_today AS (
    SELECT sr.sale_id, COALESCE(SUM(sr.refund_amount_cfa), 0) AS refunded_cfa
    FROM public.sale_returns sr
    JOIN today_sales ts ON ts.id = sr.sale_id
    GROUP BY sr.sale_id
  ),
  sale_net AS (
    SELECT
      ts.id,
      ts.created_at,
      ts.payable_cfa - COALESCE(rt.refunded_cfa, 0) AS remaining_net
    FROM today_sales ts
    LEFT JOIN returns_today rt ON rt.sale_id = ts.id
  ),
  item_net AS (
    SELECT
      si.id,
      si.product_id,
      sn.created_at,
      si.quantity_in_unit,
      si.quantity_pieces,
      si.cost_price_cfa,
      private.sale_line_payable_share(
        si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa
      ) AS payable_line,
      COALESCE(SUM(sri.quantity_in_unit), 0)  AS returned_units,
      COALESCE(SUM(sri.quantity_pieces), 0)   AS returned_pieces,
      COALESCE(SUM(sri.refund_amount_cfa), 0) AS returned_refund
    FROM sale_net sn
    JOIN public.sales s ON s.id = sn.id
    JOIN public.sale_items si ON si.sale_id = sn.id
    LEFT JOIN public.sale_return_items sri ON sri.sale_item_id = si.id
    GROUP BY si.id, si.product_id, sn.created_at, si.quantity_in_unit,
             si.quantity_pieces, si.cost_price_cfa, s.total_cfa,
             s.admin_override_total_cfa, si.net_line_total_cfa
  ),
  remaining AS (
    SELECT
      product_id,
      created_at,
      quantity_pieces - returned_pieces AS net_pieces,
      payable_line - returned_refund AS remaining_net,
      (payable_line - returned_refund)
        - (cost_price_cfa * (quantity_in_unit - returned_units)) AS remaining_gp
    FROM item_net
  )
  SELECT
    COALESCE((SELECT SUM(remaining_net) FROM sale_net), 0),
    COALESCE(SUM(remaining_gp), 0)
  INTO v_sales_cfa, v_gp
  FROM remaining;

  SELECT COUNT(*) INTO v_txn
  FROM public.sales s
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        = (now() AT TIME ZONE 'Africa/Abidjan')::date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id);

  IF v_txn > 0 THEN
    v_avg := ROUND(v_sales_cfa / v_txn, 2);
  END IF;

  WITH today_sales AS (
    SELECT s.id
    FROM public.sales s
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
  ),
  item_net AS (
    SELECT
      si.product_id,
      si.quantity_pieces - COALESCE(SUM(sri.quantity_pieces), 0) AS net_pieces
    FROM today_sales ts
    JOIN public.sale_items si ON si.sale_id = ts.id
    LEFT JOIN public.sale_return_items sri ON sri.sale_item_id = si.id
    GROUP BY si.id, si.product_id, si.quantity_pieces
  ),
  net AS (
    SELECT product_id, SUM(net_pieces) AS net_pieces
    FROM item_net
    GROUP BY product_id
    HAVING SUM(net_pieces) > 0
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', n.product_id,
      'name', p.name,
      'net_pieces', n.net_pieces
    ) ORDER BY n.net_pieces DESC
  ), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT * FROM net ORDER BY net_pieces DESC LIMIT 8
  ) n
  JOIN public.products p ON p.id = n.product_id;

  -- Hourly remaining sales (today, Africa/Abidjan)
  WITH today_sales AS (
    SELECT s.id, s.created_at
    FROM public.sales s
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
  ),
  item_net AS (
    SELECT
      EXTRACT(HOUR FROM (ts.created_at AT TIME ZONE 'Africa/Abidjan'))::int AS hour,
      private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa)
        - COALESCE(SUM(sri.refund_amount_cfa), 0) AS remaining_net
    FROM today_sales ts
    JOIN public.sales s ON s.id = ts.id
    JOIN public.sale_items si ON si.sale_id = ts.id
    LEFT JOIN public.sale_return_items sri ON sri.sale_item_id = si.id
    GROUP BY ts.created_at, si.id, s.total_cfa, s.admin_override_total_cfa, si.net_line_total_cfa
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('hour', h.hour, 'sales_cfa', h.sales_cfa) ORDER BY h.hour
  ), '[]'::jsonb)
  INTO v_hourly
  FROM (
    SELECT hour, SUM(remaining_net) AS sales_cfa
    FROM item_net
    GROUP BY hour
  ) h;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', p.id,
      'name', p.name,
      'depot_id', p.depot_id,
      'current_stock_pieces', p.current_stock_pieces
    ) ORDER BY p.current_stock_pieces, p.name
  ), '[]'::jsonb)
  INTO v_low
  FROM (
    SELECT id, name, depot_id, current_stock_pieces
    FROM public.products
    WHERE is_active = true
      AND current_stock_pieces <= 10
      AND (p_depot_id IS NULL OR depot_id = p_depot_id)
    ORDER BY current_stock_pieces, name
    LIMIT 20
  ) p;

  SELECT COUNT(*) INTO v_balances
  FROM public.customers
  WHERE balance_owed_cfa > 0;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'shift_id', s.id,
      'depot_id', s.depot_id,
      'discrepancy_cfa', s.discrepancy_cfa,
      'closed_at', s.closed_at
    ) ORDER BY s.closed_at DESC
  ), '[]'::jsonb)
  INTO v_shifts
  FROM (
    SELECT id, depot_id, discrepancy_cfa, closed_at
    FROM public.shifts
    WHERE status = 'closed'
      AND discrepancy_cfa <> 0
      AND (closed_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR depot_id = p_depot_id)
    ORDER BY closed_at DESC
    LIMIT 20
  ) s;

  SELECT jsonb_build_object(
    'cfa_to_usd_rate', bs.cfa_to_usd_rate,
    'rate_updated_at', bs.rate_updated_at
  )
  INTO v_rate
  FROM public.business_settings bs
  WHERE bs.id = true;

  RETURN jsonb_build_object(
    'sales_cfa', v_sales_cfa,
    'gross_profit_cfa', v_gp,
    'txn_count', v_txn,
    'avg_sale_cfa', v_avg,
    'top_products', coalesce(v_top, '[]'::jsonb),
    'hourly_sales', coalesce(v_hourly, '[]'::jsonb),
    'action_required', jsonb_build_object(
      'low_stock', coalesce(v_low, '[]'::jsonb),
      'outstanding_balances_count', v_balances,
      'shift_discrepancies', coalesce(v_shifts, '[]'::jsonb),
      'exchange_rate', v_rate
    )
  );
END;
$$;


REVOKE EXECUTE ON FUNCTION public.admin_dashboard_summary(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_dashboard_summary(uuid) TO authenticated;

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
  v_reversed_cfa      numeric := 0;
  v_reversed_count    integer := 0;
  v_customers         jsonb   := '[]'::jsonb;
  v_payments          jsonb   := '[]'::jsonb;
  v_unattr_payments   jsonb   := '[]'::jsonb;
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);
  PERFORM private.assert_report_depot(p_depot_id);

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

  SELECT COALESCE(SUM(p.amount_cfa), 0), COUNT(*)
  INTO v_payment_cfa, v_payment_count
  FROM public.payments p
  WHERE p.payment_type = 'customer_payment'
    AND p.is_reversed = false
    AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND private.payment_matches_report_depot(p.shift_id, p.recorded_by, p_depot_id);

  SELECT COALESCE(SUM(p.amount_cfa), 0), COUNT(*)
  INTO v_unattr_cfa, v_unattr_count
  FROM public.payments p
  WHERE p.payment_type = 'customer_payment'
    AND p.is_reversed = false
    AND p.shift_id IS NULL
    AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND private.payment_matches_report_depot(p.shift_id, p.recorded_by, p_depot_id);

  SELECT COALESCE(SUM(p.amount_cfa), 0), COUNT(*)
  INTO v_reversed_cfa, v_reversed_count
  FROM public.payments p
  WHERE p.payment_type = 'customer_payment'
    AND p.is_reversed = true
    AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND private.payment_matches_report_depot(p.shift_id, p.recorded_by, p_depot_id);

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
      'shift_id', p.shift_id,
      'cashier_name', st.full_name
    ) ORDER BY p.recorded_at DESC
  ), '[]'::jsonb)
  INTO v_payments
  FROM (
    SELECT pay.*
    FROM public.payments pay
    WHERE pay.payment_type = 'customer_payment'
      AND pay.is_reversed = false
      AND (pay.recorded_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND private.payment_matches_report_depot(pay.shift_id, pay.recorded_by, p_depot_id)
    ORDER BY pay.recorded_at DESC
    LIMIT 100
  ) p
  LEFT JOIN public.shifts sh ON sh.id = p.shift_id
  LEFT JOIN public.staff st ON st.id = COALESCE(sh.cashier_id, p.recorded_by);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'payment_id', p.id,
      'customer_id', p.customer_id,
      'amount_cfa', p.amount_cfa,
      'recorded_at', p.recorded_at,
      'shift_id', p.shift_id,
      'cashier_name', st.full_name
    ) ORDER BY p.recorded_at DESC
  ), '[]'::jsonb)
  INTO v_unattr_payments
  FROM (
    SELECT pay.*
    FROM public.payments pay
    WHERE pay.payment_type = 'customer_payment'
      AND pay.is_reversed = false
      AND pay.shift_id IS NULL
      AND (pay.recorded_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND private.payment_matches_report_depot(pay.shift_id, pay.recorded_by, p_depot_id)
    ORDER BY pay.recorded_at DESC
    LIMIT 100
  ) p
  LEFT JOIN public.shifts sh ON sh.id = p.shift_id
  LEFT JOIN public.staff st ON st.id = COALESCE(sh.cashier_id, p.recorded_by);

  RETURN jsonb_build_object(
    'outstanding_total_cfa', v_outstanding_total,
    'outstanding_count', v_outstanding_count,
    'credit_activity_cfa', v_credit_cfa,
    'credit_activity_count', v_credit_count,
    'payment_activity_cfa', v_payment_cfa,
    'payment_activity_count', v_payment_count,
    'unattributed_payment_activity_cfa', v_unattr_cfa,
    'unattributed_payment_activity_count', v_unattr_count,
    'reversed_payment_activity_cfa', v_reversed_cfa,
    'reversed_payment_activity_count', v_reversed_count,
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
