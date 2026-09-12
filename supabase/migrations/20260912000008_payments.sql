-- ================================================================
-- VHM POS — Migration 008: Payments
-- ================================================================
--
-- CONFIRMED ARCHITECTURE — POOLED BALANCE PAYMENT MODEL:
--
--   ALL PAYMENTS ARE CASH — no card, mobile money, bank transfer.
--   Customer balance is NOT a payment method: it represents credit
--   owed by the customer, not a wallet they can spend from.
--
--   Two distinct payment_type values:
--
--   1. 'sale_payment':
--      Created inside create_sale when amount_applied_cfa > 0.
--      Mirrors the cash physically collected at the POS counter.
--      sale_id is set (references the sale).
--      If the sale is later VOIDED: this payment is reversed
--      (is_reversed = true, reversed_at, reversed_by).
--      This is the ONLY scenario where a sale_payment is reversed
--      automatically.
--
--   2. 'customer_payment':
--      Created by record_payment (standalone).
--      Represents a customer paying off part of their pooled balance.
--      sale_id is null (not linked to a specific sale — pooled model).
--      Returns DO NOT reverse customer_payment records.
--      If admin makes an error, an explicit correction is applied
--      (is_reversed = true, reversed_by set to admin staff id).
--
--   Phase 2 corrections applied here:
--     + shift_id (for shift reconciliation — expected_cash formula)
--     + payment_type discriminator ('sale_payment' | 'customer_payment')
--     + is_reversed + reversed_at + reversed_by (void/admin use only)
--     + reversed_by_return_id (nullable FK to sale_returns)
--       Set when is_reversed is true AND the reversal was triggered
--       by a return (rare; used only for void flows that had partial
--       payment AND a return, not for normal return processing).
--
--   Shift reconciliation formula uses this table:
--     + SUM(amount_cfa WHERE shift_id = this AND is_reversed = false
--           AND payment_type = 'customer_payment')
--   This captures standalone cash payments collected during the shift.
-- ================================================================

create table payments (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id),
  sale_id         uuid references sales(id),           -- set for sale_payment, null for customer_payment
  shift_id        uuid references shifts(id),           -- Phase 2: link to active shift at payment time
  payment_type    text not null default 'customer_payment'
    check (payment_type in ('sale_payment', 'customer_payment')),
    -- sale_payment:     created by create_sale RPC, sale_id is not null
    -- customer_payment: created by record_payment RPC, sale_id is null
  amount_cfa      numeric(14,2) not null
    check (amount_cfa > 0),                            -- always positive (reversal is is_reversed flag)
  recorded_by     uuid not null references staff(id),
  recorded_at     timestamptz not null default now(),
  note            text,

  -- ─ Reversal fields ─
  -- Used ONLY for:
  --   (a) sale_payment reversal when a sale is voided
  --   (b) explicit admin correction
  -- Returns (process_return) do NOT touch payment records.
  is_reversed         boolean not null default false,
  reversed_at         timestamptz,
  reversed_by         uuid references staff(id),       -- staff who authorized the reversal
  reversed_by_return_id uuid references sale_returns(id), -- only set if void triggered a return-related reversal

  -- Reversal consistency: if reversed, must have timestamp + approver
  constraint reversal_consistency check (
    (is_reversed = false and reversed_at is null and reversed_by is null)
    or (is_reversed = true and reversed_at is not null and reversed_by is not null)
  ),

  -- Payment type consistency: sale_payment must have sale_id; customer_payment must not
  constraint payment_type_sale_id_consistency check (
    (payment_type = 'sale_payment' and sale_id is not null)
    or (payment_type = 'customer_payment' and sale_id is null)
  )
);

-- Core lookup indexes
create index payments_customer_idx   on payments (customer_id);
create index payments_sale_idx       on payments (sale_id);
create index payments_shift_idx      on payments (shift_id);              -- Phase 2 correction
create index payments_recorded_at_idx on payments (recorded_at desc);

-- Partial index for active (non-reversed) payments
-- Used in balance computations and shift reconciliation
create index payments_active_idx
  on payments (customer_id, recorded_at desc)
  where is_reversed = false;

-- Partial index for active customer_payments during a shift
create index payments_active_customer_payment_shift_idx
  on payments (shift_id)
  where payment_type = 'customer_payment' and is_reversed = false;

comment on table payments is
  'Cash payment records. Two types: sale_payment (mirrors cash at sale) and customer_payment (standalone balance paydown). See pooled balance model.';

comment on column payments.payment_type is
  'sale_payment: created by create_sale when cash received. customer_payment: standalone debt payoff. See pooled balance accounting decision.';

comment on column payments.is_reversed is
  'TRUE only for: (a) void of the linked sale, (b) explicit admin correction. Returns do NOT set this flag.';

comment on column payments.sale_id is
  'Not null for sale_payment. NULL for customer_payment. Null does NOT mean unallocated — this is a pooled balance system with no allocation.';
