-- ================================================================
-- B6 -- Reports and dashboard use payable totals; depot KPIs include
--       unattributed (null-shift) payments.
-- ================================================================
-- payable = COALESCE(admin_override_total_cfa, total_cfa)
-- Line KPIs use the line share of payable so product/category filters
-- stay consistent with the sale total actually taken.
-- Existing rows are not modified.
-- ================================================================

CREATE OR REPLACE FUNCTION private.sale_line_payable_share(
  p_net_line numeric,
  p_sale_total numeric,
  p_override numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_sale_total > 0 THEN
      ROUND(p_net_line * COALESCE(p_override, p_sale_total) / p_sale_total, 2)
    ELSE COALESCE(p_net_line, 0)
  END;
$$;

CREATE OR REPLACE FUNCTION private.payment_matches_report_depot(
  p_shift_id uuid,
  p_recorded_by uuid,
  p_depot_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_depot_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.shifts sh
      WHERE sh.id = p_shift_id AND sh.depot_id = p_depot_id
    )
    OR (
      p_shift_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.staff st
        WHERE st.id = p_recorded_by AND st.depot_id = p_depot_id
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION private.sale_line_payable_share(numeric, numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.payment_matches_report_depot(uuid, uuid, uuid) FROM PUBLIC;

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
  SELECT COALESCE(SUM(private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa)), 0)
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

  SELECT COUNT(*), COALESCE(SUM(COALESCE(s.admin_override_total_cfa, s.total_cfa)), 0)
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
    SELECT s.id, COALESCE(SUM(private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa)), 0) AS line_total
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
      private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa) AS revenue,
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
      COALESCE(SUM(private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa)), 0) AS sales_activity_cfa,
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
      COALESCE(SUM(private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa)), 0) AS sales_activity_cfa,
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
      COALESCE(SUM(private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa)), 0) AS sales_activity_cfa,
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
      COALESCE(SUM(private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa)), 0) AS sales_activity_cfa,
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
    SELECT COUNT(DISTINCT s.id) AS cnt, COALESCE(SUM(private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa)), 0) AS amt
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
    SELECT COUNT(DISTINCT s.id) AS cnt, COALESCE(SUM(private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa)), 0) AS amt
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
      COALESCE(SUM(private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa)), 0) AS sales_activity_cfa
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
      AND (
        p_depot_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.staff st
          WHERE st.id = pay.recorded_by AND st.depot_id = p_depot_id
        )
      )
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
    SELECT s.id, s.created_at, s.depot_id
    FROM public.sales s
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
  ),
  item_net AS (
    SELECT
      si.id,
      si.product_id,
      ts.created_at,
      si.quantity_in_unit,
      si.quantity_pieces,
      si.cost_price_cfa,
      private.sale_line_payable_share(si.net_line_total_cfa, s.total_cfa, s.admin_override_total_cfa) AS payable_line,
      COALESCE(SUM(sri.quantity_in_unit), 0)  AS returned_units,
      COALESCE(SUM(sri.quantity_pieces), 0)   AS returned_pieces,
      COALESCE(SUM(sri.refund_amount_cfa), 0) AS returned_refund
    FROM today_sales ts
    JOIN public.sales s ON s.id = ts.id
    JOIN public.sale_items si ON si.sale_id = ts.id
    LEFT JOIN public.sale_return_items sri ON sri.sale_item_id = si.id
    GROUP BY si.id, si.product_id, ts.created_at, si.quantity_in_unit,
             si.quantity_pieces, si.cost_price_cfa, s.total_cfa, s.admin_override_total_cfa
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
    COALESCE(SUM(remaining_net), 0),
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
