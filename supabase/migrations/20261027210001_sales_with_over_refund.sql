-- Read-only list of tickets whose refunds exceed the payable total
-- COALESCE(admin_override_total_cfa, total_cfa). Does not change history.
-- Also blocks any later write of admin_override_total_cfa below refunds already taken.

CREATE OR REPLACE FUNCTION private.sales_with_over_refund()
RETURNS TABLE (
  sale_id uuid,
  receipt_number text,
  payable_cfa numeric,
  refunded_cfa numeric
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
    COALESCE(SUM(sr.refund_amount_cfa), 0) AS refunded_cfa
  FROM public.sales s
  JOIN public.sale_returns sr ON sr.sale_id = s.id
  GROUP BY s.id, s.receipt_number, s.admin_override_total_cfa, s.total_cfa
  HAVING COALESCE(SUM(sr.refund_amount_cfa), 0)
       > COALESCE(s.admin_override_total_cfa, s.total_cfa);
$$;

REVOKE ALL ON FUNCTION private.sales_with_over_refund() FROM PUBLIC;

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
  SELECT sale_id, receipt_number, payable_cfa, refunded_cfa AS refunds_cfa
  FROM private.sales_with_over_refund()
  WHERE public.is_current_staff_admin();
$$;

REVOKE ALL ON FUNCTION public.admin_refunds_over_payable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_refunds_over_payable() TO authenticated;

CREATE OR REPLACE FUNCTION private.reject_override_below_refunded()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_refunded numeric;
BEGIN
  IF NEW.admin_override_total_cfa IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.admin_override_total_cfa IS NOT DISTINCT FROM OLD.admin_override_total_cfa THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(sr.refund_amount_cfa), 0)
  INTO v_refunded
  FROM public.sale_returns sr
  WHERE sr.sale_id = NEW.id;

  IF v_refunded > NEW.admin_override_total_cfa THEN
    RAISE EXCEPTION
      'Le total ajusté ne peut pas être inférieur au montant déjà remboursé (% CFA).',
      v_refunded
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_override_not_below_refunded ON public.sales;
CREATE TRIGGER sales_override_not_below_refunded
  BEFORE INSERT OR UPDATE OF admin_override_total_cfa
  ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_override_below_refunded();
