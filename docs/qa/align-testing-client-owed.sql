-- Guarded one-row align for the QA client "testing" only.
-- Run AFTER 20261102180001_sync_owed_from_ledger.sql.
-- Does not touch MAIN-00000001..00000007. Does not rewrite ledger events.
-- Do not run if name or owed no longer match (0 rows updated = skip).

UPDATE public.customers
SET balance_owed_cfa = 1400
WHERE id = '80203f64-6d56-4bba-b896-c1c7a9af3f8c'
  AND name = 'testing'
  AND round(balance_owed_cfa, 2) = 1500;

-- Expect 1. Then re-run docs/qa/balance-audit.sql — should return no rows
-- unless another client drifted (do not change those without review).
