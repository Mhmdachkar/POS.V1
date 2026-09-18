-- ================================================================
-- CEO Notes Phase — Migration: Stock Entries Cost Snapshot
-- ================================================================
--
-- CHANGES:
--   Add unit_cost_price_cfa and total_cost_cfa to stock_entries.
--   Both nullable — historical rows cannot have accurate cost
--   reconstructed (unit prices may have changed since entry).
--
-- HISTORICAL SAFETY:
--   Existing rows stay NULL. Never fabricate historical cost.
--   Only new restocks (via updated restock_product RPC) will have
--   these values populated at the time of restock.
--   If the product's cost_price_cfa is later edited, historical
--   restock snapshots remain unchanged.
-- ================================================================

ALTER TABLE public.stock_entries
  ADD COLUMN IF NOT EXISTS unit_cost_price_cfa numeric(14,2)
    CHECK (unit_cost_price_cfa IS NULL OR unit_cost_price_cfa >= 0),
  ADD COLUMN IF NOT EXISTS total_cost_cfa numeric(14,2)
    CHECK (total_cost_cfa IS NULL OR total_cost_cfa >= 0);

COMMENT ON COLUMN public.stock_entries.unit_cost_price_cfa IS
  'Cost per base piece at time of restock. Frozen snapshot. NULL for pre-migration rows.';

COMMENT ON COLUMN public.stock_entries.total_cost_cfa IS
  'Total acquisition cost for this restock (unit_cost_price_cfa * quantity_pieces). Frozen snapshot. NULL for pre-migration rows.';

-- Index for cost report queries ordered by date
CREATE INDEX IF NOT EXISTS stock_entries_cost_depot_idx
  ON public.stock_entries (depot_id, entered_at DESC)
  WHERE unit_cost_price_cfa IS NOT NULL;
