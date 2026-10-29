-- GATED backfill: inventory_transactions for products that have
-- audit_log.action = 'correct_electro2_stock_cost' AND entity_type = 'product'.
-- Scope is audit only (Main Depot exists; there is no ELECTRO2 depot).
--
-- set_config(..., true) is transaction-local — gate + DO must share one BEGIN.
-- Never run from Cursor / CI against production.
--
-- ---------------------------------------------------------------------------
-- DRY-RUN (read-only): run this SELECT alone. Lists drift per corrected product.
-- ---------------------------------------------------------------------------
SELECT
  p.id,
  p.name,
  p.current_stock_pieces AS stock,
  COALESCE(SUM(it.quantity_pieces), 0) AS ledger,
  p.current_stock_pieces - COALESCE(SUM(it.quantity_pieces), 0) AS delta
FROM public.products p
LEFT JOIN public.inventory_transactions it ON it.product_id = p.id
WHERE EXISTS (
  SELECT 1
  FROM public.audit_log a
  WHERE a.action = 'correct_electro2_stock_cost'
    AND a.entity_type = 'product'
    AND a.entity_id = p.id
)
GROUP BY p.id, p.name, p.current_stock_pieces
HAVING p.current_stock_pieces - COALESCE(SUM(it.quantity_pieces), 0) <> 0
ORDER BY p.name;

-- ---------------------------------------------------------------------------
-- LIVE — paste ONLY from BEGIN through COMMIT into the Supabase SQL Editor
-- (do not include the dry-run SELECT above). One block:
--   BEGIN; set_config; DO; COMMIT;
-- DO re-checks drift and RAISE EXCEPTION if any remains (rolls everything back).
-- reference_type = inventory_adjustment; created_by = audit actor (admin fallback).
-- ---------------------------------------------------------------------------

BEGIN;

SELECT set_config('vhm.run_electro2_it_backfill', 'on', true);

DO $$
DECLARE
  v_run text := current_setting('vhm.run_electro2_it_backfill', true);
  r record;
  v_ledger numeric;
  v_stock numeric;
  v_delta numeric;
  v_audit_before numeric;
  v_audit_after numeric;
  v_actor uuid;
  v_admin uuid;
  v_done int := 0;
  v_skipped int := 0;
  v_drift int := 0;
BEGIN
  IF v_run IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'backfill_electro2_inventory_transactions: gate off — paste BEGIN; set_config; DO; COMMIT as one script';
  END IF;

  SELECT id INTO v_admin
  FROM public.staff
  WHERE role = 'admin' AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'No active admin staff row for created_by fallback';
  END IF;

  FOR r IN
    SELECT DISTINCT ON (p.id)
      p.id AS product_id,
      p.depot_id,
      p.current_stock_pieces,
      p.name AS product_name,
      a.actor_id,
      a.before_value,
      a.after_value,
      a.occurred_at
    FROM public.products p
    JOIN public.audit_log a
      ON a.entity_id = p.id
     AND a.entity_type = 'product'
     AND a.action = 'correct_electro2_stock_cost'
    ORDER BY p.id, a.occurred_at DESC
  LOOP
    SELECT COALESCE(SUM(it.quantity_pieces), 0)
    INTO v_ledger
    FROM public.inventory_transactions it
    WHERE it.product_id = r.product_id;

    v_stock := COALESCE(r.current_stock_pieces, 0);
    v_delta := v_stock - v_ledger;

    IF v_delta = 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_audit_before := NULLIF((r.before_value->>'stock'), '')::numeric;
    v_audit_after := NULLIF((r.after_value->>'stock'), '')::numeric;
    IF v_audit_before IS NOT NULL AND v_audit_after IS NOT NULL THEN
      IF (v_audit_after - v_audit_before) IS DISTINCT FROM v_delta THEN
        RAISE NOTICE 'delta mismatch product=% ledger_delta=% audit_delta=% — inserting ledger_delta',
          r.product_id, v_delta, (v_audit_after - v_audit_before);
      END IF;
    END IF;

    v_actor := COALESCE(r.actor_id, v_admin);

    INSERT INTO public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by, metadata, created_at
    ) VALUES (
      r.depot_id, r.product_id, v_delta,
      'ADJUSTMENT', 'inventory_adjustment', r.product_id,
      v_actor,
      jsonb_build_object(
        'source', 'backfill_electro2_inventory_transactions',
        'stock', v_stock,
        'ledger_before', v_ledger,
        'audit_stock_before', v_audit_before,
        'audit_stock_after', v_audit_after
      ),
      COALESCE(r.occurred_at, now())
    );
    v_done := v_done + 1;
  END LOOP;

  SELECT COUNT(*) INTO v_drift
  FROM (
    SELECT p.id
    FROM public.products p
    LEFT JOIN public.inventory_transactions it ON it.product_id = p.id
    WHERE EXISTS (
      SELECT 1
      FROM public.audit_log a
      WHERE a.action = 'correct_electro2_stock_cost'
        AND a.entity_type = 'product'
        AND a.entity_id = p.id
    )
    GROUP BY p.id, p.current_stock_pieces
    HAVING p.current_stock_pieces IS DISTINCT FROM COALESCE(SUM(it.quantity_pieces), 0)
  ) d;

  IF v_drift > 0 THEN
    RAISE EXCEPTION 'backfill_electro2_inventory_transactions: % product(s) still drift after insert — rolling back', v_drift;
  END IF;

  RAISE NOTICE 'backfill_electro2_inventory_transactions inserted=% skipped_zero=%', v_done, v_skipped;
END $$;

COMMIT;
