-- ================================================================
-- VHM POS — Migration 010: Additional Performance Indexes
-- ================================================================
--
-- This migration adds:
--   1. GIN trigram indexes for fast partial text search
--      (product name, customer name) — enables the POS product grid
--      and customer lookup to use ilike '%query%' efficiently
--   2. Additional composite indexes for common query patterns
--      not covered by the individual table migrations
--
-- Extensions were already enabled in migration 001.
-- pg_trgm re-enabled with IF NOT EXISTS here as a safety net.
-- ================================================================

-- ─── Ensure extensions are present ─────────────────────────────

create extension if not exists "pg_trgm";

-- ─── Trigram Indexes ────────────────────────────────────────────
-- These allow queries like:
--   WHERE name ilike '%query%'
-- to use an index instead of a full table scan.
-- Essential for the POS product grid (fast search as you type).

-- Product name search (POS grid, inventory management)
create index products_name_trgm_idx
  on products using gin (name gin_trgm_ops);

-- Customer name search (sale creation, payment recording, customer lookup)
create index customers_name_trgm_idx
  on customers using gin (name gin_trgm_ops);

-- ─── Additional Composite Indexes ──────────────────────────────

-- Sales: most common report query — "all sales for cashier X in depot Y"
create index if not exists sales_depot_cashier_date_idx
  on sales (depot_id, cashier_id, created_at desc);

-- Sales: active (non-voided) sales for a customer
create index if not exists sales_customer_status_idx
  on sales (customer_id, status)
  where customer_id is not null;

-- Payments: balance computation — active (non-reversed) payments per customer
create index if not exists payments_customer_balance_idx
  on payments (customer_id, amount_cfa)
  where is_reversed = false;

-- Stock entries: per-product restock history
create index if not exists stock_entries_product_date_idx
  on stock_entries (product_id, entered_at desc);

-- Inventory adjustments: per-product adjustment history
create index if not exists inventory_adj_product_date_idx
  on inventory_adjustments (product_id, created_at desc);

-- Sale returns: per-sale return history (for return validation)
create index if not exists sale_returns_sale_date_idx
  on sale_returns (sale_id, created_at desc);

-- Sale return items: return quantity check per sale_item
-- Used by process_return RPC to validate not over-returning
create index if not exists return_items_sale_item_idx
  on sale_return_items (sale_item_id);

-- Products: active products only, per depot (POS product grid)
create index if not exists products_depot_active_name_idx
  on products (depot_id, name)
  where is_active = true;

-- Staff: lookup by username (login flow synthetic email mapping)
create index if not exists staff_username_lower_idx
  on staff (lower(username));

comment on index products_name_trgm_idx is
  'GIN trigram index for ilike product name search. Required for POS product discovery.';

comment on index customers_name_trgm_idx is
  'GIN trigram index for ilike customer name search. Required for customer lookup at POS.';
