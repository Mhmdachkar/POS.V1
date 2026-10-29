-- QA live: customer_ledger cash-refund lines + payment receipt_number backfill.
-- Numbers and ledger projection only. Does not change amounts, dates, or customer.balance_owed_cfa.
-- After apply: SELECT count(*) FROM payments
--   WHERE payment_type = 'customer_payment' AND NOT is_reversed AND receipt_number IS NULL;
-- Expected: 0.

-- Depot for remaining unnumbered customer_payment rows:
--   COALESCE(shift.depot_id, recording staff depot_id, first depot by code).
WITH payment_depot AS (
  SELECT
    p.id,
    COALESCE(
      sh.depot_id,
      st.depot_id,
      (SELECT d.id FROM public.depots d WHERE d.is_active ORDER BY d.code LIMIT 1),
      (SELECT d.id FROM public.depots d ORDER BY d.code LIMIT 1)
    ) AS depot_id,
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
    d.code,
    GREATEST(COALESCE(d.customer_payment_seq, 1), 1)
      + row_number() OVER (PARTITION BY d.id ORDER BY pd.recorded_at, pd.id)
      - 1 AS seq
  FROM payment_depot pd
  JOIN public.depots d ON d.id = pd.depot_id
)
UPDATE public.payments p
SET receipt_number = r.code || '-REG-' || lpad(r.seq::text, 8, '0')
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
    LEFT JOIN public.shifts sh ON sh.id = p.shift_id
    LEFT JOIN public.staff st ON st.id = p.recorded_by
    WHERE p.payment_type = 'customer_payment'
      AND p.receipt_number IS NOT NULL
      AND COALESCE(sh.depot_id, st.depot_id) = d.id
  ), 1)
);

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
      -COALESCE(sr.refund_amount_cfa, 0),
      sr.sale_id,
      false,
      COALESCE(sr.cash_refunded_cfa, 0),
      3
    FROM public.sale_returns sr
    JOIN public.sales s ON s.id = sr.sale_id
    WHERE s.customer_id = p_customer_id

    UNION ALL

    SELECT
      sr.id::text || ':cash_refund',
      'cash_refund',
      sr.created_at,
      s.receipt_number,
      NULL::text,
      'Remboursement especes',
      COALESCE(sr.cash_refunded_cfa, 0),
      sr.sale_id,
      false,
      COALESCE(sr.cash_refunded_cfa, 0),
      4
    FROM public.sale_returns sr
    JOIN public.sales s ON s.id = sr.sale_id
    WHERE s.customer_id = p_customer_id
      AND COALESCE(sr.cash_refunded_cfa, 0) > 0

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
      5
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
