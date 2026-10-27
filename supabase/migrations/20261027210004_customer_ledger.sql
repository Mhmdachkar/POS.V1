-- Customer balance ledger. Cash received on a sale is its own negative line,
-- so a cash ticket nets to zero. Returns move the balance only by
-- balance_adjustment_cfa. The last row's running balance equals Solde dû
-- when every posted movement is included (oldest first).

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
  adds_credit boolean
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
          trim(to_char(sri.quantity_in_unit, 'FM999999990.##')) || ' × ' || COALESCE(pr.name, 'Item'),
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
      3
    FROM public.sale_returns sr
    JOIN public.sales s ON s.id = sr.sale_id
    WHERE s.customer_id = p_customer_id

    UNION ALL

    SELECT
      p.id::text,
      'account_payment',
      p.recorded_at,
      NULL::text,
      NULL::text,
      NULLIF(btrim(p.note), ''),
      -p.amount_cfa,
      NULL::uuid,
      false,
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
    e.adds_credit
  FROM events e
  ORDER BY e.occurred_at, e.sort_kind, e.id;
$$;

REVOKE ALL ON FUNCTION public.customer_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_ledger(uuid) TO authenticated;
