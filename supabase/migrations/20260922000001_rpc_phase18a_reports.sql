-- ================================================================
-- Phase 18A — Extended admin reports (filters, breakdowns, inventory)
-- ================================================================
-- Replaces Phase 12 report RPCs. Phase 12 formulas remain authoritative.
-- Africa/Abidjan inclusive calendar dates. Admin-only.
-- ================================================================

DROP FUNCTION IF EXISTS public.admin_report_sales(uuid, date, date);
DROP FUNCTION IF EXISTS public.admin_report_inventory(uuid, date, date);


CREATE OR REPLACE FUNCTION public.admin_report_sales(
  p_depot_id      uuid,
  p_start_date    date,
  p_end_date      date,
  p_cashier_id    uuid DEFAULT NULL,
  p_category_id   uuid DEFAULT NULL,
  p_product_id    uuid DEFAULT NULL,
  p_shift_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_sales_activity      numeric := 0;
  v_returns_activity    numeric := 0;
  v_net_sales           numeric := 0;
  v_txn                 integer := 0;
  v_avg                 numeric := 0;
  v_gp                  numeric := 0;
  v_sales_cogs          numeric := 0;
  v_return_cogs         numeric := 0;
  v_cogs                numeric := 0;
  v_units_sold          numeric := 0;
  v_voided_count        integer := 0;
  v_voided_amount       numeric := 0;
  v_no_shift_count      integer := 0;
  v_no_shift_amount     numeric := 0;
  v_amount_applied      numeric := 0;
  v_amount_tendered     numeric := 0;
  v_balance_added       numeric := 0;
  v_change              numeric := 0;
  v_products            jsonb   := '[]'::jsonb;
  v_returns_rows        jsonb   := '[]'::jsonb;
  v_by_depot            jsonb   := '[]'::jsonb;
  v_by_cashier          jsonb   := '[]'::jsonb;
  v_by_category         jsonb   := '[]'::jsonb;
  v_by_shift            jsonb   := '[]'::jsonb;
  v_shift_vs_no         jsonb   := '{}'::jsonb;
  v_daily               jsonb   := '[]'::jsonb;
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);
  PERFORM private.assert_report_depot(p_depot_id);

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'invalid_report_date_range'));
  END IF;

  -- Sales activity: SUM(net_line_total_cfa) nonvoided, sale created_at in range
  SELECT COALESCE(SUM(si.net_line_total_cfa), 0)
  INTO v_sales_activity
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  LEFT JOIN public.products pr ON pr.id = si.product_id
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
    AND (p_category_id IS NULL OR pr.category_id = p_category_id)
    AND (p_product_id IS NULL OR si.product_id = p_product_id);

  SELECT COALESCE(SUM(sr.refund_amount_cfa), 0)
  INTO v_returns_activity
  FROM public.sale_returns sr
  JOIN public.sales s ON s.id = sr.sale_id
  WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
    AND (
      (p_category_id IS NULL AND p_product_id IS NULL)
      OR EXISTS (
        SELECT 1
        FROM public.sale_return_items sri
        JOIN public.sale_items si ON si.id = sri.sale_item_id
        JOIN public.products pr ON pr.id = si.product_id
        WHERE sri.return_id = sr.id
          AND (p_category_id IS NULL OR pr.category_id = p_category_id)
          AND (p_product_id IS NULL OR si.product_id = p_product_id)
      )
    );

  v_net_sales := v_sales_activity - v_returns_activity;

  SELECT COUNT(*)
  INTO v_txn
  FROM public.sales s
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
    AND (
      (p_category_id IS NULL AND p_product_id IS NULL)
      OR EXISTS (
        SELECT 1
        FROM public.sale_items si
        JOIN public.products pr ON pr.id = si.product_id
        WHERE si.sale_id = s.id
          AND (p_category_id IS NULL OR pr.category_id = p_category_id)
          AND (p_product_id IS NULL OR si.product_id = p_product_id)
      )
    );

  IF v_txn > 0 THEN
    v_avg := ROUND(v_sales_activity / v_txn, 2);
  END IF;

  SELECT COALESCE(SUM(si.cost_price_cfa * si.quantity_in_unit), 0)
  INTO v_sales_cogs
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  LEFT JOIN public.products pr ON pr.id = si.product_id
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
    AND (p_category_id IS NULL OR pr.category_id = p_category_id)
    AND (p_product_id IS NULL OR si.product_id = p_product_id);

  SELECT COALESCE(SUM(si.cost_price_cfa * sri.quantity_in_unit), 0)
  INTO v_return_cogs
  FROM public.sale_returns sr
  JOIN public.sale_return_items sri ON sri.return_id = sr.id
  JOIN public.sale_items si ON si.id = sri.sale_item_id
  JOIN public.sales s ON s.id = sr.sale_id
  LEFT JOIN public.products pr ON pr.id = si.product_id
  WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
    AND (p_category_id IS NULL OR pr.category_id = p_category_id)
    AND (p_product_id IS NULL OR si.product_id = p_product_id);

  v_cogs := v_sales_cogs - v_return_cogs;
  v_gp := v_net_sales - v_cogs;

  SELECT COALESCE(SUM(si.quantity_pieces), 0)
  INTO v_units_sold
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  LEFT JOIN public.products pr ON pr.id = si.product_id
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
    AND (p_category_id IS NULL OR pr.category_id = p_category_id)
    AND (p_product_id IS NULL OR si.product_id = p_product_id);

  SELECT COUNT(*), COALESCE(SUM(s.total_cfa), 0)
  INTO v_voided_count, v_voided_amount
  FROM public.sales s
  WHERE s.status = 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
    AND (
      (p_category_id IS NULL AND p_product_id IS NULL)
      OR EXISTS (
        SELECT 1
        FROM public.sale_items si
        JOIN public.products pr ON pr.id = si.product_id
        WHERE si.sale_id = s.id
          AND (p_category_id IS NULL OR pr.category_id = p_category_id)
          AND (p_product_id IS NULL OR si.product_id = p_product_id)
      )
    );

  SELECT COUNT(*), COALESCE(SUM(sub.line_total), 0)
  INTO v_no_shift_count, v_no_shift_amount
  FROM (
    SELECT s.id, COALESCE(SUM(si.net_line_total_cfa), 0) AS line_total
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    WHERE s.status <> 'voided'
      AND s.shift_id IS NULL
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (p_product_id IS NULL OR si.product_id = p_product_id)
    GROUP BY s.id
  ) sub;

  SELECT
    COALESCE(SUM(s.amount_applied_cfa), 0),
    COALESCE(SUM(s.amount_tendered_cfa), 0),
    COALESCE(SUM(s.balance_added_cfa), 0)
  INTO v_amount_applied, v_amount_tendered, v_balance_added
  FROM public.sales s
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
    AND (
      (p_category_id IS NULL AND p_product_id IS NULL)
      OR EXISTS (
        SELECT 1
        FROM public.sale_items si
        JOIN public.products pr ON pr.id = si.product_id
        WHERE si.sale_id = s.id
          AND (p_category_id IS NULL OR pr.category_id = p_category_id)
          AND (p_product_id IS NULL OR si.product_id = p_product_id)
      )
    );

  v_change := v_amount_tendered - v_amount_applied;

  WITH sale_events AS (
    SELECT
      si.product_id,
      si.quantity_pieces AS pieces,
      si.net_line_total_cfa AS revenue,
      si.cost_price_cfa * si.quantity_in_unit AS line_cogs
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (p_product_id IS NULL OR si.product_id = p_product_id)
  ),
  return_events AS (
    SELECT
      si.product_id,
      sri.quantity_pieces AS pieces,
      sri.refund_amount_cfa AS revenue,
      si.cost_price_cfa * sri.quantity_in_unit AS line_cogs
    FROM public.sale_returns sr
    JOIN public.sale_return_items sri ON sri.return_id = sr.id
    JOIN public.sale_items si ON si.id = sri.sale_item_id
    JOIN public.sales s ON s.id = sr.sale_id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (p_product_id IS NULL OR si.product_id = p_product_id)
  ),
  agg AS (
    SELECT
      product_id,
      COALESCE(SUM(CASE WHEN src = 'sale' THEN pieces ELSE 0 END), 0) AS units_sold,
      COALESCE(SUM(CASE WHEN src = 'return' THEN pieces ELSE 0 END), 0) AS returned_qty,
      COALESCE(SUM(CASE WHEN src = 'sale' THEN revenue ELSE 0 END), 0) AS gross_sales_cfa,
      COALESCE(SUM(CASE WHEN src = 'return' THEN revenue ELSE 0 END), 0) AS returns_cfa,
      COALESCE(SUM(CASE WHEN src = 'sale' THEN line_cogs ELSE 0 END), 0) AS sale_cogs,
      COALESCE(SUM(CASE WHEN src = 'return' THEN line_cogs ELSE 0 END), 0) AS ret_cogs
    FROM (
      SELECT product_id, pieces, revenue, line_cogs, 'sale'::text AS src FROM sale_events
      UNION ALL
      SELECT product_id, pieces, revenue, line_cogs, 'return'::text FROM return_events
    ) u
    GROUP BY product_id
    HAVING SUM(pieces) <> 0 OR SUM(revenue) <> 0
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', a.product_id,
      'name', p.name,
      'depot_id', p.depot_id,
      'depot_name', d.name,
      'category_id', p.category_id,
      'category_name', c.name,
      'units_sold', a.units_sold,
      'returned_qty', a.returned_qty,
      'net_pieces', a.units_sold - a.returned_qty,
      'gross_sales_cfa', a.gross_sales_cfa,
      'returns_cfa', a.returns_cfa,
      'net_sales_cfa', a.gross_sales_cfa - a.returns_cfa,
      'net_revenue_cfa', a.gross_sales_cfa - a.returns_cfa,
      'cogs_cfa', a.sale_cogs - a.ret_cogs,
      'gross_profit_cfa', (a.gross_sales_cfa - a.returns_cfa) - (a.sale_cogs - a.ret_cogs)
    ) ORDER BY (a.gross_sales_cfa - a.returns_cfa) DESC
  ), '[]'::jsonb)
  INTO v_products
  FROM (
    SELECT * FROM agg ORDER BY (gross_sales_cfa - returns_cfa) DESC LIMIT 200
  ) a
  JOIN public.products p ON p.id = a.product_id
  JOIN public.depots d ON d.id = p.depot_id
  LEFT JOIN public.categories c ON c.id = p.category_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'return_id', x.id,
      'sale_id', x.sale_id,
      'depot_id', x.depot_id,
      'refund_amount_cfa', x.refund_amount_cfa,
      'cash_refunded_cfa', x.cash_refunded_cfa,
      'balance_adjustment_cfa', x.balance_adjustment_cfa,
      'created_at', x.created_at,
      'receipt_number', x.receipt_number,
      'cashier_name', x.cashier_name,
      'shift_id', x.shift_id,
      'items', x.items
    ) ORDER BY x.created_at DESC
  ), '[]'::jsonb)
  INTO v_returns_rows
  FROM (
    SELECT
      sr.id,
      sr.sale_id,
      sr.depot_id,
      sr.refund_amount_cfa,
      sr.cash_refunded_cfa,
      sr.balance_adjustment_cfa,
      sr.created_at,
      s.receipt_number,
      st.full_name AS cashier_name,
      s.shift_id,
      (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'product_id', si.product_id,
            'product_name', p.name,
            'quantity_pieces', sri.quantity_pieces,
            'refund_amount_cfa', sri.refund_amount_cfa
          ) ORDER BY p.name
        ), '[]'::jsonb)
        FROM public.sale_return_items sri
        JOIN public.sale_items si ON si.id = sri.sale_item_id
        JOIN public.products p ON p.id = si.product_id
        WHERE sri.return_id = sr.id
      ) AS items
    FROM public.sale_returns sr
    JOIN public.sales s ON s.id = sr.sale_id
    LEFT JOIN public.staff st ON st.id = s.cashier_id
    WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (
        (p_category_id IS NULL AND p_product_id IS NULL)
        OR EXISTS (
          SELECT 1
          FROM public.sale_return_items sri
          JOIN public.sale_items si ON si.id = sri.sale_item_id
          JOIN public.products pr ON pr.id = si.product_id
          WHERE sri.return_id = sr.id
            AND (p_category_id IS NULL OR pr.category_id = p_category_id)
            AND (p_product_id IS NULL OR si.product_id = p_product_id)
        )
      )
    ORDER BY sr.created_at DESC
    LIMIT 200
  ) x;

  WITH depot_sales AS (
    SELECT
      s.depot_id,
      COALESCE(SUM(si.net_line_total_cfa), 0) AS sales_activity_cfa,
      COUNT(DISTINCT s.id) AS transaction_count
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (p_product_id IS NULL OR si.product_id = p_product_id)
    GROUP BY s.depot_id
  ),
  depot_returns AS (
    SELECT sr.depot_id, COALESCE(SUM(sr.refund_amount_cfa), 0) AS returns_activity_cfa
    FROM public.sale_returns sr
    JOIN public.sales s ON s.id = sr.sale_id
    WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (
        (p_category_id IS NULL AND p_product_id IS NULL)
        OR EXISTS (
          SELECT 1
          FROM public.sale_return_items sri
          JOIN public.sale_items si ON si.id = sri.sale_item_id
          JOIN public.products pr ON pr.id = si.product_id
          WHERE sri.return_id = sr.id
            AND (p_category_id IS NULL OR pr.category_id = p_category_id)
            AND (p_product_id IS NULL OR si.product_id = p_product_id)
        )
      )
    GROUP BY sr.depot_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'depot_id', ds.depot_id,
      'depot_name', d.name,
      'sales_activity_cfa', ds.sales_activity_cfa,
      'returns_activity_cfa', COALESCE(dr.returns_activity_cfa, 0),
      'net_sales_cfa', ds.sales_activity_cfa - COALESCE(dr.returns_activity_cfa, 0),
      'transaction_count', ds.transaction_count
    ) ORDER BY ds.sales_activity_cfa DESC
  ), '[]'::jsonb)
  INTO v_by_depot
  FROM depot_sales ds
  JOIN public.depots d ON d.id = ds.depot_id
  LEFT JOIN depot_returns dr ON dr.depot_id = ds.depot_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'cashier_id', t.cashier_id,
      'cashier_name', st.full_name,
      'sales_activity_cfa', t.sales_activity_cfa,
      'transaction_count', t.transaction_count
    ) ORDER BY t.sales_activity_cfa DESC
  ), '[]'::jsonb)
  INTO v_by_cashier
  FROM (
    SELECT
      s.cashier_id,
      COALESCE(SUM(si.net_line_total_cfa), 0) AS sales_activity_cfa,
      COUNT(DISTINCT s.id) AS transaction_count
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (p_product_id IS NULL OR si.product_id = p_product_id)
    GROUP BY s.cashier_id
  ) t
  JOIN public.staff st ON st.id = t.cashier_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'category_id', t.category_id,
      'category_name', c.name,
      'sales_activity_cfa', t.sales_activity_cfa,
      'net_pieces', t.net_pieces
    ) ORDER BY t.sales_activity_cfa DESC
  ), '[]'::jsonb)
  INTO v_by_category
  FROM (
    SELECT
      pr.category_id,
      COALESCE(SUM(si.net_line_total_cfa), 0) AS sales_activity_cfa,
      COALESCE(SUM(si.quantity_pieces), 0) AS net_pieces
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    JOIN public.products pr ON pr.id = si.product_id
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (p_product_id IS NULL OR si.product_id = p_product_id)
    GROUP BY pr.category_id
  ) t
  LEFT JOIN public.categories c ON c.id = t.category_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'shift_id', t.shift_id,
      'opened_at', sh.opened_at,
      'closed_at', sh.closed_at,
      'sales_activity_cfa', t.sales_activity_cfa,
      'transaction_count', t.transaction_count
    ) ORDER BY t.sales_activity_cfa DESC
  ), '[]'::jsonb)
  INTO v_by_shift
  FROM (
    SELECT
      s.shift_id,
      COALESCE(SUM(si.net_line_total_cfa), 0) AS sales_activity_cfa,
      COUNT(DISTINCT s.id) AS transaction_count
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (p_product_id IS NULL OR si.product_id = p_product_id)
    GROUP BY s.shift_id
  ) t
  LEFT JOIN public.shifts sh ON sh.id = t.shift_id;

  SELECT jsonb_build_object(
    'with_shift', jsonb_build_object(
      'count', COALESCE(ws.cnt, 0),
      'sales_activity_cfa', COALESCE(ws.amt, 0)
    ),
    'no_shift', jsonb_build_object(
      'count', COALESCE(ns.cnt, 0),
      'sales_activity_cfa', COALESCE(ns.amt, 0)
    )
  )
  INTO v_shift_vs_no
  FROM (
    SELECT COUNT(DISTINCT s.id) AS cnt, COALESCE(SUM(si.net_line_total_cfa), 0) AS amt
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    WHERE s.status <> 'voided'
      AND s.shift_id IS NOT NULL
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (p_product_id IS NULL OR si.product_id = p_product_id)
  ) ws,
  (
    SELECT COUNT(DISTINCT s.id) AS cnt, COALESCE(SUM(si.net_line_total_cfa), 0) AS amt
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    WHERE s.status <> 'voided'
      AND s.shift_id IS NULL
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (p_product_id IS NULL OR si.product_id = p_product_id)
  ) ns;

  WITH days AS (
    SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS d
  ),
  daily_sales AS (
    SELECT
      (s.created_at AT TIME ZONE 'Africa/Abidjan')::date AS d,
      COALESCE(SUM(si.net_line_total_cfa), 0) AS sales_activity_cfa
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (p_product_id IS NULL OR si.product_id = p_product_id)
    GROUP BY 1
  ),
  daily_returns AS (
    SELECT
      (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date AS d,
      COALESCE(SUM(sr.refund_amount_cfa), 0) AS returns_activity_cfa
    FROM public.sale_returns sr
    JOIN public.sales s ON s.id = sr.sale_id
    WHERE (sr.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR sr.depot_id = p_depot_id)
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
      AND (p_shift_id IS NULL OR s.shift_id = p_shift_id)
      AND (
        (p_category_id IS NULL AND p_product_id IS NULL)
        OR EXISTS (
          SELECT 1
          FROM public.sale_return_items sri
          JOIN public.sale_items si ON si.id = sri.sale_item_id
          JOIN public.products pr ON pr.id = si.product_id
          WHERE sri.return_id = sr.id
            AND (p_category_id IS NULL OR pr.category_id = p_category_id)
            AND (p_product_id IS NULL OR si.product_id = p_product_id)
        )
      )
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', days.d,
      'sales_activity_cfa', COALESCE(ds.sales_activity_cfa, 0),
      'returns_activity_cfa', COALESCE(dr.returns_activity_cfa, 0),
      'net_sales_cfa', COALESCE(ds.sales_activity_cfa, 0) - COALESCE(dr.returns_activity_cfa, 0)
    ) ORDER BY days.d
  ), '[]'::jsonb)
  INTO v_daily
  FROM days
  LEFT JOIN daily_sales ds ON ds.d = days.d
  LEFT JOIN daily_returns dr ON dr.d = days.d;

  RETURN jsonb_build_object(
    'sales_activity_cfa', v_sales_activity,
    'returns_activity_cfa', v_returns_activity,
    'net_sales_cfa', v_net_sales,
    'transaction_count', v_txn,
    'average_sale_cfa', v_avg,
    'gross_profit_cfa', v_gp,
    'cogs_cfa', v_cogs,
    'units_sold', v_units_sold,
    'voided_count', v_voided_count,
    'voided_amount_cfa', v_voided_amount,
    'no_shift_count', v_no_shift_count,
    'no_shift_amount_cfa', v_no_shift_amount,
    'amount_applied_cfa', v_amount_applied,
    'amount_tendered_cfa', v_amount_tendered,
    'balance_added_cfa', v_balance_added,
    'change_cfa', v_change,
    'product_performance', v_products,
    'returns', v_returns_rows,
    'by_depot', v_by_depot,
    'by_cashier', v_by_cashier,
    'by_category', v_by_category,
    'by_shift', v_by_shift,
    'with_shift_vs_no_shift', v_shift_vs_no,
    'daily_series', v_daily,
    'start_date', p_start_date,
    'end_date', p_end_date
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_report_sales(uuid, date, date, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_report_sales(uuid, date, date, uuid, uuid, uuid, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_report_inventory(
  p_depot_id      uuid,
  p_start_date    date,
  p_end_date      date,
  p_category_id   uuid DEFAULT NULL,
  p_product_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_stock_rows        jsonb := '[]'::jsonb;
  v_low_rows          jsonb := '[]'::jsonb;
  v_out_rows          jsonb := '[]'::jsonb;
  v_total_value       numeric := 0;
  v_movement          jsonb := '[]'::jsonb;
  v_adj_breakdown     jsonb := '[]'::jsonb;
  v_low_stock_count   integer := 0;
  v_out_stock_count   integer := 0;
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
    AND (p_depot_id IS NULL OR p.depot_id = p_depot_id)
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (p_product_id IS NULL OR p.id = p_product_id);

  WITH stock_base AS (
    SELECT
      p.id AS product_id,
      p.name,
      p.depot_id,
      d.name AS depot_name,
      p.category_id,
      c.name AS category_name,
      p.current_stock_pieces,
      pu.unit_name,
      COALESCE(pu.cost_price_cfa, 0) AS cost_price_cfa,
      COALESCE(pu.selling_price_cfa, 0) AS selling_price_cfa,
      p.current_stock_pieces * COALESCE(pu.cost_price_cfa, 0) AS stock_value_cost_cfa,
      p.current_stock_pieces * COALESCE(pu.selling_price_cfa, 0) AS stock_value_selling_cfa,
      p.track_low_stock,
      p.low_stock_threshold,
      CASE
        WHEN p.current_stock_pieces <= 0 THEN 'out_of_stock'
        WHEN p.track_low_stock
          AND p.low_stock_threshold IS NOT NULL
          AND p.current_stock_pieces > 0
          AND p.current_stock_pieces <= p.low_stock_threshold THEN 'low_stock'
        ELSE 'normal'
      END AS stock_status
    FROM public.products p
    LEFT JOIN public.product_units pu
      ON pu.product_id = p.id AND pu.unit_level = 0
    LEFT JOIN public.depots d ON d.id = p.depot_id
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE p.is_active = true
      AND (p_depot_id IS NULL OR p.depot_id = p_depot_id)
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_product_id IS NULL OR p.id = p_product_id)
  ),
  stock_json AS (
    SELECT jsonb_build_object(
      'product_id', sb.product_id,
      'name', sb.name,
      'depot_id', sb.depot_id,
      'depot_name', sb.depot_name,
      'category_id', sb.category_id,
      'category_name', sb.category_name,
      'current_stock_pieces', sb.current_stock_pieces,
      'unit_name', sb.unit_name,
      'cost_price_cfa', sb.cost_price_cfa,
      'selling_price_cfa', sb.selling_price_cfa,
      'stock_value_cost_cfa', sb.stock_value_cost_cfa,
      'stock_value_selling_cfa', sb.stock_value_selling_cfa,
      'stock_status', sb.stock_status,
      'track_low_stock', sb.track_low_stock,
      'low_stock_threshold', sb.low_stock_threshold
    ) AS row_json,
    sb.stock_status,
    sb.current_stock_pieces,
    sb.name AS sort_name
    FROM stock_base sb
  )
  SELECT
    COALESCE(jsonb_agg(sj.row_json ORDER BY sj.sort_name), '[]'::jsonb),
    COALESCE(jsonb_agg(sj.row_json ORDER BY sj.current_stock_pieces, sj.sort_name)
      FILTER (WHERE sj.stock_status = 'low_stock'), '[]'::jsonb)
  INTO v_stock_rows, v_low_rows
  FROM stock_json sj;

  SELECT COUNT(*)
  INTO v_low_stock_count
  FROM public.products p
  WHERE p.is_active = true
    AND (p_depot_id IS NULL OR p.depot_id = p_depot_id)
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (p_product_id IS NULL OR p.id = p_product_id)
    AND p.track_low_stock = true
    AND p.current_stock_pieces > 0
    AND p.low_stock_threshold IS NOT NULL
    AND p.current_stock_pieces <= p.low_stock_threshold;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', p.id,
      'name', p.name,
      'depot_id', p.depot_id,
      'depot_name', d.name,
      'category_id', p.category_id,
      'category_name', c.name,
      'current_stock_pieces', p.current_stock_pieces,
      'unit_name', pu.unit_name,
      'cost_price_cfa', COALESCE(pu.cost_price_cfa, 0),
      'selling_price_cfa', COALESCE(pu.selling_price_cfa, 0),
      'stock_value_cost_cfa', p.current_stock_pieces * COALESCE(pu.cost_price_cfa, 0),
      'stock_value_selling_cfa', p.current_stock_pieces * COALESCE(pu.selling_price_cfa, 0),
      'stock_status', 'out_of_stock',
      'track_low_stock', p.track_low_stock,
      'low_stock_threshold', p.low_stock_threshold
    ) ORDER BY p.name
  ), '[]'::jsonb)
  INTO v_out_rows
  FROM public.products p
  LEFT JOIN public.product_units pu ON pu.product_id = p.id AND pu.unit_level = 0
  LEFT JOIN public.depots d ON d.id = p.depot_id
  LEFT JOIN public.categories c ON c.id = p.category_id
  WHERE p.is_active = true
    AND p.current_stock_pieces <= 0
    AND (p_depot_id IS NULL OR p.depot_id = p_depot_id)
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (p_product_id IS NULL OR p.id = p_product_id);

  SELECT COUNT(*)
  INTO v_out_stock_count
  FROM public.products p
  WHERE p.is_active = true
    AND p.current_stock_pieces <= 0
    AND (p_depot_id IS NULL OR p.depot_id = p_depot_id)
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (p_product_id IS NULL OR p.id = p_product_id);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'transaction_type', t.transaction_type,
      'quantity_pieces', t.qty,
      'transaction_count', t.cnt
    ) ORDER BY t.transaction_type
  ), '[]'::jsonb)
  INTO v_movement
  FROM (
    SELECT transaction_type, SUM(quantity_pieces) AS qty, COUNT(*) AS cnt
    FROM public.inventory_transactions it
    WHERE (it.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR it.depot_id = p_depot_id)
      AND (
        p_category_id IS NULL AND p_product_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.products pr
          WHERE pr.id = it.product_id
            AND (p_category_id IS NULL OR pr.category_id = p_category_id)
            AND (p_product_id IS NULL OR pr.id = p_product_id)
        )
      )
    GROUP BY transaction_type
  ) t;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'adjustment_type', t.adjustment_type,
      'quantity_pieces', t.qty,
      'transaction_count', t.cnt
    ) ORDER BY t.adjustment_type
  ), '[]'::jsonb)
  INTO v_adj_breakdown
  FROM (
    SELECT ia.adjustment_type, SUM(ia.quantity_pieces) AS qty, COUNT(*) AS cnt
    FROM public.inventory_adjustments ia
    JOIN public.products pr ON pr.id = ia.product_id
    WHERE (ia.created_at AT TIME ZONE 'Africa/Abidjan')::date
          BETWEEN p_start_date AND p_end_date
      AND (p_depot_id IS NULL OR ia.depot_id = p_depot_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (p_product_id IS NULL OR pr.id = p_product_id)
    GROUP BY ia.adjustment_type
  ) t;

  RETURN jsonb_build_object(
    'inventory_value_cfa', v_total_value,
    'current_stock', v_stock_rows,
    'low_stock', v_low_rows,
    'out_of_stock', v_out_rows,
    'period_movement', v_movement,
    'adjustment_breakdown', v_adj_breakdown,
    'low_stock_count', v_low_stock_count,
    'out_of_stock_count', v_out_stock_count,
    'start_date', p_start_date,
    'end_date', p_end_date
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_report_inventory(uuid, date, date, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_report_inventory(uuid, date, date, uuid, uuid) TO authenticated;


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

  SELECT COALESCE(SUM(p.amount_cfa), 0), COUNT(*)
  INTO v_reversed_cfa, v_reversed_count
  FROM public.payments p
  WHERE p.payment_type = 'customer_payment'
    AND p.is_reversed = true
    AND (p.recorded_at AT TIME ZONE 'Africa/Abidjan')::date
        BETWEEN p_start_date AND p_end_date
    AND (
      p_depot_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.shifts sh
        WHERE sh.id = p.shift_id AND sh.depot_id = p_depot_id
      )
    );

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
      AND (
        p_depot_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.shifts sh
          WHERE sh.id = pay.shift_id AND sh.depot_id = p_depot_id
        )
      )
    ORDER BY pay.recorded_at DESC
    LIMIT 100
  ) p
  LEFT JOIN public.shifts sh ON sh.id = p.shift_id
  LEFT JOIN public.staff st ON st.id = sh.cashier_id;

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
    ORDER BY pay.recorded_at DESC
    LIMIT 100
  ) p
  LEFT JOIN public.shifts sh ON sh.id = p.shift_id
  LEFT JOIN public.staff st ON st.id = sh.cashier_id;

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
      'depot_name', d.name,
      'cashier_id', s.cashier_id,
      'cashier_name', st.full_name,
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
  ) s
  JOIN public.depots d ON d.id = s.depot_id
  JOIN public.staff st ON st.id = s.cashier_id;

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
