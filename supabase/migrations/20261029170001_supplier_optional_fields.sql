-- Phase 2: optional supplier fields, list search/sort, create/update audit.
-- Nullable columns only. Does not change balances, BR rows, or payments.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS payment_term_days integer;

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_payment_term_days_check;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_payment_term_days_check
  CHECK (payment_term_days IS NULL OR payment_term_days >= 0);

DROP FUNCTION IF EXISTS public.create_supplier(text, text, text);
CREATE OR REPLACE FUNCTION public.create_supplier(
  p_name text,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_term_days int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_id uuid;
  v_days int;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'name_required'));
  END IF;
  IF p_payment_term_days IS NOT NULL AND p_payment_term_days < 0 THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'payment_term_days_negative'));
  END IF;
  v_days := p_payment_term_days;

  INSERT INTO public.suppliers (
    name, phone, address, email, notes, payment_term_days, created_by
  ) VALUES (
    btrim(p_name),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_days,
    v_ctx.staff_id
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'create_supplier',
    p_entity_type := 'supplier',
    p_entity_id   := v_id,
    p_depot_id    := v_ctx.depot_id,
    p_before_val  := null,
    p_after_val   := jsonb_build_object(
      'name', btrim(p_name),
      'phone', nullif(btrim(coalesce(p_phone, '')), ''),
      'email', nullif(btrim(coalesce(p_email, '')), ''),
      'payment_term_days', v_days
    )
  );

  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.create_supplier(text, text, text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_supplier(text, text, text, text, text, int) TO authenticated;

DROP FUNCTION IF EXISTS public.update_supplier(uuid, text, text, text, boolean);
CREATE OR REPLACE FUNCTION public.update_supplier(
  p_supplier_id uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_term_days int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_before public.suppliers%ROWTYPE;
  v_after public.suppliers%ROWTYPE;
  v_profile boolean;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  SELECT * INTO v_before FROM public.suppliers WHERE id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('NOT_FOUND', jsonb_build_object('supplier_id', p_supplier_id));
  END IF;
  IF p_payment_term_days IS NOT NULL AND p_payment_term_days < 0 THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT', jsonb_build_object('reason', 'payment_term_days_negative'));
  END IF;

  -- Profile save always sends p_name; toggle-active sends only p_is_active.
  v_profile := p_name IS NOT NULL;

  UPDATE public.suppliers SET
    name = CASE WHEN v_profile THEN coalesce(nullif(btrim(p_name), ''), name) ELSE name END,
    phone = CASE WHEN p_phone IS NULL THEN phone ELSE nullif(btrim(p_phone), '') END,
    address = CASE WHEN p_address IS NULL THEN address ELSE nullif(btrim(p_address), '') END,
    email = CASE WHEN v_profile THEN nullif(btrim(coalesce(p_email, '')), '') ELSE email END,
    notes = CASE WHEN v_profile THEN nullif(btrim(coalesce(p_notes, '')), '') ELSE notes END,
    payment_term_days = CASE WHEN v_profile THEN p_payment_term_days ELSE payment_term_days END,
    is_active = coalesce(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_supplier_id;

  SELECT * INTO v_after FROM public.suppliers WHERE id = p_supplier_id;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'update_supplier',
    p_entity_type := 'supplier',
    p_entity_id   := p_supplier_id,
    p_depot_id    := v_ctx.depot_id,
    p_before_val  := jsonb_build_object(
      'name', v_before.name,
      'phone', v_before.phone,
      'address', v_before.address,
      'email', v_before.email,
      'notes', v_before.notes,
      'payment_term_days', v_before.payment_term_days,
      'is_active', v_before.is_active
    ),
    p_after_val   := jsonb_build_object(
      'name', v_after.name,
      'phone', v_after.phone,
      'address', v_after.address,
      'email', v_after.email,
      'notes', v_after.notes,
      'payment_term_days', v_after.payment_term_days,
      'is_active', v_after.is_active
    )
  );

  RETURN jsonb_build_object('id', p_supplier_id, 'ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.update_supplier(uuid, text, text, text, boolean, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_supplier(uuid, text, text, text, boolean, text, text, int) TO authenticated;

DROP FUNCTION IF EXISTS public.list_suppliers(boolean, int, int);
CREATE OR REPLACE FUNCTION public.list_suppliers(
  p_active_only boolean DEFAULT true,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL,
  p_sort_by text DEFAULT 'name',
  p_sort_dir text DEFAULT 'asc'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_rows jsonb;
  v_count int;
  v_q text;
  v_sort text;
  v_dir text;
BEGIN
  v_ctx := private.get_caller_ctx(array['admin']);
  v_q := nullif(btrim(coalesce(p_search, '')), '');
  v_sort := CASE WHEN p_sort_by = 'balance_owed_cfa' THEN 'balance_owed_cfa' ELSE 'name' END;
  v_dir := CASE WHEN lower(coalesce(p_sort_dir, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;

  SELECT count(*) INTO v_count
  FROM public.suppliers s
  WHERE (NOT p_active_only OR s.is_active)
    AND (
      v_q IS NULL
      OR s.name ILIKE '%' || v_q || '%'
      OR coalesce(s.phone, '') ILIKE '%' || v_q || '%'
    );

  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT * FROM public.suppliers s
    WHERE (NOT p_active_only OR s.is_active)
      AND (
        v_q IS NULL
        OR s.name ILIKE '%' || v_q || '%'
        OR coalesce(s.phone, '') ILIKE '%' || v_q || '%'
      )
    ORDER BY
      CASE WHEN v_sort = 'name' AND v_dir = 'asc' THEN lower(s.name) END ASC,
      CASE WHEN v_sort = 'name' AND v_dir = 'desc' THEN lower(s.name) END DESC,
      CASE WHEN v_sort = 'balance_owed_cfa' AND v_dir = 'asc' THEN s.balance_owed_cfa END ASC,
      CASE WHEN v_sort = 'balance_owed_cfa' AND v_dir = 'desc' THEN s.balance_owed_cfa END DESC,
      lower(s.name) ASC
    LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) x;

  RETURN jsonb_build_object('rows', v_rows, 'count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.list_suppliers(boolean, int, int, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_suppliers(boolean, int, int, text, text, text) TO authenticated;
