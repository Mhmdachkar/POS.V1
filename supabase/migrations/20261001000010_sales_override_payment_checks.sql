-- ================================================================
-- CEO Notes — Sales payment checks must use the authoritative total
-- ================================================================
--
-- sales.total_cfa remains the CALCULATED catalog total.
-- When admin_override_total_cfa is set, cash/change/credit use that value.
--
-- Old checks assumed:
--   amount_applied_cfa <= total_cfa
--   balance_added_cfa  = total_cfa - amount_applied_cfa
--
-- Those reject every overridden sale (e.g. calculated 9100, final 7000)
-- with Postgres 23514, which the POS surfaces as a generic 400.
--
-- Payable total = COALESCE(admin_override_total_cfa, total_cfa)
-- ================================================================

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS applied_leq_total;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS balance_formula;

ALTER TABLE public.sales
  ADD CONSTRAINT applied_leq_total
  CHECK (
    amount_applied_cfa <= COALESCE(admin_override_total_cfa, total_cfa)
  );

ALTER TABLE public.sales
  ADD CONSTRAINT balance_formula
  CHECK (
    balance_added_cfa = COALESCE(admin_override_total_cfa, total_cfa) - amount_applied_cfa
  );

COMMENT ON CONSTRAINT applied_leq_total ON public.sales IS
  'Cash applied cannot exceed the authoritative payable total (override if set).';

COMMENT ON CONSTRAINT balance_formula ON public.sales IS
  'Balance added = payable total - amount applied. Payable = COALESCE(admin_override_total_cfa, total_cfa).';

COMMENT ON COLUMN public.sales.amount_applied_cfa IS
  'Physical cash received. balance_added_cfa = COALESCE(admin_override_total_cfa, total_cfa) - amount_applied_cfa.';
