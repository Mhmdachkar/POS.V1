-- Dashboard shows the same partial gross profit as the sales report.
-- Costed lines still produce a number. lines_without_cost_count is the note.
-- Does not rewrite historical rows.

CREATE OR REPLACE FUNCTION public.admin_dashboard_summary(p_depot_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_sales_cfa numeric := 0;
  v_gp        numeric;
  v_missing   integer := 0;
  v_return_missing integer := 0;
  v_costed_sales numeric := 0;
  v_costed_returns numeric := 0;
  v_sales_cogs numeric := 0;
  v_return_cogs numeric := 0;
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
  )
  SELECT COALESCE(SUM(remaining_net), 0)
  INTO v_sales_cfa
  FROM sale_net;

  -- Partial GP matches admin_sales_report: costed lines only, still a number.
  SELECT
    COALESCE(SUM(private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa))
      FILTER (WHERE si.cost_price_cfa IS NOT NULL AND si.cost_price_cfa <> 0), 0),
    COALESCE(SUM(si.cost_price_cfa * si.quantity_in_unit)
      FILTER (WHERE si.cost_price_cfa IS NOT NULL AND si.cost_price_cfa <> 0), 0),
    COUNT(*) FILTER (WHERE si.cost_price_cfa IS NULL OR si.cost_price_cfa = 0)
  INTO v_costed_sales, v_sales_cogs, v_missing
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        = (now() AT TIME ZONE 'Africa/Abidjan')::date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id);

  SELECT
    COALESCE(SUM(sri.refund_amount_cfa)
      FILTER (WHERE si.cost_price_cfa IS NOT NULL AND si.cost_price_cfa <> 0), 0),
    COALESCE(SUM(si.cost_price_cfa * sri.quantity_in_unit)
      FILTER (WHERE si.cost_price_cfa IS NOT NULL AND si.cost_price_cfa <> 0), 0),
    COUNT(*) FILTER (WHERE si.cost_price_cfa IS NULL OR si.cost_price_cfa = 0)
  INTO v_costed_returns, v_return_cogs, v_return_missing
  FROM public.sale_returns sr
  JOIN public.sale_return_items sri ON sri.return_id = sr.id
  JOIN public.sale_items si ON si.id = sri.sale_item_id
  WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date
        = (now() AT TIME ZONE 'Africa/Abidjan')::date
    AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id);

  v_missing := v_missing + COALESCE(v_return_missing, 0);
  v_gp := (v_costed_sales - v_costed_returns) - (v_sales_cogs - v_return_cogs);

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
    'lines_without_cost_count', v_missing,
    'margin_status', CASE WHEN v_missing > 0 THEN 'marge non calculable' ELSE NULL END,
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
