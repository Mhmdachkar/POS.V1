-- GATED backfill: inventory_transactions for ELECTRO 2 stock corrections.
-- Does NOT run unless vhm.run_electro2_it_backfill = on in the SAME transaction.
--
-- Why a single transaction?
--   set_config(..., true) is transaction-local. Running set_config then \i in
--   separate statements (auto-commit) always skips the DO block.
--
-- Run manually after review (never from Cursor / CI against production):
--
--   BEGIN;
--   SELECT set_config('vhm.run_electro2_it_backfill', 'on', true);
--   \i scripts/backfill_electro2_inventory_transactions.sql
--   COMMIT;
--
-- reference_type must be 'inventory_adjustment' (CHECK constraint).
-- created_by is NOT NULL — use audit_log.actor_id (fallback: any admin staff).

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
BEGIN
  IF v_run IS DISTINCT FROM 'on' THEN
    RAISE NOTICE 'backfill_electro2_inventory_transactions SKIPPED';
    RAISE NOTICE 'Run inside one transaction: BEGIN; SELECT set_config(''vhm.run_electro2_it_backfill'',''on'',true); \i ...; COMMIT;';
    RETURN;
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
    SELECT
      p.id AS product_id,
      p.depot_id,
      p.current_stock_pieces,
      p.name AS product_name,
      (
        SELECT a.actor_id
        FROM public.audit_log a
        WHERE a.action = 'correct_electro2_stock_cost'
          AND a.entity_type = 'product'
          AND a.entity_id = p.id
        ORDER BY a.occurred_at DESC
        LIMIT 1
      ) AS actor_id,
      (
        SELECT a.before_value
        FROM public.audit_log a
        WHERE a.action = 'correct_electro2_stock_cost'
          AND a.entity_type = 'product'
          AND a.entity_id = p.id
        ORDER BY a.occurred_at DESC
        LIMIT 1
      ) AS before_value,
      (
        SELECT a.after_value
        FROM public.audit_log a
        WHERE a.action = 'correct_electro2_stock_cost'
          AND a.entity_type = 'product'
          AND a.entity_id = p.id
        ORDER BY a.occurred_at DESC
        LIMIT 1
      ) AS after_value,
      (
        SELECT a.occurred_at
        FROM public.audit_log a
        WHERE a.action = 'correct_electro2_stock_cost'
          AND a.entity_type = 'product'
          AND a.entity_id = p.id
        ORDER BY a.occurred_at DESC
        LIMIT 1
      ) AS occurred_at
    FROM public.products p
    JOIN public.depots d ON d.id = p.depot_id
    WHERE d.code = 'ELECTRO2'
       OR d.name ILIKE '%ELECTRO%2%'
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

    -- Cross-check against latest electro2 audit when present.
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

  RAISE NOTICE 'backfill_electro2_inventory_transactions inserted=% skipped_zero=%', v_done, v_skipped;
END $$;

-- Verify: ELECTRO 2 products where stock ≠ sum(movements)
SELECT
  p.id,
  p.name,
  p.current_stock_pieces AS stock,
  COALESCE(SUM(it.quantity_pieces), 0) AS movements_sum,
  p.current_stock_pieces - COALESCE(SUM(it.quantity_pieces), 0) AS drift
FROM public.products p
JOIN public.depots d ON d.id = p.depot_id
LEFT JOIN public.inventory_transactions it ON it.product_id = p.id
WHERE d.code = 'ELECTRO2'
   OR d.name ILIKE '%ELECTRO%2%'
GROUP BY p.id, p.name, p.current_stock_pieces
HAVING p.current_stock_pieces IS DISTINCT FROM COALESCE(SUM(it.quantity_pieces), 0)
ORDER BY p.name;
