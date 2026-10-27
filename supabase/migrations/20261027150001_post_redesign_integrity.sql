-- Post-redesign read models. Does not change sale, return, payment, or shift writes.
-- 1.1 MAIN-00000003 refunds (9 000) exceed payable (8 000). process_return already
-- caps new refunds at the payable/taken pool (20261026120001). This lists legacy rows only.

CREATE OR REPLACE FUNCTION public.admin_refunds_over_payable()
RETURNS TABLE (
  sale_id uuid,
  receipt_number text,
  payable_cfa numeric,
  refunds_cfa numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT
    s.id,
    s.receipt_number,
    COALESCE(s.admin_override_total_cfa, s.total_cfa) AS payable_cfa,
    COALESCE(SUM(sr.refund_amount_cfa), 0) AS refunds_cfa
  FROM public.sales s
  JOIN public.sale_returns sr ON sr.sale_id = s.id
  WHERE public.is_current_staff_admin()
  GROUP BY s.id, s.receipt_number, s.admin_override_total_cfa, s.total_cfa
  HAVING COALESCE(SUM(sr.refund_amount_cfa), 0)
       > COALESCE(s.admin_override_total_cfa, s.total_cfa) + 0.01;
$$;

REVOKE ALL ON FUNCTION public.admin_refunds_over_payable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_refunds_over_payable() TO authenticated;

-- Display name only, for sales or shifts the caller can already see in their depot.
CREATE OR REPLACE FUNCTION public.staff_display_names(p_ids uuid[])
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT s.id, s.full_name
  FROM public.staff s
  WHERE s.id = ANY (COALESCE(p_ids, ARRAY[]::uuid[]))
    AND (
      public.is_current_staff_admin()
      OR s.id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.sales sa
        WHERE sa.cashier_id = s.id
          AND (
            public.is_current_staff_admin()
            OR sa.depot_id = public.get_current_staff_depot_id()
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.shifts sh
        WHERE sh.cashier_id = s.id
          AND (
            public.is_current_staff_admin()
            OR sh.depot_id = public.get_current_staff_depot_id()
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.staff_display_names(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_display_names(uuid[]) TO authenticated;
