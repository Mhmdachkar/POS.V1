-- ================================================================
-- VHM POS — Migration 002: Products & Product Units
-- ================================================================
--
-- CONFIRMED ARCHITECTURE:
--   - Products belong to exactly ONE depot (depot_id is immutable)
--   - NO barcode / SKU columns (rejected)
--   - NO unique (depot_id, name) constraint (not confirmed as business rule)
--   - photo_url is mandatory (confirmed decision)
--   - current_stock_pieces:
--       * Only mutated by Edge Function RPCs (never direct client writes)
--       * Protected by SELECT ... FOR UPDATE inside every stock mutation
--       * CHECK >= 0 is a safety net, not the concurrency mechanism
--   - product_units: unit_level 0=piece (base), 1=package, 2=carton
--   - Conversion and prices are frozen at transaction time in
--     sale_items, stock_entries, sale_return_items, stock_transfer_items
--     so changing conversion_to_base never corrupts historical records
-- ================================================================

-- ─── Products ───────────────────────────────────────────────────

create table products (
  id                    uuid primary key default gen_random_uuid(),
  depot_id              uuid not null references depots(id),
  category_id           uuid not null references categories(id),
  name                  text not null,
  photo_url             text not null,          -- mandatory per confirmed decision
  current_stock_pieces  numeric(14,3) not null default 0
    check (current_stock_pieces >= 0),
    -- ⚠ Concurrency note: The >= 0 check is a safety net for bugs,
    -- NOT the concurrency mechanism. Every mutating Edge Function
    -- must acquire SELECT ... FOR UPDATE on this row BEFORE reading
    -- the stock value, and validate + update atomically in one
    -- transaction. Two concurrent sales against the same product
    -- must both hold the lock before checking stock.
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
  -- NOTE: No unique (depot_id, lower(name)) — product-name uniqueness
  -- per depot was NOT confirmed as a VHM business requirement.
);

create index products_depot_idx      on products (depot_id);
create index products_category_idx   on products (category_id);
create index products_active_depot_idx on products (depot_id, is_active);

comment on table products is
  'Products are depot-owned. depot_id is immutable. current_stock_pieces is authoritative stock.';

comment on column products.current_stock_pieces is
  'Only mutated by: sale, return, restock, adjustment, transfer. All via Edge Functions with SELECT ... FOR UPDATE.';

comment on column products.photo_url is
  'Mandatory — product photos are required for the POS product grid (confirmed business decision).';

-- ─── Product Units ───────────────────────────────────────────────
-- Each product can have 1–3 unit levels (piece is always level 0).
-- Prices are tracked per unit level (cost + selling).
-- conversion_to_base: how many pieces = 1 of this unit (piece = 1).
--
-- Historical note: changing conversion_to_base only affects future
-- transactions. Historical stock_entries / sale_items / etc. freeze
-- quantity_pieces at the time of the transaction, so they remain
-- correct even after a unit conversion change.

create table product_units (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products(id) on delete cascade,
  unit_level          smallint not null
    check (unit_level >= 0 and unit_level <= 2),
  unit_name           text not null,            -- 'Piece', 'Package', 'Carton', etc.
  conversion_to_base  numeric(14,3) not null
    check (conversion_to_base > 0),             -- pieces per unit (piece row = 1)
  cost_price_cfa      numeric(14,2) not null
    check (cost_price_cfa >= 0),
  selling_price_cfa   numeric(14,2) not null
    check (selling_price_cfa >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (product_id, unit_level)               -- one row per level per product
);

create index product_units_product_idx on product_units (product_id);

comment on table product_units is
  'Unit levels: 0=piece (base), 1=package, 2=carton. conversion_to_base = pieces per unit.';

comment on column product_units.conversion_to_base is
  'Pieces per unit of this level. Piece row has conversion=1. Changing this does not affect historical transaction quantities.';
