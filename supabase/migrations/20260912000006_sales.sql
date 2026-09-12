-- ================================================================
-- VHM POS — Migration 006: Sales & Sale Items
-- ================================================================
--
-- CONFIRMED ARCHITECTURE:
--
--   CASH ONLY — no card, bank transfer, mobile money.
--   The `display_currency` column supports showing USD totals on
--   the receipt for the customer's reference, but ALL financial
--   computations are in CFA. There is NO payment_methods table.
--
--   Walk-in vs Named Customer:
--     Walk-in:   customer_id IS NULL, balance_added_cfa = 0 (enforced)
--     Named:     customer_id IS NOT NULL, may have balance_added_cfa > 0
--
--   Amount flow (all authoritative, computed by create_sale RPC):
--     subtotal_cfa       = SUM(sale_items.line_total_cfa)
--     discount_amount_cfa = computed from discount_type + discount_value
--     total_cfa          = subtotal_cfa - discount_amount_cfa
--     amount_applied_cfa = actual cash received (≤ total)
--     balance_added_cfa  = total - amount_applied  (credit extended)
--     amount_tendered_cfa = cash handed over by customer
--     change_given_cfa   = tendered - applied  (if tendered > total, change_given = tendered - total, applied = total)
--
--   Receipt numbering (inside create_sale transaction):
--     1. SELECT * FROM depots WHERE id = ... FOR UPDATE
--     2. receipt_number = depot.code || '-' || LPAD(depot.receipt_seq, 8, '0')
--     3. UPDATE depots SET receipt_seq = receipt_seq + 1
--     4. INSERT into sales
--
--   Status transitions:
--     completed → voided             (if no returns exist)
--     completed → partially_returned (at least one return, more stock returnable)
--     completed → returned           (all items fully returned)
--     voided is TERMINAL — cannot transition to any other state
--
--   IMPORTANT: Client-side computeTotals in posStore is DISPLAY-ONLY.
--   The authoritative amounts come back from the create_sale RPC.
-- ================================================================

create table sales (
  id                    uuid primary key default gen_random_uuid(),
  depot_id              uuid not null references depots(id),
  cashier_id            uuid not null references staff(id),
  customer_id           uuid references customers(id),    -- null = walk-in
  shift_id              uuid references shifts(id),        -- linked to active shift at sale time
  receipt_number        text not null unique,
  status                text not null default 'completed'
    check (status in ('completed', 'voided', 'partially_returned', 'returned')),
  display_currency      text not null
    check (display_currency in ('CFA', 'USD')),
  cfa_to_usd_rate_used  numeric(12,6) not null,           -- locked at sale time
  subtotal_cfa          numeric(14,2) not null
    check (subtotal_cfa >= 0),
  discount_type         text
    check (discount_type in ('flat', 'percent')),
  discount_value        numeric(14,2)
    check (discount_value is null or discount_value >= 0),
  discount_amount_cfa   numeric(14,2) not null default 0
    check (discount_amount_cfa >= 0),
  total_cfa             numeric(14,2) not null
    check (total_cfa >= 0),
  amount_tendered_cfa   numeric(14,2) not null
    check (amount_tendered_cfa >= 0),
  amount_applied_cfa    numeric(14,2) not null
    check (amount_applied_cfa >= 0),
  change_given_cfa      numeric(14,2) not null default 0
    check (change_given_cfa >= 0),
  balance_added_cfa     numeric(14,2) not null default 0
    check (balance_added_cfa >= 0),
  created_at            timestamptz not null default now(),

  -- ─ Financial consistency constraints ─
  -- These are server-enforced safety nets; the create_sale RPC
  -- computes all values authoritatively before inserting.

  -- Cannot apply more than the total
  constraint applied_leq_total
    check (amount_applied_cfa <= total_cfa),

  -- Tendered must cover what was applied (no credit on the applied portion)
  constraint tendered_geq_applied
    check (amount_tendered_cfa >= amount_applied_cfa),

  -- Change = tendered - applied (exact)
  constraint change_formula
    check (change_given_cfa = amount_tendered_cfa - amount_applied_cfa),

  -- Balance = unpaid portion (exact)
  constraint balance_formula
    check (balance_added_cfa = total_cfa - amount_applied_cfa),

  -- Credit sales require a named customer (walk-in cannot have a balance)
  constraint credit_requires_customer
    check (balance_added_cfa = 0 or customer_id is not null),

  -- Discount consistency: if type set, value must be set, and vice versa
  constraint discount_consistency
    check (
      (discount_type is null and discount_value is null)
      or (discount_type is not null and discount_value is not null)
    )
);

-- Core lookup indexes
create index sales_depot_idx      on sales (depot_id);
create index sales_customer_idx   on sales (customer_id);
create index sales_cashier_idx    on sales (cashier_id);
create index sales_shift_idx      on sales (shift_id);
create index sales_status_idx     on sales (status);
create index sales_created_at_idx on sales (created_at desc);

-- Composite for common "all sales for a depot" queries
create index sales_depot_date_idx on sales (depot_id, created_at desc);

-- Composite for shift reconciliation query
create index sales_shift_status_idx on sales (shift_id, status)
  where status <> 'voided';

comment on table sales is
  'Immutable after creation. All amounts authoritative from create_sale RPC. Receipt number unique globally.';

comment on column sales.receipt_number is
  'Format: DEPOT_CODE-NNNNNNNN e.g. DKR-00000001. Generated inside create_sale transaction with SELECT...FOR UPDATE on depot.receipt_seq.';

comment on column sales.cfa_to_usd_rate_used is
  'Exchange rate at time of sale. Frozen — historical sales never recalculated on rate change.';

comment on column sales.amount_applied_cfa is
  'Physical cash received. balance_added_cfa = total_cfa - amount_applied_cfa.';

-- ─── Sale Items ─────────────────────────────────────────────────
-- All pricing is frozen at sale time.
-- Line items are immutable after sale creation.
-- unit_price_cfa and cost_price_cfa are copied from product_units
-- at the moment of sale — changes to product prices do not affect history.

create table sale_items (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid not null references sales(id) on delete cascade,
  product_id        uuid not null references products(id),
  unit_level        smallint not null
    check (unit_level >= 0 and unit_level <= 2),
  quantity_in_unit  numeric(14,3) not null
    check (quantity_in_unit > 0),
  quantity_pieces   numeric(14,3) not null
    check (quantity_pieces > 0),                -- frozen: qty_in_unit * conversion_to_base
  unit_price_cfa    numeric(14,2) not null
    check (unit_price_cfa >= 0),                -- frozen from product_units at sale time
  cost_price_cfa    numeric(14,2) not null
    check (cost_price_cfa >= 0),                -- frozen for margin reporting
  line_total_cfa    numeric(14,2) not null
    check (line_total_cfa >= 0)                 -- quantity_in_unit * unit_price_cfa (pre-discount)
);

create index sale_items_sale_idx    on sale_items (sale_id);
create index sale_items_product_idx on sale_items (product_id);

comment on table sale_items is
  'All prices frozen at sale time. Historical values never change even if product prices are updated.';
