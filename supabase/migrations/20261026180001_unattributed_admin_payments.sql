-- ================================================================
-- B6 follow-up -- unattributed payments recorded by admin
-- (staff.depot_id IS NULL) appear in depot-scoped reports.
-- ================================================================
-- 20261026120003 already switched reports to payable totals and
-- included cashier-depot unattributed payments. Admin-recorded
-- payments with no shift were still dropped when a depot filter
-- was active. Existing rows are not modified.
-- ================================================================

CREATE OR REPLACE FUNCTION private.payment_matches_report_depot(
  p_shift_id uuid,
  p_recorded_by uuid,
  p_depot_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_depot_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.shifts sh
      WHERE sh.id = p_shift_id AND sh.depot_id = p_depot_id
    )
    OR (
      p_shift_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.staff st
        WHERE st.id = p_recorded_by
          AND (
            st.depot_id = p_depot_id
            OR st.depot_id IS NULL
          )
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION private.payment_matches_report_depot(uuid, uuid, uuid) FROM PUBLIC;
