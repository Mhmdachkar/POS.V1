-- Product photos are uploaded from a device into a public Storage bucket.
-- The create/update product RPCs still store the resulting public URL in
-- products.photo_url. Local Supabase serves that URL over http://127.0.0.1,
-- so photo validation accepts those hosts while logos remain HTTPS-only.

CREATE OR REPLACE FUNCTION private.require_https_url(p_url text, p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF p_url IS NOT NULL AND p_url ~ '^https://' THEN
    RETURN;
  END IF;

  IF p_code = 'INVALID_PHOTO_URL'
     AND p_url IS NOT NULL
     AND p_url ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]+)?/' THEN
    RETURN;
  END IF;

  PERFORM private.raise_vhm_error(p_code, jsonb_build_object('url', p_url));
END;
$$;

REVOKE EXECUTE ON FUNCTION private.require_https_url(text, text) FROM PUBLIC;


INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-photos',
  'product-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


DROP POLICY IF EXISTS product_photos_public_read ON storage.objects;
CREATE POLICY product_photos_public_read
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-photos');

DROP POLICY IF EXISTS product_photos_admin_insert ON storage.objects;
CREATE POLICY product_photos_admin_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    AND public.is_current_staff_admin()
  );

DROP POLICY IF EXISTS product_photos_admin_update ON storage.objects;
CREATE POLICY product_photos_admin_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.is_current_staff_admin()
  )
  WITH CHECK (
    bucket_id = 'product-photos'
    AND public.is_current_staff_admin()
  );

DROP POLICY IF EXISTS product_photos_admin_delete ON storage.objects;
CREATE POLICY product_photos_admin_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.is_current_staff_admin()
  );
