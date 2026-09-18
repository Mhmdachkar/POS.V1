-- ================================================================
-- CEO Notes Phase — RPC: update_product serial-aware validation
-- ================================================================
--
-- CHANGE: update_product now calls validate_product_units(p_units, p_product_id)
-- so that the serial uniqueness check correctly excludes the product's
-- own existing units (otherwise keeping the same serial would fail).
--
-- All other logic is identical to 20260918000001_product_low_stock.sql.
-- ================================================================

CREATE OR REPLACE FUNCTION public.update_product(
  p_product_id           uuid,
  p_category_id          uuid,
  p_name                 text,
  p_photo_url            text,
  p_units                jsonb,
  p_track_low_stock      boolean DEFAULT false,
  p_low_stock_threshold  numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx     private.caller_ctx;
  v_before  public.products%ROWTYPE;
  v_after   public.products%ROWTYPE;
  v_cat     public.categories%ROWTYPE;
  v_name    text;
  v_track   boolean;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  v_name := trim(coalesce(p_name, ''));
  IF v_name = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'name_required', 'field', 'name'));
  END IF;

  v_track := coalesce(p_track_low_stock, false);
  PERFORM private.assert_low_stock_settings(v_track, p_low_stock_threshold);

  PERFORM private.require_https_url(p_photo_url, 'INVALID_PHOTO_URL');

  -- ── Serial-aware validation: exclude this product's own units ──
  PERFORM private.validate_product_units(p_units, p_product_id);

  SELECT * INTO v_before FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('PRODUCT_NOT_FOUND',
      jsonb_build_object('product_id', p_product_id));
  END IF;

  SELECT * INTO v_cat FROM public.categories WHERE id = p_category_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'category_not_found', 'category_id', p_category_id));
  END IF;
  IF NOT v_cat.is_active THEN
    PERFORM private.raise_vhm_error('CATEGORY_INACTIVE',
      jsonb_build_object('category_id', p_category_id));
  END IF;

  UPDATE public.products
  SET category_id          = p_category_id,
      name                 = v_name,
      photo_url            = p_photo_url,
      track_low_stock      = v_track,
      low_stock_threshold  = p_low_stock_threshold
  WHERE id = p_product_id
  RETURNING * INTO v_after;

  PERFORM private.upsert_product_units(v_after.id, p_units);

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'update_product',
    p_entity_type := 'product',
    p_entity_id   := v_after.id,
    p_depot_id    := v_after.depot_id,
    p_before_val  := to_jsonb(v_before),
    p_after_val   := private.product_with_units_json(v_after)
  );

  RETURN private.product_with_units_json(v_after);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_product(uuid, uuid, text, text, jsonb, boolean, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_product(uuid, uuid, text, text, jsonb, boolean, numeric) TO authenticated;

COMMENT ON FUNCTION public.update_product(uuid, uuid, text, text, jsonb, boolean, numeric) IS
  'CEO Notes: validates serial_number uniqueness excluding the product own existing units.';
