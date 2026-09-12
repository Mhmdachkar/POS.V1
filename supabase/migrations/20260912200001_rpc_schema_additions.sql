-- ================================================================
-- VHM POS — Migration 015: Phase 4 Schema Additions
-- ================================================================
--
-- Adds schema elements required by the Phase 4 RPC layer:
--
--  1. inventory_transactions — unified, signed inventory ledger
--     Every stock mutation (SALE, RETURN, VOID, RESTOCK, ADJUSTMENT,
--     TRANSFER_IN, TRANSFER_OUT) writes one row per product per event
--     in the same transaction as products.current_stock_pieces update.
--     Invariant: SUM(quantity_pieces) = products.current_stock_pieces
--
--  2. sales.idempotency_key — optional uuid for duplicate-submission guard
--     Protected by pg_advisory_xact_lock (64-bit) + unique index.
--
--  3. sale_items.net_line_total_cfa — discount-aware frozen line total
--     Proportional share of discount distributed across items at sale time.
--     Used for correct per-item return refund amounts.
--
--  4. private schema — internal helper functions for RPCs
--     Not callable by authenticated role directly.
--
--  5. Immutability triggers on sale_items and sales
--     DB-level protection independent of RLS (triggers fire even for
--     SECURITY DEFINER functions calling as table owner).
-- ================================================================

-- ─── 1. Inventory Transactions Ledger ───────────────────────────
-- Unified, append-only stock movement history.
-- One signed row per product per business event.
-- RLS: depot-isolation (admin → all depots, non-admin → own depot).

create table public.inventory_transactions (
  id               uuid primary key default gen_random_uuid(),
  depot_id         uuid not null references public.depots(id),
  product_id       uuid not null references public.products(id),
  quantity_pieces  numeric(14,4) not null,        -- signed: negative = stock out
  transaction_type text not null check (transaction_type in (
    'SALE','RETURN','VOID','RESTOCK','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT'
  )),
  reference_type   text not null check (reference_type in (
    'sale','sale_return','void','stock_entry','inventory_adjustment','stock_transfer'
  )),
  reference_id     uuid not null,                 -- FK to the relevant business row (polymorphic)
  created_by       uuid not null references public.staff(id),
  created_at       timestamptz not null default now(),
  metadata         jsonb                           -- optional: unit_level, quantity_in_unit, reason
);

create index inventory_transactions_product_idx
  on public.inventory_transactions (product_id, created_at desc);

create index inventory_transactions_depot_idx
  on public.inventory_transactions (depot_id, created_at desc);

create index inventory_transactions_reference_idx
  on public.inventory_transactions (reference_type, reference_id);

-- RLS: depot-isolation (identical pattern to operational tables — zero USING(true))
alter table public.inventory_transactions enable row level security;

create policy "inventory_transactions_select_admin"
  on public.inventory_transactions for select
  using (public.is_current_staff_admin());

create policy "inventory_transactions_select_own_depot"
  on public.inventory_transactions for select
  using (
    depot_id = public.get_current_staff_depot_id()
    and not public.is_current_staff_admin()
  );

-- No INSERT/UPDATE/DELETE policies — writes go only through SECURITY DEFINER RPCs
-- Revoke direct write access (defence in depth, consistent with Phase 3 hardening)
revoke insert, update, delete on public.inventory_transactions from authenticated, anon;

comment on table public.inventory_transactions is
  'Unified append-only inventory ledger. SUM(quantity_pieces)=products.current_stock_pieces always. Written inside same txn as every stock mutation.';

comment on column public.inventory_transactions.quantity_pieces is
  'Signed: negative = stock removed (SALE, ADJUSTMENT loss, TRANSFER_OUT). Positive = stock added (RETURN, RESTOCK, VOID, TRANSFER_IN).';

comment on column public.inventory_transactions.reference_type is
  'Polymorphic reference type. reference_id is the PK of the referenced business table row.';

-- ─── 2. Sales Idempotency Key ────────────────────────────────────
-- Optional per-request deduplication key from the frontend.
-- complete_sale: advisory lock (64-bit) + unique index guard.

alter table public.sales add column idempotency_key uuid;

create unique index sales_idempotency_key_idx on public.sales (idempotency_key)
  where idempotency_key is not null;

comment on column public.sales.idempotency_key is
  'Optional frontend dedup key. complete_sale uses pg_advisory_xact_lock + this unique index to prevent duplicate submissions.';

-- ─── 3. Sale Items: Discount-aware Net Line Total ────────────────
-- Proportional share of the sale discount frozen at sale creation time.
-- Formula: line_total_cfa - ROUND((line_total_cfa / subtotal_cfa) * discount_amount_cfa, 2)
-- The last item in a sale absorbs rounding residuals so that
-- SUM(net_line_total_cfa) = total_cfa exactly.
--
-- Used by process_return to compute correct per-item refund amounts
-- regardless of whether the sale had a discount applied.

alter table public.sale_items
  add column net_line_total_cfa numeric(14,2) not null default 0
    check (net_line_total_cfa >= 0);

-- Backfill: for existing rows (seed or dev data), set to line_total_cfa
-- (no discount was applied, so net = gross for historical data)
update public.sale_items set net_line_total_cfa = line_total_cfa;

-- Remove the DEFAULT so future inserts from RPCs must supply the value explicitly
alter table public.sale_items alter column net_line_total_cfa drop default;

comment on column public.sale_items.net_line_total_cfa is
  'Post-discount line total for this item, frozen at sale time. SUM across all items = sales.total_cfa. Used for discount-aware return refund calculation.';

-- ─── 4. Private Schema ────────────────────────────────────────────
-- Internal helper functions for RPC implementations.
-- Not directly callable by authenticated role.

create schema if not exists private;
revoke all on schema private from public;
-- authenticated can use the schema but cannot directly execute private functions
-- (private functions have REVOKE EXECUTE FROM PUBLIC and no GRANT to authenticated)
grant usage on schema private to authenticated;

comment on schema private is
  'Internal helpers for SECURITY DEFINER RPCs. Not callable by authenticated role directly.';

-- ─── 5. Immutability Triggers ────────────────────────────────────
--
-- Triggers fire for ALL callers including SECURITY DEFINER functions
-- executing as the table owner. This makes protection unconditional.
--
-- Protected on sale_items:
--   product_id, quantity_in_unit, quantity_pieces, unit_price_cfa,
--   cost_price_cfa, net_line_total_cfa, line_total_cfa
--
-- Protected on sales (status and voided_at remain mutable):
--   depot_id, cashier_id, customer_id, receipt_number, subtotal_cfa,
--   discount_type, discount_value, discount_amount_cfa, total_cfa,
--   amount_tendered_cfa, amount_applied_cfa, change_given_cfa,
--   balance_added_cfa, cfa_to_usd_rate_used, idempotency_key

create or replace function public.prevent_sale_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if (
    old.product_id          is distinct from new.product_id          or
    old.quantity_in_unit    is distinct from new.quantity_in_unit    or
    old.quantity_pieces     is distinct from new.quantity_pieces     or
    old.unit_price_cfa      is distinct from new.unit_price_cfa      or
    old.cost_price_cfa      is distinct from new.cost_price_cfa      or
    old.net_line_total_cfa  is distinct from new.net_line_total_cfa  or
    old.line_total_cfa      is distinct from new.line_total_cfa
  ) then
    raise exception 'sale_items: historical financial fields are immutable after insertion'
      using errcode = '23000',
            detail  = 'Fields product_id, quantity_in_unit, quantity_pieces, unit_price_cfa, cost_price_cfa, net_line_total_cfa, line_total_cfa cannot be changed.';
  end if;
  return new;
end;
$$;

create trigger sale_items_immutability
  before update on public.sale_items
  for each row execute function public.prevent_sale_item_mutation();

-- Revoke direct execution (trigger functions are invoked by PostgreSQL, not users)
revoke execute on function public.prevent_sale_item_mutation() from public;

comment on function public.prevent_sale_item_mutation() is
  'Trigger: blocks UPDATE of historical financial fields on sale_items. Fires for ALL callers including SECURITY DEFINER functions.';

-- Immutability for sales financial header (status + voided_at remain mutable)
create or replace function public.prevent_sale_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if (
    old.depot_id             is distinct from new.depot_id             or
    old.cashier_id           is distinct from new.cashier_id           or
    old.customer_id          is distinct from new.customer_id          or
    old.receipt_number       is distinct from new.receipt_number       or
    old.subtotal_cfa         is distinct from new.subtotal_cfa         or
    old.discount_type        is distinct from new.discount_type        or
    old.discount_value       is distinct from new.discount_value       or
    old.discount_amount_cfa  is distinct from new.discount_amount_cfa  or
    old.total_cfa            is distinct from new.total_cfa            or
    old.amount_tendered_cfa  is distinct from new.amount_tendered_cfa  or
    old.amount_applied_cfa   is distinct from new.amount_applied_cfa   or
    old.change_given_cfa     is distinct from new.change_given_cfa     or
    old.balance_added_cfa    is distinct from new.balance_added_cfa    or
    old.cfa_to_usd_rate_used is distinct from new.cfa_to_usd_rate_used or
    old.idempotency_key      is distinct from new.idempotency_key      or
    old.display_currency     is distinct from new.display_currency
  ) then
    raise exception 'sales: historical financial fields are immutable after creation'
      using errcode = '23000',
            detail  = 'Only status and created_at are mutable. All financial amounts are frozen at sale creation time.';
  end if;
  return new;
end;
$$;

create trigger sale_immutability
  before update on public.sales
  for each row execute function public.prevent_sale_mutation();

revoke execute on function public.prevent_sale_mutation() from public;

comment on function public.prevent_sale_mutation() is
  'Trigger: blocks UPDATE of historical financial fields on sales. status and created_at remain mutable for void/return transitions.';

-- Grant execute on new trigger functions to match Phase 3 hardening pattern
-- (revoked from public above; no grant to authenticated — PostgreSQL calls triggers directly)
