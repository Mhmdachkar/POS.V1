-- NOT A MIGRATION. Outside supabase/migrations — `supabase db push` will not apply this.
-- ELECTRO 2 correction (56 products from 2INV.xlsx). Safe for Supabase SQL Editor.
--
-- Bug: parse_electro2 used C7 as pcs_ctn, C8 as tqty, C13 as L0 cost.
-- Truth: C4=CTN, C5=PCS/CTN, C6=TQTY pieces; C7/C8 not pieces; C13=126xC7 (not cost).
--
-- ============================================================================
-- PART 1 — STOCK + CARTON CONVERSION (gated)
-- ============================================================================
-- Stock = GREATEST(0, C6 + Sum(inventory_transactions.quantity_pieces) excluding RESTOCK)
-- L1 relative_quantity / conversion_to_base = C5. L0/L1 cost_price_cfa UNCHANGED.
-- Gate: approved_stock := false  (set true after reviewing Before SELECT).
-- Idempotent via audit action correct_electro2_stock.
--
-- ============================================================================
-- PART 2 — COST (DISABLED)
-- ============================================================================
-- C11 x 156 / C5 is unrealistic (e.g. Z1-13 L0 ~655 CFA vs sell 16 000).
-- Do not change costs here. Client will provide real purchase costs later
-- (separate script). The Part 2 block below is a no-op stub.

-- ############################################################################
-- PART 1 — Before (preview; safe, read-only)
-- ############################################################################
WITH truth(serial, pcs_ctn, tqty) AS (
  VALUES
    ('Z1-1', 6, 18::numeric),
    ('Z1-2', 10, 30::numeric),
    ('Z1-3', 10, 170::numeric),
    ('Z1-4', 6, 24::numeric),
    ('Z1-8', 12, 24::numeric),
    ('Z1-11', 12, 72::numeric),
    ('Z1-12', 6, 60::numeric),
    ('Z1-13', 4, 136::numeric),
    ('Z1-131', 16, 64::numeric),
    ('Z-132', 16, 0::numeric),
    ('Z-133', 4, 40::numeric),
    ('Z-134', 12, 24::numeric),
    ('Z-135', 24, 72::numeric),
    ('Z1-21', 2, 6::numeric),
    ('Z1-24', 20, 80::numeric),
    ('Z1-34', 20, 640::numeric),
    ('Z1-35', 20, 480::numeric),
    ('Z1-36', 10, 90::numeric),
    ('Z1-38', 7, 14::numeric),
    ('Z1-40', 60, 510::numeric),
    ('Z1-41', 60, 570::numeric),
    ('Z1-42', 48, 144::numeric),
    ('Z1-43', 80, 80::numeric),
    ('Z1-44', 70, 140::numeric),
    ('Z1-45', 60, 150::numeric),
    ('Z1-46', 60, 300::numeric),
    ('Z1-47', 4, 12::numeric),
    ('Z1-49', 6, 5::numeric),
    ('Z1-50', 7, 6::numeric),
    ('Z1-51', 6, 5::numeric),
    ('Z1-52', 7, 6::numeric),
    ('Z1-55', 27, 26::numeric),
    ('Z1-56', 7, 6::numeric),
    ('Z1-64', 6, 18::numeric),
    ('Z1-68', 80, 560::numeric),
    ('Z1-69', 50, 300::numeric),
    ('Z1-70', 60, 360::numeric),
    ('Z1-71', 30, 150::numeric),
    ('Z1-72', 60, 300::numeric),
    ('Z1-73', 30, 90::numeric),
    ('Z1-74', 20, 20::numeric),
    ('Z1-75', 10, 10::numeric),
    ('Z1-76', 20, 0::numeric),
    ('Z1-77', 10, 20::numeric),
    ('Z1-78', 20, 40::numeric),
    ('Z1-80', 20, 160::numeric),
    ('Z1-81', 10, 80::numeric),
    ('Z1-86', 100, 100::numeric),
    ('Z1-88', 100, 100::numeric),
    ('Z1-89', 60, 60::numeric),
    ('Z1-90', 24, 48::numeric),
    ('Z1-91', 24, 72::numeric),
    ('Z1-92', 24, 72::numeric),
    ('Z1-93', 10, 10::numeric),
    ('Z1-94', 10, 20::numeric),
    ('Z1-96', 10, 70::numeric)
),
targets AS (
  SELECT
    t.serial,
    t.pcs_ctn,
    t.tqty,
    pu.product_id,
    p.name AS product_name,
    p.current_stock_pieces AS stock_before,
    pu1.relative_quantity AS l1_rel_before,
    pu1.conversion_to_base AS l1_conv_before,
    GREATEST(
      0,
      t.tqty + COALESCE((
        SELECT SUM(it.quantity_pieces)
        FROM public.inventory_transactions it
        WHERE it.product_id = pu.product_id
          AND it.transaction_type <> 'RESTOCK'
      ), 0)
    ) AS stock_after
  FROM truth t
  JOIN public.product_units pu
    ON lower(pu.serial_number) = lower(t.serial) AND pu.unit_level = 0
  JOIN public.products p ON p.id = pu.product_id
  LEFT JOIN public.product_units pu1
    ON pu1.product_id = p.id AND pu1.unit_level = 1
)
SELECT
  serial,
  product_name,
  stock_before,
  stock_after,
  l1_rel_before,
  pcs_ctn AS l1_rel_after,
  l1_conv_before,
  pcs_ctn AS l1_conv_after
FROM targets
ORDER BY serial;

-- ############################################################################
-- PART 1 — Apply (gated)
-- ############################################################################
DO $$
DECLARE
  approved_stock boolean := false;  -- set true only after reviewing Part 1 Before SELECT
  r RECORD;
  v_stock_after numeric;
  v_before jsonb;
  v_after jsonb;
  v_done int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT approved_stock THEN
    RAISE EXCEPTION
      'ELECTRO 2 Part 1 (stock) not approved. Set approved_stock := true after reviewing the Before SELECT.';
  END IF;

  FOR r IN
    WITH truth(serial, pcs_ctn, tqty) AS (
      VALUES
    ('Z1-1', 6, 18::numeric),
    ('Z1-2', 10, 30::numeric),
    ('Z1-3', 10, 170::numeric),
    ('Z1-4', 6, 24::numeric),
    ('Z1-8', 12, 24::numeric),
    ('Z1-11', 12, 72::numeric),
    ('Z1-12', 6, 60::numeric),
    ('Z1-13', 4, 136::numeric),
    ('Z1-131', 16, 64::numeric),
    ('Z-132', 16, 0::numeric),
    ('Z-133', 4, 40::numeric),
    ('Z-134', 12, 24::numeric),
    ('Z-135', 24, 72::numeric),
    ('Z1-21', 2, 6::numeric),
    ('Z1-24', 20, 80::numeric),
    ('Z1-34', 20, 640::numeric),
    ('Z1-35', 20, 480::numeric),
    ('Z1-36', 10, 90::numeric),
    ('Z1-38', 7, 14::numeric),
    ('Z1-40', 60, 510::numeric),
    ('Z1-41', 60, 570::numeric),
    ('Z1-42', 48, 144::numeric),
    ('Z1-43', 80, 80::numeric),
    ('Z1-44', 70, 140::numeric),
    ('Z1-45', 60, 150::numeric),
    ('Z1-46', 60, 300::numeric),
    ('Z1-47', 4, 12::numeric),
    ('Z1-49', 6, 5::numeric),
    ('Z1-50', 7, 6::numeric),
    ('Z1-51', 6, 5::numeric),
    ('Z1-52', 7, 6::numeric),
    ('Z1-55', 27, 26::numeric),
    ('Z1-56', 7, 6::numeric),
    ('Z1-64', 6, 18::numeric),
    ('Z1-68', 80, 560::numeric),
    ('Z1-69', 50, 300::numeric),
    ('Z1-70', 60, 360::numeric),
    ('Z1-71', 30, 150::numeric),
    ('Z1-72', 60, 300::numeric),
    ('Z1-73', 30, 90::numeric),
    ('Z1-74', 20, 20::numeric),
    ('Z1-75', 10, 10::numeric),
    ('Z1-76', 20, 0::numeric),
    ('Z1-77', 10, 20::numeric),
    ('Z1-78', 20, 40::numeric),
    ('Z1-80', 20, 160::numeric),
    ('Z1-81', 10, 80::numeric),
    ('Z1-86', 100, 100::numeric),
    ('Z1-88', 100, 100::numeric),
    ('Z1-89', 60, 60::numeric),
    ('Z1-90', 24, 48::numeric),
    ('Z1-91', 24, 72::numeric),
    ('Z1-92', 24, 72::numeric),
    ('Z1-93', 10, 10::numeric),
    ('Z1-94', 10, 20::numeric),
    ('Z1-96', 10, 70::numeric)
    )
    SELECT
      t.serial,
      t.pcs_ctn,
      t.tqty,
      pu.product_id,
      p.depot_id,
      p.current_stock_pieces AS stock_before,
      pu1.id AS l1_id,
      pu1.relative_quantity AS l1_rel_before,
      pu1.conversion_to_base AS l1_conv_before,
      pu0.id AS l0_id,
      pu0.selling_price_cfa AS l0_sell
    FROM truth t
    JOIN public.product_units pu
      ON lower(pu.serial_number) = lower(t.serial) AND pu.unit_level = 0
    JOIN public.products p ON p.id = pu.product_id
    LEFT JOIN public.product_units pu0
      ON pu0.product_id = p.id AND pu0.unit_level = 0
    LEFT JOIN public.product_units pu1
      ON pu1.product_id = p.id AND pu1.unit_level = 1
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.audit_log a
      WHERE a.entity_type = 'product'
        AND a.entity_id = r.product_id
        AND a.action = 'correct_electro2_stock'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT GREATEST(
      0,
      r.tqty + COALESCE(SUM(it.quantity_pieces), 0)
    )
    INTO v_stock_after
    FROM public.inventory_transactions it
    WHERE it.product_id = r.product_id
      AND it.transaction_type <> 'RESTOCK';

    v_before := jsonb_build_object(
      'serial', r.serial,
      'stock', r.stock_before,
      'l1_relative_quantity', r.l1_rel_before,
      'l1_conversion', r.l1_conv_before
    );

    UPDATE public.products
    SET current_stock_pieces = v_stock_after,
        updated_at = now()
    WHERE id = r.product_id;

    -- Carton conversion only — do NOT touch cost_price_cfa
    IF r.l1_id IS NOT NULL THEN
      UPDATE public.product_units
      SET relative_quantity = r.pcs_ctn,
          conversion_to_base = r.pcs_ctn
      WHERE id = r.l1_id;
    ELSIF r.pcs_ctn > 1 THEN
      INSERT INTO public.product_units (
        product_id, unit_level, unit_name, serial_number,
        relative_quantity, conversion_to_base,
        cost_price_cfa, selling_price_cfa
      ) VALUES (
        r.product_id, 1, 'Carton', r.serial || '-CTN',
        r.pcs_ctn, r.pcs_ctn,
        COALESCE((SELECT cost_price_cfa * r.pcs_ctn FROM public.product_units WHERE id = r.l0_id), 0),
        COALESCE(r.l0_sell * r.pcs_ctn, 0)
      );
    END IF;

    v_after := jsonb_build_object(
      'serial', r.serial,
      'stock', v_stock_after,
      'l1_relative_quantity', r.pcs_ctn,
      'l1_conversion', r.pcs_ctn,
      'excel_tqty', r.tqty
    );

    INSERT INTO public.audit_log (
      actor_id, action, entity_type, entity_id, depot_id, before_value, after_value
    ) VALUES (
      NULL,
      'correct_electro2_stock',
      'product',
      r.product_id,
      r.depot_id,
      v_before,
      v_after
    );

    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'ELECTRO 2 Part 1 stock applied=% skipped_idempotent=%', v_done, v_skipped;
END $$;

-- ############################################################################
-- PART 1 — After (verify)
-- ############################################################################
WITH truth(serial, pcs_ctn, tqty) AS (
  VALUES
    ('Z1-1', 6, 18::numeric),
    ('Z1-2', 10, 30::numeric),
    ('Z1-3', 10, 170::numeric),
    ('Z1-4', 6, 24::numeric),
    ('Z1-8', 12, 24::numeric),
    ('Z1-11', 12, 72::numeric),
    ('Z1-12', 6, 60::numeric),
    ('Z1-13', 4, 136::numeric),
    ('Z1-131', 16, 64::numeric),
    ('Z-132', 16, 0::numeric),
    ('Z-133', 4, 40::numeric),
    ('Z-134', 12, 24::numeric),
    ('Z-135', 24, 72::numeric),
    ('Z1-21', 2, 6::numeric),
    ('Z1-24', 20, 80::numeric),
    ('Z1-34', 20, 640::numeric),
    ('Z1-35', 20, 480::numeric),
    ('Z1-36', 10, 90::numeric),
    ('Z1-38', 7, 14::numeric),
    ('Z1-40', 60, 510::numeric),
    ('Z1-41', 60, 570::numeric),
    ('Z1-42', 48, 144::numeric),
    ('Z1-43', 80, 80::numeric),
    ('Z1-44', 70, 140::numeric),
    ('Z1-45', 60, 150::numeric),
    ('Z1-46', 60, 300::numeric),
    ('Z1-47', 4, 12::numeric),
    ('Z1-49', 6, 5::numeric),
    ('Z1-50', 7, 6::numeric),
    ('Z1-51', 6, 5::numeric),
    ('Z1-52', 7, 6::numeric),
    ('Z1-55', 27, 26::numeric),
    ('Z1-56', 7, 6::numeric),
    ('Z1-64', 6, 18::numeric),
    ('Z1-68', 80, 560::numeric),
    ('Z1-69', 50, 300::numeric),
    ('Z1-70', 60, 360::numeric),
    ('Z1-71', 30, 150::numeric),
    ('Z1-72', 60, 300::numeric),
    ('Z1-73', 30, 90::numeric),
    ('Z1-74', 20, 20::numeric),
    ('Z1-75', 10, 10::numeric),
    ('Z1-76', 20, 0::numeric),
    ('Z1-77', 10, 20::numeric),
    ('Z1-78', 20, 40::numeric),
    ('Z1-80', 20, 160::numeric),
    ('Z1-81', 10, 80::numeric),
    ('Z1-86', 100, 100::numeric),
    ('Z1-88', 100, 100::numeric),
    ('Z1-89', 60, 60::numeric),
    ('Z1-90', 24, 48::numeric),
    ('Z1-91', 24, 72::numeric),
    ('Z1-92', 24, 72::numeric),
    ('Z1-93', 10, 10::numeric),
    ('Z1-94', 10, 20::numeric),
    ('Z1-96', 10, 70::numeric)
),
targets AS (
  SELECT
    t.serial,
    p.name AS product_name,
    t.tqty AS excel_tqty,
    p.current_stock_pieces AS stock,
    pu1.relative_quantity AS l1_rel,
    pu1.conversion_to_base AS l1_conv,
    t.pcs_ctn AS expected_pcs_ctn,
    EXISTS (
      SELECT 1 FROM public.audit_log a
      WHERE a.entity_id = p.id AND a.action = 'correct_electro2_stock'
    ) AS corrected
  FROM truth t
  JOIN public.product_units pu
    ON lower(pu.serial_number) = lower(t.serial) AND pu.unit_level = 0
  JOIN public.products p ON p.id = pu.product_id
  LEFT JOIN public.product_units pu1 ON pu1.product_id = p.id AND pu1.unit_level = 1
)
SELECT * FROM targets ORDER BY serial;

-- ############################################################################
-- PART 2 — COST (DISABLED — do not enable)
-- ############################################################################
-- Real purchase costs will be loaded by a separate script from the client.
-- Example why C11-based FX is wrong: Z1-13 => (16.8/4)*156 = 655.2 CFA vs sell 16 000.
--
-- DO $$
-- DECLARE
--   approved_cost boolean := false;  -- keep false; Part 2 not ready
-- BEGIN
--   IF NOT approved_cost THEN
--     RAISE EXCEPTION 'ELECTRO 2 Part 2 (cost) disabled. Client costs TBD.';
--   END IF;
--   -- future: UPDATE product_units cost_price_cfa from client-provided table
-- END $$;
