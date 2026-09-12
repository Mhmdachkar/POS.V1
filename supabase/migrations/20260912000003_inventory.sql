-- ================================================================
-- VHM POS — Migration 003: Inventory Tables
-- stock_entries (restock), inventory_adjustments, stock_transfers
-- ================================================================
--
-- CONFIRMED ARCHITECTURE:
--   - stock_entries = normal admin restocking (positive additions)
--   - inventory_adjustments = damage/loss/count corrections (separate!)
--     * DAMAGE, LOSS, EXPIRY: DB-enforced negative quantity
--     * COUNT_CORRECTION, OTHER: either sign
--   - stock_transfers = depot-to-depot movements
--     * destination product must already exist (never auto-created)
--     * from_product must belong to from_depot (trigger-enforced in 013)
--     * to_product must belong to to_depot   (trigger-enforced in 013)
--     * completion atomically decrements source + increments destination
--     * deadlock prevention: always lock products in ascending UUID order
-- ================================================================

-- ─── Stock Entries (Restock) ────────────────────────────────────
-- Records each restock event for a product.
-- Adding stock = admin-authorized incoming inventory.
-- Distinct from adjustments, which represent corrections/losses.
--
-- Phase 2 additions vs v1 schema:
--   + depot_id (denormalized) — avoids JOIN for per-depot queries
--   + note — allows recording context about the restock

create table stock_entries (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products(id),
  depot_id          uuid not null references depots(id),  -- denormalized from product
  unit_level        smallint not null
    check (unit_level >= 0 and unit_level <= 2),
  quantity_in_unit  numeric(14,3) not null
    check (quantity_in_unit > 0),
  quantity_pieces   numeric(14,3) not null
    check (quantity_pieces > 0),                -- frozen at entry: qty_in_unit * conversion_to_base
  note              text,
  entered_by        uuid not null references staff(id),
  entered_at        timestamptz not null default now()
);

create index stock_entries_product_idx on stock_entries (product_id);
create index stock_entries_depot_idx   on stock_entries (depot_id);
create index stock_entries_entered_at_idx on stock_entries (entered_at desc);

comment on table stock_entries is
  'Restock records. quantity_pieces frozen at entry time from unit conversion. depot_id denormalized.';

-- ─── Inventory Adjustments ──────────────────────────────────────
-- Adjustments are separate from restocking.
-- They represent damage, losses, count corrections, etc.
-- quantity_pieces is SIGNED (negative = stock removal).
--
-- DB-enforced sign rules:
--   DAMAGE, LOSS, EXPIRY  → quantity_pieces MUST be < 0 (stock reduction)
--   COUNT_CORRECTION       → either sign (can discover more stock or less)
--   OTHER                  → either sign (requires a reason)

create table inventory_adjustments (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products(id),
  depot_id          uuid not null references depots(id),  -- denormalized
  adjustment_type   text not null
    check (adjustment_type in ('DAMAGE', 'LOSS', 'COUNT_CORRECTION', 'EXPIRY', 'OTHER')),
  quantity_pieces   numeric(14,3) not null
    check (quantity_pieces <> 0),               -- signed; zero is invalid
  reason            text,                       -- required for OTHER (enforced in RPC)
  created_by        uuid not null references staff(id),
  created_at        timestamptz not null default now(),

  -- DB-level sign enforcement for physical stock-reduction types
  constraint adjustment_sign_check check (
    (adjustment_type in ('DAMAGE', 'LOSS', 'EXPIRY') and quantity_pieces < 0)
    or (adjustment_type in ('COUNT_CORRECTION', 'OTHER'))
  )
);

create index inventory_adjustments_product_idx on inventory_adjustments (product_id);
create index inventory_adjustments_depot_idx   on inventory_adjustments (depot_id);
create index inventory_adjustments_created_at_idx on inventory_adjustments (created_at desc);

comment on table inventory_adjustments is
  'Separate from stock_entries. Signed quantity_pieces: negative for DAMAGE/LOSS/EXPIRY. DB enforces sign per type.';

-- ─── Stock Transfers ────────────────────────────────────────────
-- Transfers move stock between depots.
-- A transfer has a header (stock_transfers) and line items (stock_transfer_items).
--
-- Status lifecycle:
--   pending   → default on creation (stock NOT yet moved)
--   completed → stock atomically moved, cannot be undone
--   cancelled → stock never moved, no financial effect
--
-- Stock is ONLY decremented/incremented when status changes to
-- 'completed' via the complete_transfer RPC, which uses:
--   1. SELECT stock_transfers FOR UPDATE (lock the transfer)
--   2. SELECT products FOR UPDATE in ascending UUID order (all involved products)
--   3. Validate sufficient source stock
--   4. Atomically update both source and destination
--
-- completed_by: records which staff member completed the transfer (added for audit).

create table stock_transfers (
  id              uuid primary key default gen_random_uuid(),
  from_depot_id   uuid not null references depots(id),
  to_depot_id     uuid not null references depots(id),
  status          text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled')),
  created_by      uuid not null references staff(id),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  completed_by    uuid references staff(id),    -- who completed (or null if not yet completed)
  note            text,

  check (from_depot_id <> to_depot_id)          -- cannot transfer to self
);

create index stock_transfers_from_depot_idx on stock_transfers (from_depot_id);
create index stock_transfers_to_depot_idx   on stock_transfers (to_depot_id);
create index stock_transfers_status_idx     on stock_transfers (status);
create index stock_transfers_created_at_idx on stock_transfers (created_at desc);

comment on table stock_transfers is
  'Depot-to-depot transfer header. Stock only moves on status=completed. Atomic completion via complete_transfer RPC.';

-- ─── Stock Transfer Items ───────────────────────────────────────
-- Each item in a transfer specifies:
--   from_product_id: must belong to from_depot_id (trigger-validated in 013)
--   to_product_id:   must belong to to_depot_id   (trigger-validated in 013)
--   quantity_pieces: frozen at transfer creation from unit conversion
--
-- from_product and to_product are different rows (different depots).
-- The destination product must already exist — transfers never
-- silently create products at the destination.

create table stock_transfer_items (
  id                uuid primary key default gen_random_uuid(),
  transfer_id       uuid not null references stock_transfers(id) on delete cascade,
  from_product_id   uuid not null references products(id),
  to_product_id     uuid not null references products(id),
  unit_level        smallint not null
    check (unit_level >= 0 and unit_level <= 2),
  quantity_in_unit  numeric(14,3) not null
    check (quantity_in_unit > 0),
  quantity_pieces   numeric(14,3) not null
    check (quantity_pieces > 0),                -- frozen at creation time

  check (from_product_id <> to_product_id)      -- must be different product rows

  -- IMPORTANT: Cross-depot ownership validation (from_product belongs
  -- to from_depot; to_product belongs to to_depot) is enforced via
  -- trigger in migration 013, because CHECK constraints cannot
  -- reference other tables in standard Postgres.
);

create index stock_transfer_items_transfer_idx      on stock_transfer_items (transfer_id);
create index stock_transfer_items_from_product_idx  on stock_transfer_items (from_product_id);
create index stock_transfer_items_to_product_idx    on stock_transfer_items (to_product_id);

comment on table stock_transfer_items is
  'Transfer line items. Depot ownership validated by trigger (013). quantity_pieces frozen at creation.';
