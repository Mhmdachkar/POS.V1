-- One stock classification for dashboard, inventory, reports, and depot overview.
-- 'ok' | 'faible' | 'rupture' | 'non_suivi'
-- Untracked products at zero are non_suivi, never rupture.

CREATE OR REPLACE FUNCTION private.product_stock_status(p_product_id uuid, p_depot_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, private
AS $$
  SELECT CASE
    WHEN p.track_low_stock IS NOT TRUE AND p.current_stock_pieces <= 0 THEN 'non_suivi'
    WHEN p.track_low_stock IS NOT TRUE THEN 'ok'
    WHEN p.current_stock_pieces <= 0 THEN 'rupture'
    WHEN p.low_stock_threshold IS NOT NULL
      AND p.current_stock_pieces <= p.low_stock_threshold THEN 'faible'
    ELSE 'ok'
  END
  FROM public.products p
  WHERE p.id = p_product_id
    AND (p_depot_id IS NULL OR p.depot_id = p_depot_id);
$$;

REVOKE ALL ON FUNCTION private.product_stock_status(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.product_stock_status(uuid, uuid) TO authenticated;
