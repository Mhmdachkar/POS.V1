-- =====================================================================
-- VHM Multi-Depot Inventory & POS System — Data Model (Supabase/Postgres)
-- =====================================================================
-- Status: v2 schema — hardening pass after external review, ready for
-- one more look before Edge Function / RLS work starts.
--
-- KEPT FROM V1, UNCHANGED
-- business_settings, product_units, stock_entries, shifts, sale_items,
-- payments, audit_log. The depot-owned product architecture (a product
-- row belongs to exactly one depot; categories are a single shared
-- tree across depots) is CONFIRMED and unchanged — the stock_transfers
-- design below is built specifically around that, not a shared
-- catalog. Flag it now if that's not actually the intent, since the
-- transfer tables would need to change shape.
--
-- ADDED IN V2 (all explicitly requested)
--   - is_active on depots, categories, products, staff — soft
--     deactivation instead of hard deletes on anything that
--     participates in transactions
--   - deactivated_at on staff
--   - category name uniqueness per parent, case-insensitive
--   - sales.status: completed / voided / partially_returned / returned
--   - sales.receipt_number — human-facing, built from a new
--     depots.code + depots.receipt_seq counter
--   - sales tender/applied/change split, replacing the single
--     amount_paid_cfa, so a cash sale can be tendered above the total
--     and give change without breaking the balance math
--   - sale_returns / sale_return_items — restocks inventory, reverses
--     the customer-balance impact and/or records a cash refund,
--     without ever editing the original sale row
--   - inventory_adjustments — damage / loss / count correction / expiry
--   - stock_transfers / stock_transfer_items — depot-to-depot stock
--     movement with an explicit destination product row (never assumes
--     two depots share a product id)
--   - sales.customer_id is now nullable — the cashier explicitly picks
--     Walk-in vs a selected customer at checkout; a sale that adds to
--     a customer balance must still name a customer (enforced below)
--   - current_stock_pieces >= 0 check, plus a written-down concurrency
--     requirement for every Edge Function that mutates it (see the
--     note by that column, and the implementation note at the bottom)
--
-- RAISED IN REVIEW, DELIBERATELY NOT ADOPTED
--   - barcode / SKU on products — not needed for this deployment
--   - a payment_methods table / payment method field — cash is the
--     only accepted payment method
--   - one-open-shift-per-cashier constraint — not needed right now
--   - suppliers, loyalty, promotions, taxes, product variants, a full
--     accounting ledger — out of scope
-- =====================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------
-- Business-wide settings (single row) — receipt branding, exchange rate
-- ---------------------------------------------------------------------
create table business_settings (
  id                 boolean primary key default true check (id), -- enforces single row
  business_name      text not null default 'VHM',
  logo_url           text,
  cfa_to_usd_rate    numeric(12,6) not null,
  rate_updated_at    timestamptz not null default now(),
  rate_updated_by    uuid, -- fk to staff, added below after staff exists
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Depots
-- ---------------------------------------------------------------------
create table depots (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  location      text not null,
  code          text not null unique, -- short code for receipts, e.g. 'DKR'
  is_active     boolean not null default true,
  receipt_seq   integer not null default 1, -- next receipt sequence number for this depot
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Staff accounts (admin / cashier / depot_staff), mapped 1:1 to
-- Supabase Auth users. Supabase Auth requires an email, so the
-- "username" the admin sets is stored here and mapped to a synthetic
-- email (e.g. "<username>@vhm-pos.internal") at account-creation time
-- in an Edge Function — the human-facing login is still just username
-- + password.
-- ---------------------------------------------------------------------
create table staff (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text not null unique,
  full_name      text not null,
  role           text not null check (role in ('admin', 'cashier', 'depot_staff')),
  depot_id       uuid references depots(id), -- null for admin
  is_active      boolean not null default true,
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),

  -- exactly one cashier and one depot_staff per depot (spec: "1 per depot, strictly")
  constraint depot_required_for_non_admin
    check ( (role = 'admin' and depot_id is null) or (role <> 'admin' and depot_id is not null) )
);

create unique index one_cashier_per_depot
  on staff (depot_id) where role = 'cashier';
create unique index one_depot_staff_per_depot
  on staff (depot_id) where role = 'depot_staff';

alter table business_settings
  add constraint business_settings_rate_updated_by_fkey
  foreign key (rate_updated_by) references staff(id);

-- ---------------------------------------------------------------------
-- Categories — self-referencing, unlimited nesting, shared across depots
-- ---------------------------------------------------------------------
create table categories (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references categories(id) on delete restrict,
  name          text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- one name per parent, case-insensitive. Root categories (parent_id
-- null) are checked in a second index since a plain unique index
-- treats every null as distinct in Postgres.
create unique index categories_unique_name_per_parent
  on categories (parent_id, lower(name))
  where parent_id is not null;

create unique index categories_unique_root_name
  on categories (lower(name))
  where parent_id is null;

-- ---------------------------------------------------------------------
-- Products — belong to exactly one depot (confirmed architecture)
-- ---------------------------------------------------------------------
create table products (
  id                    uuid primary key default gen_random_uuid(),
  depot_id              uuid not null references depots(id),
  category_id           uuid not null references categories(id),
  name                  text not null,
  photo_url             text not null,          -- mandatory, per confirmed decision
  current_stock_pieces  numeric(14,3) not null default 0 check (current_stock_pieces >= 0),
    -- normalized stock in the smallest unit ("piece"). Only ever
    -- written by Edge Functions (restock / sale / return / adjustment
    -- / transfer), never directly by clients. The >= 0 check catches
    -- an incorrect write, but it cannot by itself prevent two
    -- concurrent transactions from both reading enough stock and both
    -- succeeding — every mutating function MUST take this row with
    -- `select ... for update` (or run at serializable isolation)
    -- inside the same transaction as the write. See the implementation
    -- note at the end of this file.
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index products_depot_idx on products (depot_id);
create index products_category_idx on products (category_id);

-- ---------------------------------------------------------------------
-- Product units — one row per unit level a product is sold/costed in
-- (piece is always level 0 / the base unit; package and carton are
-- optional additional levels built on top of it). Cost price is
-- tracked per level, same as selling price (confirmed decision).
-- Unchanged from v1.
-- ---------------------------------------------------------------------
create table product_units (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products(id) on delete cascade,
  unit_level          smallint not null,        -- 0 = piece (base), 1 = package, 2 = carton
  unit_name           text not null,            -- e.g. 'Piece', 'Package', 'Carton'
  conversion_to_base  numeric(14,3) not null,   -- how many pieces = 1 of this unit (piece row = 1)
  cost_price_cfa      numeric(14,2) not null,
  selling_price_cfa   numeric(14,2) not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (product_id, unit_level),
  check (unit_level >= 0 and unit_level <= 2),
  check (conversion_to_base > 0)
);

-- Note on the "unit conversion changes mid-life" decision (v1):
-- product_units.conversion_to_base can be UPDATED going forward.
-- Historical correctness is preserved because stock_entries and
-- sale_items each store their OWN computed piece-quantity at the time
-- of the transaction — they don't recompute from the current
-- conversion_to_base later. sale_return_items follows the same rule.

-- ---------------------------------------------------------------------
-- Stock entries — admin's manual restock log (adds to existing stock).
-- Unchanged from v1.
-- ---------------------------------------------------------------------
create table stock_entries (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products(id),
  unit_level        smallint not null,      -- which unit the admin entered the restock in
  quantity_in_unit  numeric(14,3) not null check (quantity_in_unit > 0),
  quantity_pieces   numeric(14,3) not null, -- computed & frozen at entry time
  entered_by        uuid not null references staff(id),
  entered_at        timestamptz not null default now()
);

create index stock_entries_product_idx on stock_entries (product_id);

-- ---------------------------------------------------------------------
-- Inventory adjustments — damage, loss, count correction, expiry.
-- Kept separate from stock_entries (which specifically means "admin
-- restocked this") so the two stay easy to distinguish in reports.
-- ---------------------------------------------------------------------
create table inventory_adjustments (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products(id),
  depot_id          uuid not null references depots(id), -- denormalized, matches product's depot
  adjustment_type   text not null check (adjustment_type in ('DAMAGE', 'LOSS', 'COUNT_CORRECTION', 'EXPIRY', 'OTHER')),
  quantity_pieces   numeric(14,3) not null check (quantity_pieces <> 0),
    -- signed: negative for DAMAGE / LOSS / EXPIRY, positive for a
    -- COUNT_CORRECTION that discovers more stock than recorded
  reason            text,
  created_by        uuid not null references staff(id),
  created_at        timestamptz not null default now()
);

create index inventory_adjustments_product_idx on inventory_adjustments (product_id);
create index inventory_adjustments_depot_idx on inventory_adjustments (depot_id);

-- ---------------------------------------------------------------------
-- Stock transfers — depot-to-depot stock movement.
--
-- Because a product row belongs to exactly one depot, a transfer can't
-- just move quantity under one shared product id — the receiving
-- depot needs its OWN product row for the item. to_product_id is
-- required and must already exist at the destination depot; a
-- transfer never silently creates or assumes a matching product on
-- the other side.
-- ---------------------------------------------------------------------
create table stock_transfers (
  id              uuid primary key default gen_random_uuid(),
  from_depot_id   uuid not null references depots(id),
  to_depot_id     uuid not null references depots(id),
  status          text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  created_by      uuid not null references staff(id),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  note            text,

  check (from_depot_id <> to_depot_id)
);

create table stock_transfer_items (
  id                uuid primary key default gen_random_uuid(),
  transfer_id       uuid not null references stock_transfers(id) on delete cascade,
  from_product_id   uuid not null references products(id), -- must belong to from_depot_id
  to_product_id     uuid not null references products(id), -- must belong to to_depot_id
  unit_level        smallint not null,
  quantity_in_unit  numeric(14,3) not null check (quantity_in_unit > 0),
  quantity_pieces   numeric(14,3) not null, -- frozen conversion at transfer time

  check (from_product_id <> to_product_id)
);

create index stock_transfer_items_transfer_idx on stock_transfer_items (transfer_id);

-- Completing a transfer must, in one transaction: decrement
-- from_product's current_stock_pieces, increment to_product's, and
-- set stock_transfers.status = 'completed' + completed_at. Same
-- row-locking requirement as any other stock mutation (see the
-- implementation note at the end of this file). Which staff roles may
-- create vs. complete a transfer is an RLS decision, not a schema one.

-- ---------------------------------------------------------------------
-- Shifts — cashier cash reconciliation (defined before `sales`, which
-- references it). Unchanged from v1 — no one-open-shift-per-cashier
-- constraint added, per decision.
-- ---------------------------------------------------------------------
create table shifts (
  id                  uuid primary key default gen_random_uuid(),
  depot_id            uuid not null references depots(id),
  cashier_id          uuid not null references staff(id),
  opening_float_cfa   numeric(14,2) not null,
  opened_at           timestamptz not null default now(),
  closed_at           timestamptz,
  expected_cash_cfa   numeric(14,2), -- computed at close: float + cash sales + payments received
  actual_cash_cfa     numeric(14,2),
  discrepancy_cfa     numeric(14,2), -- actual - expected
  status              text not null default 'open' check (status in ('open', 'closed'))
);

create index shifts_depot_idx on shifts (depot_id);
create index shifts_cashier_idx on shifts (cashier_id);

-- ---------------------------------------------------------------------
-- Customers. Unchanged from v1.
-- ---------------------------------------------------------------------
create table customers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  phone          text,
  address        text,
  balance_owed_cfa numeric(14,2) not null default 0,
    -- maintained transactionally by Edge Functions on sale / payment / return
  created_by     uuid not null references staff(id), -- cashier or admin
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Sales — one row per checkout. Canonical amounts stored in CFA;
-- display currency + rate-at-time-of-sale kept for the receipt/audit.
--
-- customer_id is now nullable: the cashier explicitly picks Walk-in
-- (customer_id null) or a selected customer at checkout, rather than
-- the system silently attaching every anonymous sale to a placeholder
-- customer row. A sale that puts anything on a customer's balance
-- MUST name a customer — enforced below.
--
-- v1's single amount_paid_cfa is replaced by a tender/applied/change
-- split, so a cash sale can be tendered above the total and give
-- change without breaking the balance math:
--   amount_tendered_cfa — cash actually handed over by the customer
--   amount_applied_cfa  — the portion of that applied to the sale
--                         itself (<= total_cfa)
--   change_given_cfa    — tendered minus applied, handed back
--   balance_added_cfa   — total minus applied, added to the
--                         customer's balance (v1 concept, unchanged)
-- ---------------------------------------------------------------------
create table sales (
  id                    uuid primary key default gen_random_uuid(),
  depot_id              uuid not null references depots(id),
  cashier_id            uuid not null references staff(id),
  customer_id           uuid references customers(id), -- nullable: walk-in sale
  shift_id              uuid references shifts(id),
  receipt_number        text not null unique, -- e.g. 'DKR-00010482' — depots.code + depots.receipt_seq
  status                text not null default 'completed' check (status in ('completed', 'voided', 'partially_returned', 'returned')),
  display_currency      text not null check (display_currency in ('CFA', 'USD')),
  cfa_to_usd_rate_used  numeric(12,6) not null,
  subtotal_cfa          numeric(14,2) not null,
  discount_type         text check (discount_type in ('flat', 'percent')),
  discount_value        numeric(14,2),           -- raw value entered (e.g. 10 for 10%, or a flat CFA amount)
  discount_amount_cfa   numeric(14,2) not null default 0,
  total_cfa             numeric(14,2) not null,  -- subtotal - discount (this is what balance is based on)
  amount_tendered_cfa   numeric(14,2) not null,
  amount_applied_cfa    numeric(14,2) not null,
  change_given_cfa      numeric(14,2) not null default 0,
  balance_added_cfa     numeric(14,2) not null default 0,
  created_at            timestamptz not null default now(),

  check (amount_applied_cfa <= total_cfa),
  check (amount_tendered_cfa >= amount_applied_cfa),
  check (change_given_cfa = amount_tendered_cfa - amount_applied_cfa),
  check (balance_added_cfa = total_cfa - amount_applied_cfa),
  check (balance_added_cfa = 0 or customer_id is not null) -- credit requires a named customer
);

create index sales_depot_idx on sales (depot_id);
create index sales_customer_idx on sales (customer_id);
create index sales_cashier_idx on sales (cashier_id);

-- ---------------------------------------------------------------------
-- Sale line items — unit mix per sale, with locked price + cost.
-- Unchanged from v1.
-- ---------------------------------------------------------------------
create table sale_items (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid not null references sales(id) on delete cascade,
  product_id        uuid not null references products(id),
  unit_level        smallint not null,
  quantity_in_unit  numeric(14,3) not null check (quantity_in_unit > 0),
  quantity_pieces   numeric(14,3) not null,   -- frozen conversion at sale time
  unit_price_cfa    numeric(14,2) not null,   -- locked selling price at sale time
  cost_price_cfa    numeric(14,2) not null,   -- locked cost price at sale time (for profit reports)
  line_total_cfa    numeric(14,2) not null
);

create index sale_items_sale_idx on sale_items (sale_id);
create index sale_items_product_idx on sale_items (product_id);

-- ---------------------------------------------------------------------
-- Sale returns — a controlled way to reverse part or all of a sale
-- without ever editing the original sale row.
--
-- On a completed return, the Edge Function must, in one transaction:
--   1. increase each returned product's current_stock_pieces by the
--      item's quantity_pieces — goods physically go back to stock
--   2. reduce customers.balance_owed_cfa by balance_adjustment_cfa —
--      undoing the credit this sale had put on the customer's account
--   3. record cash_refunded_cfa as money actually handed back — kept
--      here, not in `payments`, since payments specifically means
--      money RECEIVED; mixing the two directions into one ledger would
--      make it ambiguous and would corrupt shift cash-reconciliation
--      math
--   4. set the original sale's status to 'partially_returned' or
--      'returned' depending on whether every sale_item was returned
--      in full
-- The sale row is never edited — this record IS the note that the
-- transaction was refunded, and the sale stays visible on the
-- customer's profile with its status updated, exactly as requested.
-- ---------------------------------------------------------------------
create table sale_returns (
  id                       uuid primary key default gen_random_uuid(),
  sale_id                  uuid not null references sales(id),
  depot_id                 uuid not null references depots(id),
  processed_by             uuid not null references staff(id),
  reason                   text,
  refund_amount_cfa        numeric(14,2) not null check (refund_amount_cfa > 0),
  balance_adjustment_cfa   numeric(14,2) not null default 0 check (balance_adjustment_cfa >= 0),
  cash_refunded_cfa        numeric(14,2) not null default 0 check (cash_refunded_cfa >= 0),
  created_at               timestamptz not null default now(),

  check (balance_adjustment_cfa + cash_refunded_cfa = refund_amount_cfa)
);

create index sale_returns_sale_idx on sale_returns (sale_id);

create table sale_return_items (
  id                uuid primary key default gen_random_uuid(),
  return_id         uuid not null references sale_returns(id) on delete cascade,
  sale_item_id      uuid not null references sale_items(id),
  quantity_in_unit  numeric(14,3) not null check (quantity_in_unit > 0),
  quantity_pieces   numeric(14,3) not null,   -- frozen conversion, mirrors sale_items
  refund_amount_cfa numeric(14,2) not null check (refund_amount_cfa >= 0)
);

create index sale_return_items_return_idx on sale_return_items (return_id);
create index sale_return_items_sale_item_idx on sale_return_items (sale_item_id);

-- ---------------------------------------------------------------------
-- Payments — every payment against a customer balance, whether taken
-- at the point of sale or later. The initial sale payment
-- (amount_applied_cfa on `sales`, when it's less than total) also gets
-- a mirrored row here so full payment history lives in one place.
-- Unchanged in structure from v1 — still cash-only, no payment method
-- field. Refunds live in sale_returns, not here, so this ledger keeps
-- a single, unambiguous meaning: money received.
-- ---------------------------------------------------------------------
create table payments (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id),
  sale_id       uuid references sales(id), -- null for a standalone balance payment
  amount_cfa    numeric(14,2) not null check (amount_cfa > 0),
  recorded_by   uuid not null references staff(id),
  recorded_at   timestamptz not null default now(),
  note          text
);

create index payments_customer_idx on payments (customer_id);

-- ---------------------------------------------------------------------
-- Audit log — who/what/when/before/after, system-wide. Unchanged from v1.
-- ---------------------------------------------------------------------
create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references staff(id), -- null only for system-level events, if any
  action        text not null,              -- e.g. 'sale.create', 'stock.add', 'product.price_edit', 'auth.login'
  entity_type   text not null,
  entity_id     uuid,
  depot_id      uuid references depots(id), -- denormalized for fast per-depot audit queries
  before_value  jsonb,
  after_value   jsonb,
  occurred_at   timestamptz not null default now()
);

create index audit_log_actor_idx on audit_log (actor_id);
create index audit_log_depot_idx on audit_log (depot_id);
create index audit_log_entity_idx on audit_log (entity_type, entity_id);

-- =====================================================================
-- IMPLEMENTATION NOTE — required transaction discipline
-- =====================================================================
-- current_stock_pieces is now mutated by FIVE different flows: sales,
-- returns, restocks (stock_entries), adjustments, and transfers. Every
-- one of them must run as a single Postgres transaction that:
--   1. locks the affected product row(s) with `select ... for update`
--      (or runs at `serializable` isolation)
--   2. re-checks the resulting stock is >= 0 before committing
--   3. writes the movement record (sale_items / sale_return_items /
--      stock_entries / inventory_adjustments / stock_transfer_items)
--      and the audit_log entry in the same transaction
-- Two concurrent sales against the same product must never both read
-- the same starting stock and both succeed if only one had enough.
--
-- Receipt numbers follow the same pattern: generating one means
-- locking the owning depot's row (`select receipt_seq from depots
-- where id = :depot_id for update`), computing
-- code || '-' || lpad(receipt_seq::text, 8, '0'), incrementing
-- receipt_seq, and inserting the sale — all inside the sale's
-- transaction — so two simultaneous sales at the same depot can never
-- collide on the same receipt number.
-- =====================================================================