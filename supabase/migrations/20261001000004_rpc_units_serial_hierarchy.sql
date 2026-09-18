-- ================================================================
-- CEO Notes Phase — RPC: Unit Validation & Upsert (Serial + Hierarchy)
-- ================================================================
--
-- CHANGES to private.validate_product_units:
--   - Each unit JSON now accepts: serial_number, relative_quantity
--   - Removes: client-supplied conversion_to_base (server derives it)
--   - L0 conversion is enforced server-side as exactly 1
--   - L1 relative_quantity = pieces per package (must be > 0)
--   - L2 relative_quantity = packages per carton (must be > 0)
--   - serial_number required, validated for non-empty
--   - Serial uniqueness checked across all product_units (case-insensitive)
--     with the current product excluded from its own check during updates
--
-- CHANGES to private.upsert_product_units:
--   - Accepts serial_number and relative_quantity per unit
--   - Derives and writes conversion_to_base from relative_quantity hierarchy
--   - Client must NOT supply conversion_to_base (it is ignored/overridden)
--   - L0: conversion_to_base = 1
--   - L1: conversion_to_base = relative_quantity (pieces/package)
--   - L2: conversion_to_base = L1.relative_quantity × L2.relative_quantity
--         i.e. pieces/package × packages/carton = pieces/carton
--
-- BACKWARD COMPATIBILITY:
--   Historical product_units rows with conversion_to_base are unchanged.
--   This only affects NEW writes through the RPC.
-- ================================================================

-- ─── validate_product_units ─────────────────────────────────────

CREATE OR REPLACE FUNCTION private.validate_product_units(
  p_units      jsonb,
  p_product_id uuid DEFAULT NULL   -- used to exclude self in serial uniqueness check
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_unit       jsonb;
  v_level      integer;
  v_serial     text;
  v_rel_qty    numeric;
  v_seen       int[] := ARRAY[]::int[];
  v_min_level  integer := NULL;
  v_l1_rel_qty numeric := NULL;
  v_l2_rel_qty numeric := NULL;
BEGIN
  IF p_units IS NULL OR jsonb_typeof(p_units) <> 'array' OR jsonb_array_length(p_units) < 1 THEN
    PERFORM private.raise_vhm_error('UNIT_LEVEL_REQUIRED',
      jsonb_build_object('reason', 'units_required'));
  END IF;

  -- First pass: validate structure, serials, and collect levels
  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    v_level   := (v_unit->>'unit_level')::integer;
    v_serial  := trim(coalesce(v_unit->>'serial_number', ''));
    v_rel_qty := (v_unit->>'relative_quantity')::numeric;

    -- Level range
    IF v_level IS NULL OR v_level < 0 OR v_level > 2 THEN
      PERFORM private.raise_vhm_error('INVALID_UNIT',
        jsonb_build_object('unit_level', v_level));
    END IF;

    -- No duplicate levels
    IF v_level = ANY (v_seen) THEN
      PERFORM private.raise_vhm_error('INVALID_UNIT',
        jsonb_build_object('reason', 'duplicate_unit_level', 'unit_level', v_level));
    END IF;
    v_seen := array_append(v_seen, v_level);

    -- Track min level for base-unit check
    IF v_min_level IS NULL OR v_level < v_min_level THEN
      v_min_level := v_level;
    END IF;

    -- unit_name required
    IF trim(coalesce(v_unit->>'unit_name', '')) = '' THEN
      PERFORM private.raise_vhm_error('INVALID_INPUT',
        jsonb_build_object('reason', 'unit_name_required', 'unit_level', v_level));
    END IF;

    -- serial_number required
    IF v_serial = '' THEN
      PERFORM private.raise_vhm_error('INVALID_INPUT',
        jsonb_build_object('reason', 'serial_number_required', 'unit_level', v_level));
    END IF;

    -- Serial uniqueness (case-insensitive, excluding own product_id if updating)
    PERFORM 1
    FROM public.product_units
    WHERE lower(trim(serial_number)) = lower(v_serial)
      AND (p_product_id IS NULL OR product_id != p_product_id);

    IF FOUND THEN
      PERFORM private.raise_vhm_error('DUPLICATE_SERIAL',
        jsonb_build_object('reason', 'serial_already_exists', 'serial_number', v_serial, 'unit_level', v_level));
    END IF;

    -- Prices
    IF coalesce((v_unit->>'cost_price_cfa')::numeric, -1) < 0
       OR coalesce((v_unit->>'selling_price_cfa')::numeric, -1) < 0 THEN
      PERFORM private.raise_vhm_error('INVALID_PRICE',
        jsonb_build_object('unit_level', v_level));
    END IF;

    -- relative_quantity validation
    IF v_level = 0 THEN
      -- L0: relative_quantity must be NULL or absent (base unit)
      IF v_rel_qty IS NOT NULL AND v_rel_qty <> 1 THEN
        PERFORM private.raise_vhm_error('INVALID_CONVERSION',
          jsonb_build_object('reason', 'level_0_relative_quantity_must_be_null_or_omitted', 'unit_level', 0));
      END IF;
    ELSE
      -- L1, L2: relative_quantity required and > 0
      IF v_rel_qty IS NULL OR v_rel_qty <= 0 THEN
        PERFORM private.raise_vhm_error('INVALID_CONVERSION',
          jsonb_build_object('reason', 'relative_quantity_required_for_non_base_unit', 'unit_level', v_level));
      END IF;
    END IF;

    -- Collect L1/L2 relative quantities for cross-level validation
    IF v_level = 1 THEN v_l1_rel_qty := v_rel_qty; END IF;
    IF v_level = 2 THEN v_l2_rel_qty := v_rel_qty; END IF;
  END LOOP;

  -- Validate that L2 does not exist without L1 (carton without package is nonsensical)
  IF 2 = ANY(v_seen) AND NOT (1 = ANY(v_seen)) THEN
    PERFORM private.raise_vhm_error('INVALID_UNIT',
      jsonb_build_object('reason', 'carton_requires_package_level', 'unit_level', 2));
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.validate_product_units(jsonb, uuid) FROM PUBLIC;

COMMENT ON FUNCTION private.validate_product_units(jsonb, uuid) IS
  'Validates unit array for create/update. Enforces serial uniqueness (case-insensitive), relative_quantity required for L1/L2, L0 conversion fixed.';

-- ─── Backward-compat 1-arg wrapper ──────────────────────────────
-- Old callers (create_product) still use the 1-arg version.
-- For CREATE: product_id=NULL means no self-exclusion — correct
-- because the new product has no existing units yet.
-- For UPDATE: callers must call the 2-arg version explicitly.

CREATE OR REPLACE FUNCTION private.validate_product_units(p_units jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  PERFORM private.validate_product_units(p_units, NULL::uuid);
END;
$$;

REVOKE EXECUTE ON FUNCTION private.validate_product_units(jsonb) FROM PUBLIC;


-- ─── upsert_product_units ────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.upsert_product_units(
  p_product_id uuid,
  p_units      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_unit       jsonb;
  v_level      smallint;
  v_keep       smallint[] := ARRAY[]::smallint[];
  v_rel_qty    numeric;
  v_conv       numeric;
  v_l1_conv    numeric := NULL;  -- pieces/package (L1 conversion_to_base)
BEGIN
  -- First pass: compute L1 conversion so L2 can reference it
  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    v_level   := (v_unit->>'unit_level')::smallint;
    v_rel_qty := (v_unit->>'relative_quantity')::numeric;
    IF v_level = 1 THEN
      v_l1_conv := v_rel_qty;  -- L1: pieces per package
    END IF;
  END LOOP;

  -- Second pass: upsert with server-derived conversion_to_base
  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    v_level   := (v_unit->>'unit_level')::smallint;
    v_rel_qty := (v_unit->>'relative_quantity')::numeric;
    v_keep    := array_append(v_keep, v_level);

    -- Derive conversion_to_base from hierarchy
    v_conv := CASE v_level
      WHEN 0 THEN 1  -- base unit: always 1
      WHEN 1 THEN v_rel_qty  -- pieces per package
      WHEN 2 THEN
        -- pieces per carton = packages per carton × pieces per package
        COALESCE(v_l1_conv, 1) * v_rel_qty
      ELSE v_rel_qty
    END;

    INSERT INTO public.product_units (
      product_id, unit_level, unit_name, serial_number,
      conversion_to_base, relative_quantity,
      cost_price_cfa, selling_price_cfa
    ) VALUES (
      p_product_id,
      v_level,
      trim(v_unit->>'unit_name'),
      trim(v_unit->>'serial_number'),
      v_conv,
      CASE v_level WHEN 0 THEN NULL ELSE v_rel_qty END,
      (v_unit->>'cost_price_cfa')::numeric,
      (v_unit->>'selling_price_cfa')::numeric
    )
    ON CONFLICT (product_id, unit_level) DO UPDATE
    SET unit_name          = EXCLUDED.unit_name,
        serial_number      = EXCLUDED.serial_number,
        conversion_to_base = EXCLUDED.conversion_to_base,
        relative_quantity  = EXCLUDED.relative_quantity,
        cost_price_cfa     = EXCLUDED.cost_price_cfa,
        selling_price_cfa  = EXCLUDED.selling_price_cfa,
        updated_at         = now();
  END LOOP;

  -- Remove unit levels that were not submitted (admin removed that level)
  DELETE FROM public.product_units
  WHERE product_id = p_product_id
    AND NOT (unit_level = ANY (v_keep));
END;
$$;

REVOKE EXECUTE ON FUNCTION private.upsert_product_units(uuid, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION private.upsert_product_units(uuid, jsonb) IS
  'Upserts product units. Derives conversion_to_base from relative_quantity hierarchy (L0=1, L1=rel, L2=L1*rel). Writes serial_number. Client must NOT supply conversion_to_base.';
