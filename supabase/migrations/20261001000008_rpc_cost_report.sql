-- ================================================================
-- CEO Notes Phase — RPC: admin_report_cost_detail
-- ================================================================
--
-- Two result sections:
--
-- 1. inventory_cost: per-product current inventory valuation
--    - product, serial, depot, category
--    - current_stock_pieces
--    - cost_price_cfa (per piece, from L0 product_units)
--    - selling_price_cfa (per piece, from L0 product_units)
--    - inventory_value_at_cost = current_stock_pieces × cost_price_cfa
--    - inventory_value_at_selling = current_stock_pieces × selling_price_cfa
--    - potential_profit = inventory_value_at_selling - inventory_value_at_cost
--
-- 2. restock_log: historical restock entries with cost snapshot
--    - only rows where unit_cost_price_cfa IS NOT NULL (new restocks)
--    - date, depot, product, serial, unit, qty_in_unit, qty_pieces,
--      unit_cost_per_piece, total_cost
--
-- 3. period_totals: summary for the date range
--    - total_restock_quantity_pieces
--    - total_restock_cost_cfa
--
-- AUTHORIZATION: admin only.
-- DEPOT: admin can pass p_depot_id=NULL for all depots they manage.
--
-- NOTE on inventory cost:
--   Uses product_units.cost_price_cfa for L0 (per-piece cost).
--   This is the CURRENT cost price. For historical accuracy, use restock_log.
--   The inventory section shows current valuation snapshot only.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_report_cost_detail(
  p_depot_id    uuid    DEFAULT NULL,
  p_start_date  date    DEFAULT NULL,
  p_end_date    date    DEFAULT NULL,
  p_category_id uuid    DEFAULT NULL,
  p_product_id  uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx                   private.caller_ctx;
  v_inventory_cost        jsonb := '[]'::jsonb;
  v_restock_log           jsonb := '[]'::jsonb;
  v_total_restock_pieces  numeric := 0;
  v_total_restock_cost    numeric := 0;
  v_total_inv_cost        numeric := 0;
  v_total_inv_selling     numeric := 0;
  v_total_potential_profit numeric := 0;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  -- ── 1. Current Inventory Valuation ───────────────────────────
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id',               p.id,
      'product_name',             p.name,
      'photo_url',                p.photo_url,
      'depot_id',                 p.depot_id,
      'depot_name',               d.name,
      'category_id',              p.category_id,
      'category_name',            cat.name,
      'current_stock_pieces',     p.current_stock_pieces,
      -- Piece-level serial (L0 unit definition serial)
      'serial_number',            pu0.serial_number,
      -- Piece-level cost and price
      'cost_price_cfa',           pu0.cost_price_cfa,
      'selling_price_cfa',        pu0.selling_price_cfa,
      -- Inventory valuation at current prices
      'inventory_value_at_cost',
        round(p.current_stock_pieces * pu0.cost_price_cfa, 2),
      'inventory_value_at_selling',
        round(p.current_stock_pieces * pu0.selling_price_cfa, 2),
      'potential_profit',
        round(p.current_stock_pieces * (pu0.selling_price_cfa - pu0.cost_price_cfa), 2),
      'is_active',                p.is_active
    )
    ORDER BY d.name, cat.name, p.name
  ), '[]'::jsonb)
  INTO v_inventory_cost
  FROM public.products p
  JOIN public.depots d ON d.id = p.depot_id
  JOIN public.categories cat ON cat.id = p.category_id
  -- L0 unit for piece-level cost/price
  LEFT JOIN public.product_units pu0
    ON pu0.product_id = p.id AND pu0.unit_level = 0
  WHERE p.is_active = true
    AND (p_depot_id IS NULL OR p.depot_id = p_depot_id)
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (p_product_id IS NULL OR p.id = p_product_id);

  -- ── Inventory totals ──────────────────────────────────────────
  SELECT
    coalesce(SUM(round(p.current_stock_pieces * pu0.cost_price_cfa, 2)), 0),
    coalesce(SUM(round(p.current_stock_pieces * pu0.selling_price_cfa, 2)), 0),
    coalesce(SUM(round(p.current_stock_pieces * (pu0.selling_price_cfa - pu0.cost_price_cfa), 2)), 0)
  INTO v_total_inv_cost, v_total_inv_selling, v_total_potential_profit
  FROM public.products p
  LEFT JOIN public.product_units pu0
    ON pu0.product_id = p.id AND pu0.unit_level = 0
  WHERE p.is_active = true
    AND (p_depot_id IS NULL OR p.depot_id = p_depot_id)
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (p_product_id IS NULL OR p.id = p_product_id);

  -- ── 2. Restock Cost Log (only new restocks with cost snapshot) ─
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'stock_entry_id',      se.id,
        'entered_at',          se.entered_at,
        'depot_id',            se.depot_id,
        'depot_name',          d.name,
        'product_id',          se.product_id,
        'product_name',        p.name,
        'photo_url',           p.photo_url,
        'category_name',       cat.name,
        'unit_level',          se.unit_level,
        'unit_name',           pu.unit_name,
        'serial_number',       pu.serial_number,
        'quantity_in_unit',    se.quantity_in_unit,
        'quantity_pieces',     se.quantity_pieces,
        'unit_cost_price_cfa', se.unit_cost_price_cfa,
        'total_cost_cfa',      se.total_cost_cfa,
        'note',                se.note,
        'entered_by_id',       se.entered_by,
        'entered_by_name',     st.full_name
      )
      ORDER BY se.entered_at DESC
    ), '[]'::jsonb)
    INTO v_restock_log
    FROM public.stock_entries se
    JOIN public.products p ON p.id = se.product_id
    JOIN public.depots d ON d.id = se.depot_id
    JOIN public.categories cat ON cat.id = p.category_id
    LEFT JOIN public.product_units pu
      ON pu.product_id = se.product_id AND pu.unit_level = se.unit_level
    LEFT JOIN public.staff st ON st.id = se.entered_by
    WHERE se.unit_cost_price_cfa IS NOT NULL  -- only new restocks with cost snapshot
      AND se.entered_at >= p_start_date::timestamptz
      AND se.entered_at <  p_end_date::timestamptz + INTERVAL '1 day'
      AND (p_depot_id IS NULL OR se.depot_id = p_depot_id)
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_product_id IS NULL OR se.product_id = p_product_id);

    -- Period totals
    SELECT
      coalesce(SUM(se.quantity_pieces), 0),
      coalesce(SUM(se.total_cost_cfa), 0)
    INTO v_total_restock_pieces, v_total_restock_cost
    FROM public.stock_entries se
    JOIN public.products p ON p.id = se.product_id
    WHERE se.unit_cost_price_cfa IS NOT NULL
      AND se.entered_at >= p_start_date::timestamptz
      AND se.entered_at <  p_end_date::timestamptz + INTERVAL '1 day'
      AND (p_depot_id IS NULL OR se.depot_id = p_depot_id)
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_product_id IS NULL OR se.product_id = p_product_id);
  ELSE
    -- No date range: return restock log without date filter
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'stock_entry_id',      se.id,
        'entered_at',          se.entered_at,
        'depot_id',            se.depot_id,
        'depot_name',          d.name,
        'product_id',          se.product_id,
        'product_name',        p.name,
        'category_name',       cat.name,
        'unit_level',          se.unit_level,
        'unit_name',           pu.unit_name,
        'serial_number',       pu.serial_number,
        'quantity_in_unit',    se.quantity_in_unit,
        'quantity_pieces',     se.quantity_pieces,
        'unit_cost_price_cfa', se.unit_cost_price_cfa,
        'total_cost_cfa',      se.total_cost_cfa,
        'note',                se.note
      )
      ORDER BY se.entered_at DESC
    ), '[]'::jsonb)
    INTO v_restock_log
    FROM public.stock_entries se
    JOIN public.products p ON p.id = se.product_id
    JOIN public.depots d ON d.id = se.depot_id
    LEFT JOIN public.product_units pu
      ON pu.product_id = se.product_id AND pu.unit_level = se.unit_level
    WHERE se.unit_cost_price_cfa IS NOT NULL
      AND (p_depot_id IS NULL OR se.depot_id = p_depot_id)
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_product_id IS NULL OR se.product_id = p_product_id);

    SELECT
      coalesce(SUM(se.quantity_pieces), 0),
      coalesce(SUM(se.total_cost_cfa), 0)
    INTO v_total_restock_pieces, v_total_restock_cost
    FROM public.stock_entries se
    JOIN public.products p ON p.id = se.product_id
    WHERE se.unit_cost_price_cfa IS NOT NULL
      AND (p_depot_id IS NULL OR se.depot_id = p_depot_id)
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_product_id IS NULL OR se.product_id = p_product_id);
  END IF;

  RETURN jsonb_build_object(
    'inventory_cost',    v_inventory_cost,
    'inventory_totals',  jsonb_build_object(
      'total_inventory_value_at_cost',    v_total_inv_cost,
      'total_inventory_value_at_selling', v_total_inv_selling,
      'total_potential_profit',           v_total_potential_profit
    ),
    'restock_log',       v_restock_log,
    'period_totals',     jsonb_build_object(
      'total_restock_quantity_pieces', v_total_restock_pieces,
      'total_restock_cost_cfa',        v_total_restock_cost
    ),
    'filters',           jsonb_build_object(
      'depot_id',     p_depot_id,
      'start_date',   p_start_date,
      'end_date',     p_end_date,
      'category_id',  p_category_id,
      'product_id',   p_product_id
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_report_cost_detail(uuid, date, date, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_report_cost_detail(uuid, date, date, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_report_cost_detail(uuid, date, date, uuid, uuid) IS
  'CEO Notes: inventory cost valuation + restock cost log (only rows with cost snapshots). Admin-only.';
