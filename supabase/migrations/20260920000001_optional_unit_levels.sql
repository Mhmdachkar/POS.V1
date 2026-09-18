-- Selling units are optional per level. A product may be piece-only, package-only,
-- carton-only, or any mix. The smallest enabled unit is the stock unit and must
-- convert as 1. Unchecked levels are removed on save.

CREATE OR REPLACE FUNCTION private.validate_product_units(p_units jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_unit jsonb;
  v_level integer;
  v_conv numeric;
  v_seen int[] := ARRAY[]::int[];
  v_min_level integer := NULL;
BEGIN
  IF p_units IS NULL OR jsonb_typeof(p_units) <> 'array' OR jsonb_array_length(p_units) < 1 THEN
    PERFORM private.raise_vhm_error('UNIT_LEVEL_REQUIRED',
      jsonb_build_object('reason', 'units_required'));
  END IF;

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    v_level := (v_unit->>'unit_level')::integer;
    v_conv  := (v_unit->>'conversion_to_base')::numeric;

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

    IF v_conv IS NULL OR v_conv <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_CONVERSION',
        jsonb_build_object('unit_level', v_level));
    END IF;

    IF coalesce((v_unit->>'cost_price_cfa')::numeric, -1) < 0
       OR coalesce((v_unit->>'selling_price_cfa')::numeric, -1) < 0 THEN
      PERFORM private.raise_vhm_error('INVALID_PRICE',
        jsonb_build_object('unit_level', v_level));
    END IF;
  END LOOP;

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    v_level := (v_unit->>'unit_level')::integer;
    v_conv  := (v_unit->>'conversion_to_base')::numeric;
    IF v_level = v_min_level AND v_conv <> 1 THEN
      PERFORM private.raise_vhm_error('INVALID_CONVERSION',
        jsonb_build_object('reason', 'smallest_unit_conversion_must_be_1', 'unit_level', v_level));
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.validate_product_units(jsonb) FROM PUBLIC;


CREATE OR REPLACE FUNCTION private.upsert_product_units(p_product_id uuid, p_units jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_unit jsonb;
  v_level smallint;
  v_keep smallint[] := ARRAY[]::smallint[];
BEGIN
  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    v_level := (v_unit->>'unit_level')::smallint;
    v_keep := array_append(v_keep, v_level);
    INSERT INTO public.product_units (
      product_id, unit_level, unit_name, conversion_to_base,
      cost_price_cfa, selling_price_cfa
    ) VALUES (
      p_product_id,
      v_level,
      trim(v_unit->>'unit_name'),
      (v_unit->>'conversion_to_base')::numeric,
      (v_unit->>'cost_price_cfa')::numeric,
      (v_unit->>'selling_price_cfa')::numeric
    )
    ON CONFLICT (product_id, unit_level) DO UPDATE
    SET unit_name          = EXCLUDED.unit_name,
        conversion_to_base = EXCLUDED.conversion_to_base,
        cost_price_cfa     = EXCLUDED.cost_price_cfa,
        selling_price_cfa  = EXCLUDED.selling_price_cfa;
  END LOOP;

  DELETE FROM public.product_units
  WHERE product_id = p_product_id
    AND NOT (unit_level = ANY (v_keep));
END;
$$;

REVOKE EXECUTE ON FUNCTION private.upsert_product_units(uuid, jsonb) FROM PUBLIC;
