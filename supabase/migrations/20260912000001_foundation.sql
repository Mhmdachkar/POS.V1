-- ================================================================
-- VHM POS — Migration 001: Foundation
-- Extensions, business_settings, depots, staff, categories
-- ================================================================
--
-- CONFIRMED ARCHITECTURE:
--   - No barcode/SKU anywhere in this system
--   - No payment methods table (cash only)
--   - Staff deactivation: is_active = false, NOT auth user deletion
--   - No one-open-shift-per-cashier constraint
--   - Staff unique indexes: filtered to is_active = true (allows
--     replacing deactivated staff with a new active one)
-- ================================================================

-- ─── Extensions ─────────────────────────────────────────────────

create extension if not exists "pgcrypto";     -- gen_random_uuid()
create extension if not exists "pg_trgm";      -- trigram search for product/customer names

-- ─── Business Settings ──────────────────────────────────────────
-- Single-row table enforced by boolean primary key trick.
-- Stores business-wide config: name, logo, CFA/USD exchange rate.
-- The rate is locked at sale time into sales.cfa_to_usd_rate_used.
-- Historical sales are NEVER recalculated with a new rate.

create table business_settings (
  id                 boolean primary key default true
    constraint single_row check (id),          -- enforces exactly one row
  business_name      text not null default 'VHM',
  logo_url           text,
  cfa_to_usd_rate    numeric(12,6) not null default 620.000000,
  rate_updated_at    timestamptz not null default now(),
  rate_updated_by    uuid,                     -- fk to staff added below after staff exists
  updated_at         timestamptz not null default now()
);

comment on table business_settings is
  'Single-row table. All system-wide settings. Exchange rate locked at each sale.';

comment on column business_settings.cfa_to_usd_rate is
  'CFA per 1 USD. Locked into sales.cfa_to_usd_rate_used at sale time. Historical sales must never be recalculated.';

-- ─── Depots ─────────────────────────────────────────────────────
-- Physical locations that own products. Products belong to exactly
-- one depot. receipt_seq provides per-depot receipt numbering —
-- it must ONLY be incremented inside the create_sale transaction.

create table depots (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  location      text not null,
  code          text not null unique,           -- short human code for receipts, e.g. 'DKR'
  is_active     boolean not null default true,
  receipt_seq   integer not null default 1,     -- ONLY modified by create_sale RPC (with FOR UPDATE)
  created_at    timestamptz not null default now()
);

comment on column depots.receipt_seq is
  'Next receipt sequence number. Only ever modified inside create_sale transaction (SELECT ... FOR UPDATE on depot row).';

comment on column depots.code is
  'Short uppercase code for receipt number prefix. e.g. DKR-00010482. Immutable after depot creation.';

-- ─── Staff ──────────────────────────────────────────────────────
-- Maps 1:1 to Supabase Auth users.
-- Login: username → synthetic email ({username}@vhm-pos.internal)
-- The synthetic email is an implementation detail — never shown to users.
--
-- Deactivation: set is_active = false + deactivated_at.
-- Do NOT call supabase.auth.admin.deleteUser() — auth record must
-- remain for FK integrity and historical references.
-- Ban the auth user via supabase.auth.admin.updateUser({ ban_duration })
-- to prevent future logins without deleting the record.
--
-- Role rules:
--   admin:       depot_id must be null
--   cashier:     depot_id must not be null
--   depot_staff: depot_id must not be null
--
-- Uniqueness: only ONE active cashier and ONE active depot_staff
-- per depot at any time. The indexes are PARTIAL (is_active = true)
-- so deactivated staff do not block adding a replacement.

create table staff (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text not null unique,
  full_name      text not null,
  role           text not null
    check (role in ('admin', 'cashier', 'depot_staff')),
  depot_id       uuid references depots(id),
  is_active      boolean not null default true,
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),

  -- Admin must have no depot; cashier/depot_staff must have one
  constraint depot_required_for_non_admin
    check (
      (role = 'admin' and depot_id is null)
      or (role <> 'admin' and depot_id is not null)
    ),

  -- Deactivated staff must have a timestamp; active staff must not
  constraint deactivation_timestamp_consistency
    check (
      (is_active = true and deactivated_at is null)
      or (is_active = false and deactivated_at is not null)
    )
);

-- PARTIAL unique indexes: enforce one active cashier / depot_staff
-- per depot, but allow deactivated staff to coexist (enabling replacement).
-- NOTE: no one-open-shift-per-cashier constraint — intentionally absent.
create unique index one_active_cashier_per_depot
  on staff (depot_id)
  where role = 'cashier' and is_active = true;

create unique index one_active_depot_staff_per_depot
  on staff (depot_id)
  where role = 'depot_staff' and is_active = true;

create index staff_depot_idx on staff (depot_id);
create index staff_role_idx on staff (role);

comment on table staff is
  'Maps 1:1 to Supabase Auth users. Deactivation sets is_active=false — never deletes auth record.';

comment on index one_active_cashier_per_depot is
  'Partial index: allows deactivated cashiers to remain, enabling staff replacement.';

-- ─── business_settings → staff FK (deferred until staff exists) ──

alter table business_settings
  add constraint business_settings_rate_updated_by_fkey
  foreign key (rate_updated_by) references staff(id);

-- ─── Categories ─────────────────────────────────────────────────
-- Self-referencing tree, shared across all depots.
-- Unlimited nesting depth.
-- Parent-level deletion is restricted (not cascaded) because
-- deleting a parent would orphan children and historical products.
--
-- Uniqueness rules (DB-enforced, case-insensitive):
--   - Root categories (parent_id IS NULL): globally unique name
--   - Child categories: unique name within the same parent

create table categories (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references categories(id) on delete restrict,
  name          text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Case-insensitive uniqueness for child categories within same parent
create unique index categories_unique_name_per_parent
  on categories (parent_id, lower(name))
  where parent_id is not null;

-- Case-insensitive uniqueness for root categories
create unique index categories_unique_root_name
  on categories (lower(name))
  where parent_id is null;

create index categories_parent_idx on categories (parent_id);
create index categories_active_idx on categories (is_active);

comment on table categories is
  'Shared category tree across all depots. Unlimited nesting. Unique names case-insensitively within parent scope.';

comment on index categories_unique_root_name is
  'Root categories must have globally unique names (case-insensitive).';
