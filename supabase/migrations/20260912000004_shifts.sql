-- ================================================================
-- VHM POS — Migration 004: Shifts
-- ================================================================
--
-- CONFIRMED ARCHITECTURE:
--   - NO one-open-shift-per-cashier constraint (intentionally absent)
--   - Cashier may have multiple open shifts (not currently restricted)
--   - Shift reconciliation formula (computed by close_shift RPC):
--
--       expected_cash =
--           opening_float_cfa
--         + SUM(sales.amount_applied_cfa WHERE shift_id = this AND status != 'voided')
--         + SUM(payments.amount_cfa WHERE shift_id = this AND is_reversed = false)
--         - SUM(sale_returns.cash_refunded_cfa WHERE shift_id = this)
--
--   - opening_float: actual cash in drawer at start of shift
--   - amount_applied: cash physically received (NOT tendered, NOT total)
--   - balance_added is NOT cash — it is a credit obligation, not physical
--   - change_given is NOT added — it is already excluded by using
--     amount_applied (not amount_tendered)
--   - cash_refunded: physical cash handed back during returns
--   - reversed payments: excluded from expected cash
--   - voided sale payments: excluded (sale.status = 'voided')
--
-- closed_by: records who closed the shift (added for audit — not in v1 schema)
-- ================================================================

create table shifts (
  id                  uuid primary key default gen_random_uuid(),
  depot_id            uuid not null references depots(id),
  cashier_id          uuid not null references staff(id),
  opening_float_cfa   numeric(14,2) not null
    check (opening_float_cfa >= 0),
  opened_at           timestamptz not null default now(),
  closed_at           timestamptz,
  closed_by           uuid references staff(id),   -- who closed the shift (may differ from opener)
  expected_cash_cfa   numeric(14,2),               -- null until shift is closed
  actual_cash_cfa     numeric(14,2),               -- entered by cashier at close
  discrepancy_cfa     numeric(14,2),               -- actual - expected (null until closed)
  status              text not null default 'open'
    check (status in ('open', 'closed')),

  -- When closed, all three values must be present
  constraint closed_shift_completeness check (
    (status = 'open')
    or (
      status = 'closed'
      and closed_at is not null
      and expected_cash_cfa is not null
      and actual_cash_cfa is not null
      and discrepancy_cfa is not null
    )
  )

  -- NOTE: No UNIQUE constraint here — intentionally NO one-open-shift-per-cashier rule.
);

create index shifts_depot_idx    on shifts (depot_id);
create index shifts_cashier_idx  on shifts (cashier_id);
create index shifts_status_idx   on shifts (status);
create index shifts_opened_at_idx on shifts (opened_at desc);

comment on table shifts is
  'Cashier cash accountability periods. No one-open-shift constraint. Reconciliation computed at close by close_shift RPC.';

comment on column shifts.expected_cash_cfa is
  'float + cash_applied_from_sales + customer_payments_received - cash_refunds_given. Computed by close_shift RPC.';

comment on column shifts.discrepancy_cfa is
  'actual_cash_cfa - expected_cash_cfa. Negative = shortage. Positive = surplus.';
