-- GATED backfill: inventory_transactions for correct_electro2_stock_cost audits.
-- Does NOT run unless you explicitly set the GUC below to on in the same session.
--
-- Example (manual, after review):
--   select set_config('vhm.run_electro2_it_backfill', 'on', true);
--   \i scripts/backfill_electro2_inventory_transactions.sql
--
-- Never apply from Cursor / CI against production.

DO $$
DECLARE
  v_run text := current_setting('vhm.run_electro2_it_backfill', true);
  r record;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_done int := 0;
BEGIN
  IF v_run IS DISTINCT FROM 'on' THEN
    RAISE NOTICE 'backfill_electro2_inventory_transactions SKIPPED (set vhm.run_electro2_it_backfill=on to run)';
    RETURN;
  END IF;

  FOR r IN
    SELECT
      a.entity_id AS product_id,
      a.depot_id,
      a.occurred_at,
      a.before_value,
      a.after_value
    FROM public.audit_log a
    WHERE a.action = 'correct_electro2_stock_cost'
      AND a.entity_type = 'product'
      AND a.entity_id IS NOT NULL
  LOOP
    v_before := NULLIF((r.before_value->>'stock'), '')::numeric;
    v_after := NULLIF((r.after_value->>'stock'), '')::numeric;
    IF v_before IS NULL OR v_after IS NULL THEN
      CONTINUE;
    END IF;
    v_delta := v_after - v_before;
    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    -- Skip if an ADJUSTMENT already exists for this product around the audit time.
    IF EXISTS (
      SELECT 1
      FROM public.inventory_transactions it
      WHERE it.product_id = r.product_id
        AND it.transaction_type = 'ADJUSTMENT'
        AND it.reference_type = 'electro2_correction'
        AND it.created_at BETWEEN r.occurred_at - interval '1 minute' AND r.occurred_at + interval '1 minute'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by, metadata, created_at
    ) VALUES (
      r.depot_id, r.product_id, v_delta,
      'ADJUSTMENT', 'electro2_correction', r.product_id,
      NULL,
      jsonb_build_object(
        'source', 'backfill_electro2_inventory_transactions',
        'stock_before', v_before,
        'stock_after', v_after
      ),
      r.occurred_at
    );
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'backfill_electro2_inventory_transactions inserted=%', v_done;
END $$;