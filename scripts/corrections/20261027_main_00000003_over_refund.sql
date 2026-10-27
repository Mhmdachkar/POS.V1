-- NOT A MIGRATION. Do not run until explicitly approved.
-- This file is outside supabase/migrations so `supabase db push` will not apply it.
--
-- MAIN-00000003 (sale 10083594-0d11-46eb-a4e1-3a7ef28a2ee3)
--   catalog total_cfa                9 000
--   admin_override_total_cfa         8 000   ← payable
--   amount_applied_cfa               5 000
--   balance_added_cfa                3 000
--   return 8b7dac4e-… at 15:26:32    refund 2 250 (balance 2 250, cash 0)
--   return 20134786-… at 15:30:30    refund 6 750 (balance 700, cash 6 050)
--   refunds total                    9 000
--   excess vs payable                1 000
--
-- The excess is cash on the second return (6 050 handed back; 5 050 would have
-- matched the payable pool). Customer debt was reduced only by the balance
-- adjustments (2 950 of 3 000), so Solde dû was not driven negative by this ticket.
--
-- Proposed correction, history left intact: do not UPDATE or DELETE sale_returns.
-- Record a +1 000 CFA cash adjustment in the audit log so the till can be
-- reconciled without rewriting the refund rows.
--
-- The statement below aborts on purpose. Remove the RAISE only after approval,
-- then run the INSERT in a transaction you can roll back.

DO $$
BEGIN
  RAISE EXCEPTION
    'MAIN-00000003 correction is not approved. Refusing to run.';
END $$;

-- After approval, replace the block above with:
--
-- INSERT INTO public.audit_log (
--   actor_id, action, entity_type, entity_id, depot_id, before_value, after_value
-- )
-- SELECT
--   NULL,
--   'correct_over_refund',
--   'sale',
--   s.id,
--   s.depot_id,
--   jsonb_build_object(
--     'payable_cfa', COALESCE(s.admin_override_total_cfa, s.total_cfa),
--     'refunded_cfa', 9000,
--     'excess_cfa', 1000
--   ),
--   jsonb_build_object(
--     'adjustment_cfa', 1000,
--     'meaning', 'Cash returned in excess of the payable total. Refund rows unchanged.'
--   )
-- FROM public.sales s
-- WHERE s.receipt_number = 'MAIN-00000003';
