-- ================================================================
-- Per-product low-stock tracking (admin-controlled, opt-in)
-- ================================================================
-- Products remain depot-owned. Stock stays products.current_stock_pieces.
-- track_low_stock / low_stock_threshold live on the product row.
-- is_low_stock is a generated flag for queries — not a second stock counter.
-- No notification table. Dashboard derives the current state from products.
-- ================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_low_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(14,3);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_low_stock_settings_chk;

ALTER TABLE public.products
  ADD CONSTRAINT products_low_stock_settings_chk CHECK (
    (
      track_low_stock = false
      AND (low_stock_threshold IS NULL OR low_stock_threshold >= 0)
    )
    OR (
      track_low_stock = true
      AND low_stock_threshold IS NOT NULL
      AND low_stock_threshold >= 0
    )
  );

ALTER TABLE public.products
  DROP COLUMN IF EXISTS is_low_stock;

ALTER TABLE public.products
  ADD COLUMN is_low_stock boolean
  GENERATED ALWAYS AS (
    track_low_stock
    AND current_stock_pieces > 0
    AND low_stock_threshold IS NOT NULL
    AND current_stock_pieces <= low_stock_threshold
  ) STORED;

COMMENT ON COLUMN public.products.track_low_stock IS
  'Admin opt-in. When false, the product never appears in low-stock warnings.';

COMMENT ON COLUMN public.products.low_stock_threshold IS
  'Required when track_low_stock is true. Compared to current_stock_pieces. Not a second stock counter.';

COMMENT ON COLUMN public.products.is_low_stock IS
  'Generated: tracked AND 0 < current_stock_pieces <= low_stock_threshold. Query convenience only.';

CREATE INDEX IF NOT EXISTS products_low_stock_alert_idx
  ON public.products (depot_id, name)
  WHERE is_active AND is_low_stock;

CREATE INDEX IF NOT EXISTS products_tracked_out_of_stock_idx
  ON public.products (depot_id, name)
  WHERE is_active AND track_low_stock AND current_stock_pieces = 0;


CREATE OR REPLACE FUNCTION private.assert_low_stock_settings(
  p_track_low_stock     boolean,
  p_low_stock_threshold numeric
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF coalesce(p_track_low_stock, false) THEN
    IF p_low_stock_threshold IS NULL THEN
      PERFORM private.raise_vhm_error(
        'INVALID_INPUT',
        jsonb_build_object('reason', 'low_stock_threshold_required', 'field', 'low_stock_threshold')
      );
    ELSIF p_low_stock_threshold < 0 THEN
      PERFORM private.raise_vhm_error(
        'INVALID_INPUT',
        jsonb_build_object('reason', 'low_stock_threshold_invalid', 'field', 'low_stock_threshold')
      );
    END IF;
  ELSIF p_low_stock_threshold IS NOT NULL AND p_low_stock_threshold < 0 THEN
    PERFORM private.raise_vhm_error(
      'INVALID_INPUT',
      jsonb_build_object('reason', 'low_stock_threshold_invalid', 'field', 'low_stock_threshold')
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.assert_low_stock_settings(boolean, numeric) FROM PUBLIC;


DROP FUNCTION IF EXISTS public.create_product(uuid, uuid, text, text, jsonb);

CREATE FUNCTION public.create_product(
  p_depot_id             uuid,
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
  v_ctx      private.caller_ctx;
  v_depot    public.depots%ROWTYPE;
  v_cat      public.categories%ROWTYPE;
  v_product  public.products%ROWTYPE;
  v_name     text;
  v_track    boolean;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  IF p_depot_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('reason', 'depot_id_required'));
  END IF;

  v_name := trim(coalesce(p_name, ''));
  IF v_name = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'name_required', 'field', 'name'));
  END IF;

  v_track := coalesce(p_track_low_stock, false);
  PERFORM private.assert_low_stock_settings(v_track, p_low_stock_threshold);

  PERFORM private.require_https_url(p_photo_url, 'INVALID_PHOTO_URL');
  PERFORM private.validate_product_units(p_units);

  SELECT * INTO v_depot FROM public.depots WHERE id = p_depot_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;
  IF NOT v_depot.is_active THEN
    PERFORM private.raise_vhm_error('DEPOT_INACTIVE',
      jsonb_build_object('depot_id', p_depot_id));
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

  INSERT INTO public.products (
    depot_id, category_id, name, photo_url, current_stock_pieces, is_active,
    track_low_stock, low_stock_threshold
  ) VALUES (
    p_depot_id, p_category_id, v_name, p_photo_url, 0, true,
    v_track, p_low_stock_threshold
  )
  RETURNING * INTO v_product;

  PERFORM private.upsert_product_units(v_product.id, p_units);

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'create_product',
    p_entity_type := 'product',
    p_entity_id   := v_product.id,
    p_depot_id    := v_product.depot_id,
    p_before_val  := NULL,
    p_after_val   := private.product_with_units_json(v_product)
  );

  RETURN private.product_with_units_json(v_product);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_product(uuid, uuid, text, text, jsonb, boolean, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_product(uuid, uuid, text, text, jsonb, boolean, numeric) TO authenticated;


DROP FUNCTION IF EXISTS public.update_product(uuid, uuid, text, text, jsonb);

CREATE FUNCTION public.update_product(
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
  PERFORM private.validate_product_units(p_units);

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
