-- Fix complete_sale print enqueue after nullable sale_id, and subtract cash
-- supplier payments (including cash-paid BRs) from shift expected cash.
-- Does not rewrite historical shifts. Does not delete rows.

ALTER TABLE public.print_jobs ALTER COLUMN sale_id DROP NOT NULL;

ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS supplier_payment_id uuid
  REFERENCES public.supplier_payments(id) ON DELETE CASCADE;

ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_document_type_check;
ALTER TABLE public.print_jobs ADD CONSTRAINT print_jobs_document_type_check
  CHECK (document_type IN ('customer_receipt', 'depot_order', 'supplier_payment_rgf'));

ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_sale_id_destination_document_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_sale_doc_uq
  ON public.print_jobs (sale_id, destination, document_type)
  WHERE sale_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_supplier_payment_doc_uq
  ON public.print_jobs (supplier_payment_id, destination, document_type)
  WHERE supplier_payment_id IS NOT NULL;

ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_ref_check;
ALTER TABLE public.print_jobs ADD CONSTRAINT print_jobs_ref_check CHECK (
  (sale_id IS NOT NULL AND supplier_payment_id IS NULL)
  OR (sale_id IS NULL AND supplier_payment_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION private.create_print_jobs_for_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_sale record;
  v_payload jsonb;
BEGIN
  SELECT s.id, s.depot_id, s.status INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id;

  IF NOT FOUND OR v_sale.status = 'voided' THEN
    RETURN;
  END IF;

  v_payload := private.build_print_payload_for_sale(p_sale_id);
  IF v_payload IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.print_jobs (
    sale_id, supplier_payment_id, depot_id, destination, document_type, status, payload
  ) VALUES
    (p_sale_id, NULL, v_sale.depot_id, 'cashier', 'customer_receipt', 'queued', v_payload),
    (p_sale_id, NULL, v_sale.depot_id, 'depot', 'depot_order', 'queued', v_payload)
  ON CONFLICT (sale_id, destination, document_type) WHERE sale_id IS NOT NULL
  DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION private.shift_supplier_cash_out_cfa(
  p_depot_id uuid,
  p_opened_at timestamptz,
  p_closed_at timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT coalesce(sum(sp.amount_cfa), 0)
  FROM public.supplier_payments sp
  WHERE sp.depot_id = p_depot_id
    AND sp.method = 'cash'
    AND sp.recorded_at >= p_opened_at
    AND sp.recorded_at < coalesce(p_closed_at, now());
$$;

DROP FUNCTION IF EXISTS public.shift_running_totals_batch(uuid[]);
CREATE FUNCTION public.shift_running_totals_batch(p_shift_ids uuid[])
RETURNS TABLE (
  shift_id uuid,
  sales_cash_cfa numeric,
  customer_pmts_cfa numeric,
  return_cash_cfa numeric,
  cash_in_cfa numeric,
  cash_out_cfa numeric,
  supplier_cash_cfa numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  RETURN QUERY
  SELECT
    sh.id,
    coalesce((
      SELECT sum(sa.amount_applied_cfa)
      FROM public.sales sa
      WHERE sa.shift_id = sh.id AND sa.status <> 'voided'
    ), 0),
    coalesce((
      SELECT sum(p.amount_cfa)
      FROM public.payments p
      WHERE p.shift_id = sh.id
        AND p.payment_type = 'customer_payment'
        AND p.is_reversed = false
        AND (p.payment_method IS NULL OR p.payment_method = 'cash')
    ), 0),
    coalesce((
      SELECT sum(r.cash_refunded_cfa)
      FROM public.sale_returns r
      WHERE r.shift_id = sh.id
    ), 0),
    coalesce((
      SELECT sum(m.amount_cfa)
      FROM public.shift_cash_movements m
      WHERE m.shift_id = sh.id AND m.direction = 'in'
    ), 0),
    coalesce((
      SELECT sum(m.amount_cfa)
      FROM public.shift_cash_movements m
      WHERE m.shift_id = sh.id AND m.direction = 'out'
    ), 0),
    private.shift_supplier_cash_out_cfa(sh.depot_id, sh.opened_at, sh.closed_at)
  FROM unnest(coalesce(p_shift_ids, array[]::uuid[])) AS s(id)
  JOIN public.shifts sh ON sh.id = s.id
  WHERE v_ctx.role = 'admin'
     OR sh.depot_id IS NOT DISTINCT FROM v_ctx.depot_id;
END;
$$;
REVOKE ALL ON FUNCTION public.shift_running_totals_batch(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shift_running_totals_batch(uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION private.shift_expected_cash_cfa(p_shift_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_shift public.shifts%ROWTYPE;
  v_sales numeric := 0;
  v_pmts numeric := 0;
  v_refunds numeric := 0;
  v_in numeric := 0;
  v_out numeric := 0;
  v_supplier numeric := 0;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT coalesce(sum(amount_applied_cfa), 0) INTO v_sales
  FROM public.sales
  WHERE shift_id = p_shift_id AND status <> 'voided';

  SELECT coalesce(sum(amount_cfa), 0) INTO v_pmts
  FROM public.payments
  WHERE shift_id = p_shift_id
    AND payment_type = 'customer_payment'
    AND is_reversed = false
    AND (payment_method IS NULL OR payment_method = 'cash');

  SELECT coalesce(sum(cash_refunded_cfa), 0) INTO v_refunds
  FROM public.sale_returns
  WHERE shift_id = p_shift_id;

  SELECT coalesce(sum(amount_cfa) FILTER (WHERE direction = 'in'), 0),
         coalesce(sum(amount_cfa) FILTER (WHERE direction = 'out'), 0)
  INTO v_in, v_out
  FROM public.shift_cash_movements
  WHERE shift_id = p_shift_id;

  v_supplier := private.shift_supplier_cash_out_cfa(v_shift.depot_id, v_shift.opened_at, v_shift.closed_at);

  RETURN coalesce(v_shift.opening_float_cfa, 0) + v_sales + v_pmts + v_in - v_refunds - v_out - v_supplier;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_shift(
  p_shift_id        uuid,
  p_actual_cash_cfa numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx           private.caller_ctx;
  v_shift         public.shifts%ROWTYPE;
  v_expected_cash numeric;
  v_discrepancy   numeric;
  v_sales_cash    numeric;
  v_customer_pmts numeric;
  v_return_cash   numeric;
  v_cash_in       numeric;
  v_cash_out      numeric;
  v_supplier_cash numeric;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  IF p_shift_id IS NULL THEN
    PERFORM private.raise_vhm_error('SHIFT_NOT_FOUND', '{"reason":"shift_id_required"}'::jsonb);
  END IF;

  IF p_actual_cash_cfa IS NULL OR p_actual_cash_cfa < 0 THEN
    PERFORM private.raise_vhm_error('INVALID_AMOUNT',
      '{"reason":"actual_cash_must_be_non_negative"}'::jsonb);
  END IF;

  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('SHIFT_NOT_FOUND',
      jsonb_build_object('shift_id', p_shift_id));
  END IF;

  IF v_ctx.role = 'cashier' AND v_shift.depot_id != v_ctx.depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('shift_depot', v_shift.depot_id, 'caller_depot', v_ctx.depot_id));
  END IF;

  IF v_shift.status != 'open' THEN
    PERFORM private.raise_vhm_error('SHIFT_NOT_OPEN',
      jsonb_build_object('shift_id', p_shift_id, 'status', v_shift.status));
  END IF;

  SELECT coalesce(sum(amount_applied_cfa), 0)
  INTO v_sales_cash
  FROM public.sales
  WHERE shift_id = p_shift_id AND status != 'voided';

  SELECT coalesce(sum(amount_cfa), 0)
  INTO v_customer_pmts
  FROM public.payments
  WHERE shift_id = p_shift_id
    AND payment_type = 'customer_payment'
    AND is_reversed = false
    AND (payment_method IS NULL OR payment_method = 'cash');

  SELECT coalesce(sum(cash_refunded_cfa), 0)
  INTO v_return_cash
  FROM public.sale_returns
  WHERE shift_id = p_shift_id;

  SELECT coalesce(sum(amount_cfa) FILTER (WHERE direction = 'in'), 0),
         coalesce(sum(amount_cfa) FILTER (WHERE direction = 'out'), 0)
  INTO v_cash_in, v_cash_out
  FROM public.shift_cash_movements
  WHERE shift_id = p_shift_id;

  v_supplier_cash := private.shift_supplier_cash_out_cfa(
    v_shift.depot_id, v_shift.opened_at, now()
  );

  v_expected_cash := v_shift.opening_float_cfa
                   + v_sales_cash
                   + v_customer_pmts
                   + v_cash_in
                   - v_return_cash
                   - v_cash_out
                   - v_supplier_cash;

  v_discrepancy := p_actual_cash_cfa - v_expected_cash;

  UPDATE public.shifts SET
    status            = 'closed',
    closed_at         = now(),
    closed_by         = v_ctx.staff_id,
    expected_cash_cfa = v_expected_cash,
    actual_cash_cfa   = p_actual_cash_cfa,
    discrepancy_cfa   = v_discrepancy
  WHERE id = p_shift_id;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'close_shift',
    p_entity_type := 'shift',
    p_entity_id   := p_shift_id,
    p_depot_id    := v_shift.depot_id,
    p_before_val  := jsonb_build_object('status', 'open'),
    p_after_val   := jsonb_build_object(
      'status',             'closed',
      'closed_by',          v_ctx.staff_id,
      'expected_cash_cfa',  v_expected_cash,
      'actual_cash_cfa',    p_actual_cash_cfa,
      'discrepancy_cfa',    v_discrepancy,
      'sales_cash_cfa',     v_sales_cash,
      'customer_pmts_cfa',  v_customer_pmts,
      'return_cash_cfa',    v_return_cash,
      'cash_in_cfa',        v_cash_in,
      'cash_out_cfa',       v_cash_out,
      'supplier_cash_cfa',  v_supplier_cash
    )
  );

  RETURN jsonb_build_object(
    'shift_id',           p_shift_id,
    'expected_cash_cfa',  v_expected_cash,
    'actual_cash_cfa',    p_actual_cash_cfa,
    'discrepancy_cfa',    v_discrepancy,
    'breakdown',          jsonb_build_object(
      'opening_float_cfa',   v_shift.opening_float_cfa,
      'sales_cash_cfa',      v_sales_cash,
      'customer_pmts_cfa',   v_customer_pmts,
      'return_cash_cfa',     v_return_cash,
      'cash_in_cfa',         v_cash_in,
      'cash_out_cfa',        v_cash_out,
      'supplier_cash_cfa',   v_supplier_cash
    )
  );
EXCEPTION
  WHEN sqlstate 'P0001' THEN RAISE;
END;
$$;