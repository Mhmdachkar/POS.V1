-- ================================================================
-- CEO Notes — Fix ambiguous private.validate_product_units overload
-- ================================================================
--
-- Root cause (20261001000004):
--   validate_product_units(jsonb, uuid DEFAULT NULL)
--   + validate_product_units(jsonb) wrapper
--   made single-argument calls ambiguous in PostgreSQL.
--
-- Symptom:
--   create_product / update_product fail with
--   "function private.validate_product_units(jsonb) is not unique"
--
-- Fix: drop both, recreate 2-arg WITHOUT DEFAULT + unambiguous 1-arg wrapper.
-- Body matches 20261001000004 (logic unchanged).
-- ================================================================

DROP FUNCTION IF EXISTS private.validate_product_units(jsonb);
DROP FUNCTION IF EXISTS private.validate_product_units(jsonb, uuid);

CREATE FUNCTION private.validate_product_units(
  p_units      jsonb,
  p_product_id uuid
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

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    v_level   := (v_unit->>'unit_level')::integer;
    v_serial  := trim(coalesce(v_unit->>'serial_number', ''));
    v_rel_qty := (v_unit->>'relative_quantity')::numeric;

    IF v_level IS NULL OR v_level < 0 OR v_level > 2 THEN
      PERFORM private.raise_vhm_error('INVALID_UNIT',
        jsonb_build_object('unit_level', v_level));
    END IF;

    IF v_level = ANY (v_seen) THEN
      PERFORM private.raise_vhm_error('INVALID_UNIT',
        jsonb_build_object('reason', 'duplicate_unit_level', 'unit_level', v_level));
    END IF;
    v_seen := array_append(v_seen, v_level);

    IF v_min_level IS NULL OR v_level < v_min_level THEN
      v_min_level := v_level;
    END IF;

    IF trim(coalesce(v_unit->>'unit_name', '')) = '' THEN
      PERFORM private.raise_vhm_error('INVALID_INPUT',
        jsonb_build_object('reason', 'unit_name_required', 'unit_level', v_level));
    END IF;

    IF v_serial = '' THEN
      PERFORM private.raise_vhm_error('INVALID_INPUT',
        jsonb_build_object('reason', 'serial_number_required', 'unit_level', v_level));
    END IF;

    PERFORM 1
    FROM public.product_units
    WHERE lower(trim(serial_number)) = lower(v_serial)
      AND (p_product_id IS NULL OR product_id != p_product_id);

    IF FOUND THEN
      PERFORM private.raise_vhm_error('DUPLICATE_SERIAL',
        jsonb_build_object('reason', 'serial_already_exists', 'serial_number', v_serial, 'unit_level', v_level));
    END IF;

    IF coalesce((v_unit->>'cost_price_cfa')::numeric, -1) < 0
       OR coalesce((v_unit->>'selling_price_cfa')::numeric, -1) < 0 THEN
      PERFORM private.raise_vhm_error('INVALID_PRICE',
        jsonb_build_object('unit_level', v_level));
    END IF;

    IF v_level = 0 THEN
      IF v_rel_qty IS NOT NULL AND v_rel_qty <> 1 THEN
        PERFORM private.raise_vhm_error('INVALID_CONVERSION',
          jsonb_build_object('reason', 'level_0_relative_quantity_must_be_null_or_omitted', 'unit_level', 0));
      END IF;
    ELSE
      IF v_rel_qty IS NULL OR v_rel_qty <= 0 THEN
        PERFORM private.raise_vhm_error('INVALID_CONVERSION',
          jsonb_build_object('reason', 'relative_quantity_required_for_non_base_unit', 'unit_level', v_level));
      END IF;
    END IF;

    IF v_level = 1 THEN v_l1_rel_qty := v_rel_qty; END IF;
    IF v_level = 2 THEN v_l2_rel_qty := v_rel_qty; END IF;
  END LOOP;

  IF 2 = ANY(v_seen) AND NOT (1 = ANY(v_seen)) THEN
    PERFORM private.raise_vhm_error('INVALID_UNIT',
      jsonb_build_object('reason', 'carton_requires_package_level', 'unit_level', 2));
  END IF;
END;
$$;

CREATE FUNCTION private.validate_product_units(p_units jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  PERFORM private.validate_product_units(p_units, NULL::uuid);
END;
$$;

REVOKE EXECUTE ON FUNCTION private.validate_product_units(jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.validate_product_units(jsonb) FROM PUBLIC;

COMMENT ON FUNCTION private.validate_product_units(jsonb, uuid) IS
  'CEO Notes: validate units with serial uniqueness; p_product_id excludes self on update. No DEFAULT arg (avoids overload ambiguity).';
COMMENT ON FUNCTION private.validate_product_units(jsonb) IS
  'Wrapper for create_product: calls validate_product_units(p_units, NULL).';
