-- ================================================================
-- VHM POS — Migration 005: Customers
-- ================================================================
--
-- CONFIRMED ARCHITECTURE — POOLED BALANCE MODEL:
--   balance_owed_cfa is the AUTHORITATIVE state of what the customer
--   owes. It is a pooled "running balance" — NOT an allocation of
--   specific payments to specific invoices.
--
--   Balance increases on credit sales:
--     balance_owed_cfa += sales.balance_added_cfa
--
--   Balance decreases on customer payments:
--     balance_owed_cfa -= payment.amount_cfa
--
--   Balance decreases on returns (capped to avoid going negative):
--     balance_adjustment = min(sale.balance_added_cfa, current_balance)
--     balance_owed_cfa -= balance_adjustment
--
--   balance_owed_cfa >= 0 is a DB-enforced constraint.
--   It must NEVER go negative. The RPC caps the adjustment.
--
--   Walk-in customers: sales with customer_id IS NULL.
--   Walk-in sales must be fully paid (balance_added_cfa = 0).
--   No walk-in customer record is created for one-off purchases.
--
-- IMPORTANT:
--   - customer.balance is NOT a payment method (cash only)
--   - customer.balance represents credit extended to the customer
--   - The client UI must NEVER allow selecting "pay from balance"
--     as if it were tendering cash
-- ================================================================

create table customers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  phone            text,
  address          text,
  balance_owed_cfa numeric(14,2) not null default 0
    check (balance_owed_cfa >= 0),              -- MUST NOT go negative (RPC enforces cap)
  created_by       uuid not null references staff(id),
  created_at       timestamptz not null default now()
);

create index customers_name_idx       on customers (name);
create index customers_created_at_idx on customers (created_at desc);

comment on table customers is
  'Named customers with pooled credit balance. Walk-in sales use customer_id = NULL on sales.';

comment on column customers.balance_owed_cfa is
  'Pooled outstanding balance. Not allocated to specific sales. Only mutated by create_sale, record_payment, process_return RPCs. NEVER negative.';

comment on column customers.phone is
  'Optional contact number. Not unique — two customers may share a number.';
