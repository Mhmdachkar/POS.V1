-- ================================================================
-- VHM POS — Migration 007: Sale Returns & Return Items
-- ================================================================
--
-- CONFIRMED ARCHITECTURE — RETURN MODEL:
--
--   Returns are first-class, immutable, auditable records.
--   A return reduces or eliminates a sale's credit obligation.
--
--   Quantities are validated server-side (process_return RPC):
--   - Cannot return more than originally sold
--   - Cannot return more than has not already been returned
--   - Returned stock goes back to depot.current_stock_pieces (FOR UPDATE)
--
--   Balance adjustment formula (CRITICAL — pooled balance model):
--     balance_adjustment_cfa = MIN(sale.balance_added_cfa, customer.balance_owed_cfa)
--
--   This cap prevents the customer balance from going negative if the
--   admin has already credited a payment that reduced the balance
--   below the original sale's balance_added_cfa. Returns ONLY reverse
--   the credit that this specific sale created, AND are further capped
--   to the customer's current balance.
--
--   The return DOES NOT reverse or modify the original payment records.
--   Standalone customer_payment records are NEVER touched by returns.
--   Returns only adjust the customer.balance_owed_cfa directly.
--
--   Phase 2 correction: shift_id added for accurate shift reconciliation.
--   The expected_cash formula for shift close must subtract
--   SUM(cash_refunded_cfa WHERE shift_id = this).
--
--   sale status update (by process_return RPC):
--     After processing return:
--       if all sale_items fully returned → status = 'returned'
--       else                            → status = 'partially_returned'
-- ================================================================

create table sale_returns (
  id                       uuid primary key default gen_random_uuid(),
  sale_id                  uuid not null references sales(id),
  depot_id                 uuid not null references depots(id),   -- denormalized from sale
  shift_id                 uuid references shifts(id),             -- Phase 2 correction
  processed_by             uuid not null references staff(id),
  reason                   text,
  refund_amount_cfa        numeric(14,2) not null
    check (refund_amount_cfa > 0),              -- total refund value of this return event
  balance_adjustment_cfa   numeric(14,2) not null default 0
    check (balance_adjustment_cfa >= 0),        -- credit reversed (never negative)
  cash_refunded_cfa        numeric(14,2) not null default 0
    check (cash_refunded_cfa >= 0),             -- physical cash handed back
  created_at               timestamptz not null default now(),

  -- Refund components must sum exactly to total refund
  -- (either a balance reduction, a cash refund, or both)
  constraint refund_components_sum
    check (balance_adjustment_cfa + cash_refunded_cfa = refund_amount_cfa)
);

create index sale_returns_sale_idx      on sale_returns (sale_id);
create index sale_returns_depot_idx     on sale_returns (depot_id);
create index sale_returns_shift_idx     on sale_returns (shift_id);          -- Phase 2 correction
create index sale_returns_processed_at on sale_returns (created_at desc);

comment on table sale_returns is
  'Immutable return event records. balance_adjustment = min(sale.balance_added, customer.current_balance). Never reverses payment records.';

comment on column sale_returns.shift_id is
  'Phase 2 correction. Required for close_shift expected_cash formula: subtracts SUM(cash_refunded_cfa WHERE shift_id = shift).';

comment on column sale_returns.balance_adjustment_cfa is
  'Credit reversed on customer balance. Capped at MIN(sale.balance_added_cfa, customer.current_balance). Never negative.';

-- ─── Sale Return Items ──────────────────────────────────────────
-- Records which specific sale_items were returned and in what quantity.
-- quantity_pieces is the exact stock being put back into inventory.
-- The sum of quantity_pieces across all return items for a given
-- sale_item must never exceed the original sale_item.quantity_pieces.
-- This is enforced by the process_return RPC (using FOR UPDATE on product).

create table sale_return_items (
  id                uuid primary key default gen_random_uuid(),
  return_id         uuid not null references sale_returns(id) on delete cascade,
  sale_item_id      uuid not null references sale_items(id),
  quantity_in_unit  numeric(14,3) not null
    check (quantity_in_unit > 0),
  quantity_pieces   numeric(14,3) not null
    check (quantity_pieces > 0),                -- frozen from original sale_item conversion
  refund_amount_cfa numeric(14,2) not null
    check (refund_amount_cfa >= 0)              -- quantity_in_unit * original unit_price_cfa
);

create index sale_return_items_return_idx    on sale_return_items (return_id);
create index sale_return_items_sale_item_idx on sale_return_items (sale_item_id);

comment on table sale_return_items is
  'Line items of a return. Quantity totals validated by process_return RPC (FOR UPDATE on product). Never exceed original sale_item quantities.';
