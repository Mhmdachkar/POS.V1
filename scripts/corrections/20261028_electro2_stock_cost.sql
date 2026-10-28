-- NOT A MIGRATION. Outside supabase/migrations — `supabase db push` will not apply this.
-- ELECTRO 2 stock + cost correction (56 products from 2INV.xlsx).
--
-- Bug (scripts/import_2inv_main.py parse_electro2): used C7 as pcs_ctn, C8 as tqty,
-- C13 as L0 cost. Truth: C4=CTN, C5=PCS/CTN, C6=TQTY pieces; C7/C8 are not pieces;
-- C13 = 126xC7 (not a cost). L0 cost = (C11 / C5) x FX; L1 cost = L0 x C5.
--
-- FX = 156 CFA per foreign unit — CONFIRM before setting approved := true.
-- With FX=156, Excel value at cost Sum(C6xL0) approx 784807 CFA (not ~160 M).
-- If ~160 M was expected, FX or the C11 basis needs revisiting (C12x156 as L0 approx 198 M).
--
-- Stock target: GREATEST(0, C6 + Sum inventory_transactions.quantity_pieces
--   excluding RESTOCK) — Excel opening minus net sold/returned/transferred/adjusted.
-- Idempotent: skips products that already have audit action correct_electro2_stock_cost.
-- Refuses unless approved := true.

\set ON_ERROR_STOP on

-- Before (preview; safe)
WITH truth(serial, pcs_ctn, tqty, l0_cost, l1_cost) AS (
  VALUES
    ('Z1-1', 6, 18::numeric, 416.0::numeric, 2496.0::numeric),
    ('Z1-2', 10, 30::numeric, 218.4::numeric, 2184.0::numeric),
    ('Z1-3', 10, 170::numeric, 332.28::numeric, 3322.8::numeric),
    ('Z1-4', 6, 24::numeric, 468.0::numeric, 2808.0::numeric),
    ('Z1-8', 12, 24::numeric, 195.0::numeric, 2340.0::numeric),
    ('Z1-11', 12, 72::numeric, 212.42::numeric, 2549.04::numeric),
    ('Z1-12', 6, 60::numeric, 494.0::numeric, 2964.0::numeric),
    ('Z1-13', 4, 136::numeric, 655.2::numeric, 2620.8::numeric),
    ('Z1-131', 16, 64::numeric, 197.93::numeric, 3166.88::numeric),
    ('Z-132', 16, 0::numeric, 195.0::numeric, 3120.0::numeric),
    ('Z-133', 4, 40::numeric, 780.0::numeric, 3120.0::numeric),
    ('Z-134', 12, 24::numeric, 205.4::numeric, 2464.8::numeric),
    ('Z-135', 24, 72::numeric, 107.25::numeric, 2574.0::numeric),
    ('Z1-21', 2, 6::numeric, 943.8::numeric, 1887.6::numeric),
    ('Z1-24', 20, 80::numeric, 105.3::numeric, 2106.0::numeric),
    ('Z1-34', 20, 640::numeric, 63.18::numeric, 1263.6::numeric),
    ('Z1-35', 20, 480::numeric, 106.08::numeric, 2121.6::numeric),
    ('Z1-36', 10, 90::numeric, 184.08::numeric, 1840.8::numeric),
    ('Z1-38', 7, 14::numeric, 579.43::numeric, 4056.01::numeric),
    ('Z1-40', 60, 510::numeric, 83.72::numeric, 5023.2::numeric),
    ('Z1-41', 60, 570::numeric, 122.2::numeric, 7332.0::numeric),
    ('Z1-42', 48, 144::numeric, 91.0::numeric, 4368.0::numeric),
    ('Z1-43', 80, 80::numeric, 44.85::numeric, 3588.0::numeric),
    ('Z1-44', 70, 140::numeric, 53.49::numeric, 3744.3::numeric),
    ('Z1-45', 60, 150::numeric, 70.72::numeric, 4243.2::numeric),
    ('Z1-46', 60, 300::numeric, 72.8::numeric, 4368.0::numeric),
    ('Z1-47', 4, 12::numeric, 616.2::numeric, 2464.8::numeric),
    ('Z1-49', 6, 5::numeric, 507.0::numeric, 3042.0::numeric),
    ('Z1-50', 7, 6::numeric, 434.57::numeric, 3041.99::numeric),
    ('Z1-51', 6, 5::numeric, 507.0::numeric, 3042.0::numeric),
    ('Z1-52', 7, 6::numeric, 434.57::numeric, 3041.99::numeric),
    ('Z1-55', 27, 26::numeric, 130.0::numeric, 3510.0::numeric),
    ('Z1-56', 7, 6::numeric, 316.46::numeric, 2215.22::numeric),
    ('Z1-64', 6, 18::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-68', 80, 560::numeric, 48.75::numeric, 3900.0::numeric),
    ('Z1-69', 50, 300::numeric, 96.72::numeric, 4836.0::numeric),
    ('Z1-70', 60, 360::numeric, 57.2::numeric, 3432.0::numeric),
    ('Z1-71', 30, 150::numeric, 114.4::numeric, 3432.0::numeric),
    ('Z1-72', 60, 300::numeric, 57.2::numeric, 3432.0::numeric),
    ('Z1-73', 30, 90::numeric, 114.4::numeric, 3432.0::numeric),
    ('Z1-74', 20, 20::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-75', 10, 10::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-76', 20, 0::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-77', 10, 20::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-78', 20, 40::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-80', 20, 160::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-81', 10, 80::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-86', 100, 100::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-88', 100, 100::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-89', 60, 60::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-90', 24, 48::numeric, 153.4::numeric, 3681.6::numeric),
    ('Z1-91', 24, 72::numeric, 170.3::numeric, 4087.2::numeric),
    ('Z1-92', 24, 72::numeric, 187.2::numeric, 4492.8::numeric),
    ('Z1-93', 10, 10::numeric, 483.6::numeric, 4836.0::numeric),
    ('Z1-94', 10, 20::numeric, 249.6::numeric, 2496.0::numeric),
    ('Z1-96', 10, 70::numeric, 304.2::numeric, 3042.0::numeric)
),
targets AS (
  SELECT
    t.*,
    pu.product_id,
    p.depot_id,
    p.name AS product_name,
    p.current_stock_pieces AS stock_before,
    pu0.cost_price_cfa AS l0_before,
    pu1.cost_price_cfa AS l1_before,
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
  LEFT JOIN public.product_units pu0
    ON pu0.product_id = p.id AND pu0.unit_level = 0
  LEFT JOIN public.product_units pu1
    ON pu1.product_id = p.id AND pu1.unit_level = 1
)
SELECT
  serial, product_name, stock_before, stock_after,
  l0_before, l0_cost AS l0_after,
  l1_before, l1_cost AS l1_after,
  l1_rel_before, pcs_ctn AS l1_rel_after
FROM targets
ORDER BY serial;

-- Apply (gated)
DO $$
DECLARE
  approved boolean := false;  -- set true only after explicit approval
  r RECORD;
  v_stock_after numeric;
  v_before jsonb;
  v_after jsonb;
  v_done int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT approved THEN
    RAISE EXCEPTION
      'ELECTRO 2 correction not approved. Set approved := true after reviewing the before SELECT.';
  END IF;

  FOR r IN
    WITH truth(serial, pcs_ctn, tqty, l0_cost, l1_cost) AS (
      VALUES
    ('Z1-1', 6, 18::numeric, 416.0::numeric, 2496.0::numeric),
    ('Z1-2', 10, 30::numeric, 218.4::numeric, 2184.0::numeric),
    ('Z1-3', 10, 170::numeric, 332.28::numeric, 3322.8::numeric),
    ('Z1-4', 6, 24::numeric, 468.0::numeric, 2808.0::numeric),
    ('Z1-8', 12, 24::numeric, 195.0::numeric, 2340.0::numeric),
    ('Z1-11', 12, 72::numeric, 212.42::numeric, 2549.04::numeric),
    ('Z1-12', 6, 60::numeric, 494.0::numeric, 2964.0::numeric),
    ('Z1-13', 4, 136::numeric, 655.2::numeric, 2620.8::numeric),
    ('Z1-131', 16, 64::numeric, 197.93::numeric, 3166.88::numeric),
    ('Z-132', 16, 0::numeric, 195.0::numeric, 3120.0::numeric),
    ('Z-133', 4, 40::numeric, 780.0::numeric, 3120.0::numeric),
    ('Z-134', 12, 24::numeric, 205.4::numeric, 2464.8::numeric),
    ('Z-135', 24, 72::numeric, 107.25::numeric, 2574.0::numeric),
    ('Z1-21', 2, 6::numeric, 943.8::numeric, 1887.6::numeric),
    ('Z1-24', 20, 80::numeric, 105.3::numeric, 2106.0::numeric),
    ('Z1-34', 20, 640::numeric, 63.18::numeric, 1263.6::numeric),
    ('Z1-35', 20, 480::numeric, 106.08::numeric, 2121.6::numeric),
    ('Z1-36', 10, 90::numeric, 184.08::numeric, 1840.8::numeric),
    ('Z1-38', 7, 14::numeric, 579.43::numeric, 4056.01::numeric),
    ('Z1-40', 60, 510::numeric, 83.72::numeric, 5023.2::numeric),
    ('Z1-41', 60, 570::numeric, 122.2::numeric, 7332.0::numeric),
    ('Z1-42', 48, 144::numeric, 91.0::numeric, 4368.0::numeric),
    ('Z1-43', 80, 80::numeric, 44.85::numeric, 3588.0::numeric),
    ('Z1-44', 70, 140::numeric, 53.49::numeric, 3744.3::numeric),
    ('Z1-45', 60, 150::numeric, 70.72::numeric, 4243.2::numeric),
    ('Z1-46', 60, 300::numeric, 72.8::numeric, 4368.0::numeric),
    ('Z1-47', 4, 12::numeric, 616.2::numeric, 2464.8::numeric),
    ('Z1-49', 6, 5::numeric, 507.0::numeric, 3042.0::numeric),
    ('Z1-50', 7, 6::numeric, 434.57::numeric, 3041.99::numeric),
    ('Z1-51', 6, 5::numeric, 507.0::numeric, 3042.0::numeric),
    ('Z1-52', 7, 6::numeric, 434.57::numeric, 3041.99::numeric),
    ('Z1-55', 27, 26::numeric, 130.0::numeric, 3510.0::numeric),
    ('Z1-56', 7, 6::numeric, 316.46::numeric, 2215.22::numeric),
    ('Z1-64', 6, 18::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-68', 80, 560::numeric, 48.75::numeric, 3900.0::numeric),
    ('Z1-69', 50, 300::numeric, 96.72::numeric, 4836.0::numeric),
    ('Z1-70', 60, 360::numeric, 57.2::numeric, 3432.0::numeric),
    ('Z1-71', 30, 150::numeric, 114.4::numeric, 3432.0::numeric),
    ('Z1-72', 60, 300::numeric, 57.2::numeric, 3432.0::numeric),
    ('Z1-73', 30, 90::numeric, 114.4::numeric, 3432.0::numeric),
    ('Z1-74', 20, 20::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-75', 10, 10::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-76', 20, 0::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-77', 10, 20::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-78', 20, 40::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-80', 20, 160::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-81', 10, 80::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-86', 100, 100::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-88', 100, 100::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-89', 60, 60::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-90', 24, 48::numeric, 153.4::numeric, 3681.6::numeric),
    ('Z1-91', 24, 72::numeric, 170.3::numeric, 4087.2::numeric),
    ('Z1-92', 24, 72::numeric, 187.2::numeric, 4492.8::numeric),
    ('Z1-93', 10, 10::numeric, 483.6::numeric, 4836.0::numeric),
    ('Z1-94', 10, 20::numeric, 249.6::numeric, 2496.0::numeric),
    ('Z1-96', 10, 70::numeric, 304.2::numeric, 3042.0::numeric)
    )
    SELECT
      t.serial,
      t.pcs_ctn,
      t.tqty,
      t.l0_cost,
      t.l1_cost,
      pu.product_id,
      p.depot_id,
      p.current_stock_pieces AS stock_before,
      pu0.id AS l0_id,
      pu0.cost_price_cfa AS l0_before,
      pu0.conversion_to_base AS l0_conv_before,
      pu1.id AS l1_id,
      pu1.cost_price_cfa AS l1_before,
      pu1.relative_quantity AS l1_rel_before,
      pu1.conversion_to_base AS l1_conv_before
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
        AND a.action = 'correct_electro2_stock_cost'
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
      'l0_cost', r.l0_before,
      'l0_conversion', r.l0_conv_before,
      'l1_cost', r.l1_before,
      'l1_relative_quantity', r.l1_rel_before,
      'l1_conversion', r.l1_conv_before
    );

    UPDATE public.products
    SET current_stock_pieces = v_stock_after,
        updated_at = now()
    WHERE id = r.product_id;

    UPDATE public.product_units
    SET cost_price_cfa = r.l0_cost,
        conversion_to_base = 1,
        relative_quantity = NULL
    WHERE id = r.l0_id;

    IF r.l1_id IS NOT NULL THEN
      UPDATE public.product_units
      SET relative_quantity = r.pcs_ctn,
          conversion_to_base = r.pcs_ctn,
          cost_price_cfa = r.l1_cost
      WHERE id = r.l1_id;
    ELSIF r.pcs_ctn > 1 THEN
      INSERT INTO public.product_units (
        product_id, unit_level, unit_name, serial_number,
        relative_quantity, conversion_to_base,
        cost_price_cfa, selling_price_cfa
      ) VALUES (
        r.product_id, 1, 'Carton', r.serial || '-CTN',
        r.pcs_ctn, r.pcs_ctn,
        r.l1_cost,
        COALESCE(
          (SELECT selling_price_cfa * r.pcs_ctn FROM public.product_units WHERE id = r.l0_id),
          0
        )
      );
    END IF;

    v_after := jsonb_build_object(
      'serial', r.serial,
      'stock', v_stock_after,
      'l0_cost', r.l0_cost,
      'l0_conversion', 1,
      'l1_cost', r.l1_cost,
      'l1_relative_quantity', r.pcs_ctn,
      'l1_conversion', r.pcs_ctn,
      'fx_cfa', 156,
      'excel_tqty', r.tqty
    );

    INSERT INTO public.audit_log (
      actor_id, action, entity_type, entity_id, depot_id, before_value, after_value
    ) VALUES (
      NULL,
      'correct_electro2_stock_cost',
      'product',
      r.product_id,
      r.depot_id,
      v_before,
      v_after
    );

    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'ELECTRO 2 correction applied=% skipped_idempotent=%', v_done, v_skipped;
END $$;

-- After (verify)
WITH truth(serial, pcs_ctn, tqty, l0_cost, l1_cost) AS (
  VALUES
    ('Z1-1', 6, 18::numeric, 416.0::numeric, 2496.0::numeric),
    ('Z1-2', 10, 30::numeric, 218.4::numeric, 2184.0::numeric),
    ('Z1-3', 10, 170::numeric, 332.28::numeric, 3322.8::numeric),
    ('Z1-4', 6, 24::numeric, 468.0::numeric, 2808.0::numeric),
    ('Z1-8', 12, 24::numeric, 195.0::numeric, 2340.0::numeric),
    ('Z1-11', 12, 72::numeric, 212.42::numeric, 2549.04::numeric),
    ('Z1-12', 6, 60::numeric, 494.0::numeric, 2964.0::numeric),
    ('Z1-13', 4, 136::numeric, 655.2::numeric, 2620.8::numeric),
    ('Z1-131', 16, 64::numeric, 197.93::numeric, 3166.88::numeric),
    ('Z-132', 16, 0::numeric, 195.0::numeric, 3120.0::numeric),
    ('Z-133', 4, 40::numeric, 780.0::numeric, 3120.0::numeric),
    ('Z-134', 12, 24::numeric, 205.4::numeric, 2464.8::numeric),
    ('Z-135', 24, 72::numeric, 107.25::numeric, 2574.0::numeric),
    ('Z1-21', 2, 6::numeric, 943.8::numeric, 1887.6::numeric),
    ('Z1-24', 20, 80::numeric, 105.3::numeric, 2106.0::numeric),
    ('Z1-34', 20, 640::numeric, 63.18::numeric, 1263.6::numeric),
    ('Z1-35', 20, 480::numeric, 106.08::numeric, 2121.6::numeric),
    ('Z1-36', 10, 90::numeric, 184.08::numeric, 1840.8::numeric),
    ('Z1-38', 7, 14::numeric, 579.43::numeric, 4056.01::numeric),
    ('Z1-40', 60, 510::numeric, 83.72::numeric, 5023.2::numeric),
    ('Z1-41', 60, 570::numeric, 122.2::numeric, 7332.0::numeric),
    ('Z1-42', 48, 144::numeric, 91.0::numeric, 4368.0::numeric),
    ('Z1-43', 80, 80::numeric, 44.85::numeric, 3588.0::numeric),
    ('Z1-44', 70, 140::numeric, 53.49::numeric, 3744.3::numeric),
    ('Z1-45', 60, 150::numeric, 70.72::numeric, 4243.2::numeric),
    ('Z1-46', 60, 300::numeric, 72.8::numeric, 4368.0::numeric),
    ('Z1-47', 4, 12::numeric, 616.2::numeric, 2464.8::numeric),
    ('Z1-49', 6, 5::numeric, 507.0::numeric, 3042.0::numeric),
    ('Z1-50', 7, 6::numeric, 434.57::numeric, 3041.99::numeric),
    ('Z1-51', 6, 5::numeric, 507.0::numeric, 3042.0::numeric),
    ('Z1-52', 7, 6::numeric, 434.57::numeric, 3041.99::numeric),
    ('Z1-55', 27, 26::numeric, 130.0::numeric, 3510.0::numeric),
    ('Z1-56', 7, 6::numeric, 316.46::numeric, 2215.22::numeric),
    ('Z1-64', 6, 18::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-68', 80, 560::numeric, 48.75::numeric, 3900.0::numeric),
    ('Z1-69', 50, 300::numeric, 96.72::numeric, 4836.0::numeric),
    ('Z1-70', 60, 360::numeric, 57.2::numeric, 3432.0::numeric),
    ('Z1-71', 30, 150::numeric, 114.4::numeric, 3432.0::numeric),
    ('Z1-72', 60, 300::numeric, 57.2::numeric, 3432.0::numeric),
    ('Z1-73', 30, 90::numeric, 114.4::numeric, 3432.0::numeric),
    ('Z1-74', 20, 20::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-75', 10, 10::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-76', 20, 0::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-77', 10, 20::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-78', 20, 40::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-80', 20, 160::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-81', 10, 80::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-86', 100, 100::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-88', 100, 100::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-89', 60, 60::numeric, 0.0::numeric, 0.0::numeric),
    ('Z1-90', 24, 48::numeric, 153.4::numeric, 3681.6::numeric),
    ('Z1-91', 24, 72::numeric, 170.3::numeric, 4087.2::numeric),
    ('Z1-92', 24, 72::numeric, 187.2::numeric, 4492.8::numeric),
    ('Z1-93', 10, 10::numeric, 483.6::numeric, 4836.0::numeric),
    ('Z1-94', 10, 20::numeric, 249.6::numeric, 2496.0::numeric),
    ('Z1-96', 10, 70::numeric, 304.2::numeric, 3042.0::numeric)
),
targets AS (
  SELECT
    t.serial,
    p.name AS product_name,
    p.current_stock_pieces AS stock,
    pu0.cost_price_cfa AS l0_cost,
    pu1.cost_price_cfa AS l1_cost,
    pu1.relative_quantity AS l1_rel,
    pu1.conversion_to_base AS l1_conv,
    EXISTS (
      SELECT 1 FROM public.audit_log a
      WHERE a.entity_id = p.id AND a.action = 'correct_electro2_stock_cost'
    ) AS corrected
  FROM truth t
  JOIN public.product_units pu
    ON lower(pu.serial_number) = lower(t.serial) AND pu.unit_level = 0
  JOIN public.products p ON p.id = pu.product_id
  LEFT JOIN public.product_units pu0 ON pu0.product_id = p.id AND pu0.unit_level = 0
  LEFT JOIN public.product_units pu1 ON pu1.product_id = p.id AND pu1.unit_level = 1
)
SELECT * FROM targets ORDER BY serial;
