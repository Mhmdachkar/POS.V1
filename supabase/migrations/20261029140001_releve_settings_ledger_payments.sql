-- Phase 1: Releve A4 support — business contact fields, payment receipt numbers, ledger enrichments.
-- Backfill-only: existing customer_payment rows get receipt_number only (ordered by recorded_at per depot).
-- Before backfill: SELECT count(*) FROM payments WHERE payment_type = 'customer_payment' AND receipt_number IS NULL AND NOT is_reversed;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text;

COMMENT ON COLUMN public.business_settings.phone IS 'Optional business phone for commercial PDF headers.';
COMMENT ON COLUMN public.business_settings.address IS 'Optional business address for commercial PDF headers.';

ALTER TABLE public.depots
  ADD COLUMN IF NOT EXISTS customer_payment_seq integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.depots.customer_payment_seq IS 'Next {code}-REG-{8 digits} for standalone customer payments.';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS receipt_number text;

COMMENT ON COLUMN public.payments.receipt_number IS 'Document number for customer_payment rows ({depot}-REG-########).';

CREATE OR REPLACE FUNCTION private.allocate_customer_payment_number(p_depot_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_depot public.depots%ROWTYPE;
  v_number text;
BEGIN
  SELECT * INTO v_depot FROM public.depots WHERE id = p_depot_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT', jsonb_build_object('depot_id', p_depot_id));
  END IF;
  v_number := v_depot.code || '-REG-' || lpad(v_depot.customer_payment_seq::text, 8, '0');
  UPDATE public.depots SET customer_payment_seq = customer_payment_seq + 1 WHERE id = p_depot_id;
  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION private.allocate_customer_payment_number(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.update_business_settings(
  p_business_name text,
  p_logo_url text,
  p_cfa_to_usd_rate numeric,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_before public.business_settings%ROWTYPE;
  v_after public.business_settings%ROWTYPE;
  v_name text;
  v_logo text;
  v_rate numeric;
  v_phone text;
  v_address text;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  v_name := trim(coalesce(p_business_name, ''));
  IF v_name = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'business_name_required', 'field', 'business_name'));
  END IF;

  v_logo := nullif(trim(coalesce(p_logo_url, '')), '');
  IF v_logo IS NOT NULL THEN
    PERFORM private.require_https_url(v_logo, 'INVALID_LOGO_URL');
  END IF;

  v_rate := p_cfa_to_usd_rate;
  IF v_rate IS NULL OR v_rate <= 0 THEN
    PERFORM private.raise_vhm_error('INVALID_EXCHANGE_RATE',
      jsonb_build_object('rate', v_rate));
  END IF;

  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_address := nullif(trim(coalesce(p_address, '')), '');

  SELECT * INTO v_before FROM public.business_settings WHERE id = true FOR UPDATE;

  UPDATE public.business_settings
  SET business_name = v_name,
      logo_url = v_logo,
      cfa_to_usd_rate = v_rate,
      phone = v_phone,
      address = v_address,
      rate_updated_at = CASE
        WHEN v_rate IS DISTINCT FROM v_before.cfa_to_usd_rate THEN now()
        ELSE v_before.rate_updated_at
      END,
      rate_updated_by = CASE
        WHEN v_rate IS DISTINCT FROM v_before.cfa_to_usd_rate THEN v_ctx.staff_id
        ELSE v_before.rate_updated_by
      END
  WHERE id = true
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id := v_ctx.staff_id,
    p_action := 'update_business_settings',
    p_entity_type := 'business_settings',
    p_entity_id := NULL,
    p_depot_id := NULL,
    p_before_val := to_jsonb(v_before),
    p_after_val := to_jsonb(v_after)
  );

  RETURN to_jsonb(v_after);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_business_settings(text, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_business_settings(text, text, numeric, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.update_business_settings(text, text, numeric);

-- Backfill customer_payment receipt numbers (numbers only; no amount/date/customer changes).
WITH payment_depot AS (
  SELECT
    p.id,
    COALESCE(sh.depot_id, st.depot_id) AS depot_id,
    p.recorded_at
  FROM public.payments p
  LEFT JOIN public.shifts sh ON sh.id = p.shift_id
  LEFT JOIN public.staff st ON st.id = p.recorded_by
  WHERE p.payment_type = 'customer_payment'
    AND NOT p.is_reversed
    AND p.receipt_number IS NULL
),
ranked AS (
  SELECT
    pd.id,
    d.id AS depot_id,
    d.code,
    row_number() OVER (PARTITION BY d.id ORDER BY pd.recorded_at, pd.id) AS rn
  FROM payment_depot pd
  JOIN public.depots d ON d.id = pd.depot_id
  WHERE pd.depot_id IS NOT NULL
)
UPDATE public.payments p
SET receipt_number = r.code || '-REG-' || lpad(r.rn::text, 8, '0')
FROM ranked r
WHERE p.id = r.id;

UPDATE public.depots d
SET customer_payment_seq = GREATEST(
  d.customer_payment_seq,
  COALESCE((
    SELECT max(
      (regexp_match(p.receipt_number, '-REG-([0-9]+)$'))[1]::integer
    ) + 1
    FROM public.payments p
    JOIN public.shifts sh ON sh.id = p.shift_id
    WHERE sh.depot_id = d.id
      AND p.payment_type = 'customer_payment'
      AND p.receipt_number IS NOT NULL
  ), 1)
);

CREATE OR REPLACE FUNCTION public.record_payment(
  p_customer_id uuid,
  p_amount_cfa numeric,
  p_shift_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_customer public.customers%ROWTYPE;
  v_payment_id uuid;
  v_new_balance numeric;
  v_depot_id uuid;
  v_receipt_number text;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  IF p_customer_id IS NULL THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      '{"reason": "customer_id_required"}'::jsonb);
  END IF;

  IF p_amount_cfa IS NULL OR p_amount_cfa <= 0 THEN
    PERFORM private.raise_vhm_error('INVALID_AMOUNT',
      jsonb_build_object('reason', 'amount_must_be_positive', 'value', p_amount_cfa));
  END IF;

  PERFORM private.validate_shift(
    p_shift_id,
    COALESCE(
      v_ctx.depot_id,
      (SELECT depot_id FROM public.shifts WHERE id = p_shift_id)
    )
  );

  SELECT depot_id INTO v_depot_id FROM public.shifts WHERE id = p_shift_id;
  v_depot_id := COALESCE(v_depot_id, v_ctx.depot_id);
  IF v_depot_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('reason', 'depot_required_for_payment_number'));
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      jsonb_build_object('customer_id', p_customer_id));
  END IF;

  IF p_amount_cfa > v_customer.balance_owed_cfa THEN
    PERFORM private.raise_vhm_error('PAYMENT_EXCEEDS_BALANCE',
      jsonb_build_object(
        'customer_id', p_customer_id,
        'amount_cfa', p_amount_cfa,
        'balance_owed_cfa', v_customer.balance_owed_cfa
      ));
  END IF;

  v_receipt_number := private.allocate_customer_payment_number(v_depot_id);

  INSERT INTO public.payments (
    customer_id, sale_id, shift_id, payment_type,
    amount_cfa, recorded_by, note, receipt_number
  ) VALUES (
    p_customer_id, NULL, p_shift_id, 'customer_payment',
    p_amount_cfa, v_ctx.staff_id, p_note, v_receipt_number
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.customers
  SET balance_owed_cfa = balance_owed_cfa - p_amount_cfa
  WHERE id = p_customer_id
  RETURNING balance_owed_cfa INTO v_new_balance;

  PERFORM private.write_audit(
    p_actor_id := v_ctx.staff_id,
    p_action := 'record_payment',
    p_entity_type := 'payment',
    p_entity_id := v_payment_id,
    p_depot_id := v_ctx.depot_id,
    p_before_val := jsonb_build_object(
      'balance_owed_cfa', v_customer.balance_owed_cfa
    ),
    p_after_val := jsonb_build_object(
      'payment_id', v_payment_id,
      'amount_cfa', p_amount_cfa,
      'new_balance', v_new_balance,
      'customer_id', p_customer_id,
      'receipt_number', v_receipt_number
    )
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'customer_id', p_customer_id,
    'amount_cfa', p_amount_cfa,
    'new_balance_owed_cfa', v_new_balance,
    'receipt_number', v_receipt_number
  );
EXCEPTION
  WHEN sqlstate 'P0001' THEN RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_payment(uuid, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.customer_ledger(uuid);

CREATE OR REPLACE FUNCTION public.customer_ledger(p_customer_id uuid)
RETURNS TABLE (
  id text,
  kind text,
  occurred_at timestamptz,
  reference text,
  item_summary text,
  note text,
  amount_cfa numeric,
  running_balance_cfa numeric,
  sale_id uuid,
  adds_credit boolean,
  cash_refunded_cfa numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $$
  WITH events AS (
    SELECT
      s.id::text AS id,
      'sale'::text AS kind,
      s.created_at AS occurred_at,
      s.receipt_number AS reference,
      NULL::text AS item_summary,
      NULL::text AS note,
      COALESCE(s.admin_override_total_cfa, s.total_cfa) AS amount_cfa,
      s.id AS sale_id,
      (COALESCE(s.balance_added_cfa, 0) > 0) AS adds_credit,
      NULL::numeric AS cash_refunded_cfa,
      1 AS sort_kind
    FROM public.sales s
    WHERE s.customer_id = p_customer_id
      AND s.status <> 'voided'

    UNION ALL

    SELECT
      s.id::text || ':cash',
      'cash_payment',
      s.created_at,
      s.receipt_number,
      NULL::text,
      NULL::text,
      -s.amount_applied_cfa,
      s.id,
      false,
      NULL::numeric,
      2
    FROM public.sales s
    WHERE s.customer_id = p_customer_id
      AND s.status <> 'voided'
      AND COALESCE(s.amount_applied_cfa, 0) > 0

    UNION ALL

    SELECT
      sr.id::text,
      'return',
      sr.created_at,
      s.receipt_number,
      (
        SELECT string_agg(
          trim(to_char(sri.quantity_in_unit, 'FM999999990.##')) || ' x ' || COALESCE(pr.name, 'Item'),
          ', ' ORDER BY pr.name
        )
        FROM public.sale_return_items sri
        JOIN public.sale_items si ON si.id = sri.sale_item_id
        LEFT JOIN public.products pr ON pr.id = si.product_id
        WHERE sri.return_id = sr.id
      ),
      NULL::text,
      -COALESCE(sr.balance_adjustment_cfa, 0),
      sr.sale_id,
      false,
      COALESCE(sr.cash_refunded_cfa, 0),
      3
    FROM public.sale_returns sr
    JOIN public.sales s ON s.id = sr.sale_id
    WHERE s.customer_id = p_customer_id

    UNION ALL

    SELECT
      p.id::text,
      'account_payment',
      p.recorded_at,
      COALESCE(nullif(btrim(p.receipt_number), ''), nullif(btrim(p.note), '')),
      NULL::text,
      NULLIF(btrim(p.note), ''),
      -p.amount_cfa,
      NULL::uuid,
      false,
      NULL::numeric,
      4
    FROM public.payments p
    WHERE p.customer_id = p_customer_id
      AND p.payment_type = 'customer_payment'
      AND p.is_reversed = false
  )
  SELECT
    e.id,
    e.kind,
    e.occurred_at,
    e.reference,
    e.item_summary,
    e.note,
    e.amount_cfa,
    SUM(e.amount_cfa) OVER (
      ORDER BY e.occurred_at, e.sort_kind, e.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance_cfa,
    e.sale_id,
    e.adds_credit,
    e.cash_refunded_cfa
  FROM events e
  ORDER BY e.occurred_at, e.sort_kind, e.id;
$$;

REVOKE ALL ON FUNCTION public.customer_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_ledger(uuid) TO authenticated;
