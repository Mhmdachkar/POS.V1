-- Phase 1: supplier detail + relevé.
-- Reconstructs a running-balance ledger from BRs and payments.
-- Running balance is floored at 0 after each event, matching
-- cancel_purchase_receipt (greatest(0, balance - total)) so the last
-- row equals suppliers.balance_owed_cfa even when a credit BR is
-- cancelled after a partial payment.
-- Does not change amounts, dates, or stored balances.

CREATE OR REPLACE FUNCTION public.get_supplier(p_supplier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_row public.suppliers%ROWTYPE;
  v_purchased numeric;
  v_paid numeric;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT * INTO v_row FROM public.suppliers WHERE id = p_supplier_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('supplier_id', p_supplier_id));
  END IF;

  SELECT coalesce(sum(r.total_cfa), 0) INTO v_purchased
  FROM public.purchase_receipts r
  WHERE r.supplier_id = p_supplier_id
    AND r.status = 'validated';

  SELECT coalesce(sum(sp.amount_cfa), 0) INTO v_paid
  FROM public.supplier_payments sp
  WHERE sp.supplier_id = p_supplier_id;

  RETURN to_jsonb(v_row) || jsonb_build_object(
    'purchased_cfa', v_purchased,
    'paid_cfa', v_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_supplier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supplier(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.supplier_ledger(p_supplier_id uuid)
RETURNS TABLE (
  id text,
  kind text,
  occurred_at timestamptz,
  reference text,
  detail text,
  amount_cfa numeric,
  running_balance_cfa numeric,
  purchase_receipt_id uuid,
  supplier_payment_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_running numeric := 0;
  r record;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id) THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('supplier_id', p_supplier_id));
  END IF;

  FOR r IN
    WITH events AS (
      SELECT
        pr.id::text AS id,
        'purchase'::text AS kind,
        pr.validated_at AS occurred_at,
        pr.number AS reference,
        CASE
          WHEN pr.payment_mode = 'paid' THEN 'BR payé'
          ELSE 'BR à crédit'
        END AS detail,
        pr.total_cfa AS amount_cfa,
        pr.id AS purchase_receipt_id,
        NULL::uuid AS supplier_payment_id,
        1 AS sort_kind
      FROM public.purchase_receipts pr
      WHERE pr.supplier_id = p_supplier_id
        AND pr.validated_at IS NOT NULL
        AND pr.payment_mode IN ('credit', 'paid')

      UNION ALL

      SELECT
        pr.id::text || ':cancel',
        'purchase_cancel',
        pr.cancelled_at,
        pr.number,
        'Annulation BR',
        -pr.total_cfa,
        pr.id,
        NULL::uuid,
        3
      FROM public.purchase_receipts pr
      WHERE pr.supplier_id = p_supplier_id
        AND pr.status = 'cancelled'
        AND pr.validated_at IS NOT NULL
        AND pr.cancelled_at IS NOT NULL

      UNION ALL

      SELECT
        sp.id::text,
        'payment',
        sp.recorded_at,
        COALESCE(pr.number, NULLIF(btrim(COALESCE(sp.note, '')), '')),
        COALESCE(
          NULLIF(btrim(sp.note), ''),
          CASE
            WHEN pr.number IS NOT NULL THEN 'Règlement BR ' || pr.number
            ELSE 'Règlement fournisseur'
          END
        ),
        -sp.amount_cfa,
        sp.purchase_receipt_id,
        sp.id,
        2
      FROM public.supplier_payments sp
      LEFT JOIN public.purchase_receipts pr ON pr.id = sp.purchase_receipt_id
      WHERE sp.supplier_id = p_supplier_id

      UNION ALL

      SELECT
        sp.id::text || ':rev',
        'payment_reversal',
        pr.cancelled_at,
        pr.number,
        'Annulation règlement BR',
        sp.amount_cfa,
        pr.id,
        sp.id,
        4
      FROM public.supplier_payments sp
      JOIN public.purchase_receipts pr ON pr.id = sp.purchase_receipt_id
      WHERE sp.supplier_id = p_supplier_id
        AND pr.status = 'cancelled'
        AND pr.payment_mode = 'paid'
        AND pr.cancelled_at IS NOT NULL
    )
    SELECT *
    FROM events
    ORDER BY occurred_at, sort_kind, id
  LOOP
    v_running := greatest(0, round(v_running + r.amount_cfa, 2));
    id := r.id;
    kind := r.kind;
    occurred_at := r.occurred_at;
    reference := r.reference;
    detail := r.detail;
    amount_cfa := r.amount_cfa;
    running_balance_cfa := v_running;
    purchase_receipt_id := r.purchase_receipt_id;
    supplier_payment_id := r.supplier_payment_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_ledger(uuid) TO authenticated;
