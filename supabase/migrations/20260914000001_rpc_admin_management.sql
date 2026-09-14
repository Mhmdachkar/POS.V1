-- ================================================================
-- VHM POS — Migration: Phase 11 Admin / Management RPCs
-- ================================================================
-- SECURITY DEFINER RPCs for staff, depots, categories, products,
-- business settings, and the admin dashboard snapshot.
--
-- Staff Auth create/ban/unban stays in Edge Functions. Those
-- functions call the staff RPCs below with the caller JWT.
--
-- prevent_staff_privilege_escalation is keyed on current_user so
-- JWT clients still cannot UPDATE auth-critical staff fields, while
-- these SECURITY DEFINER RPCs (owner role) can.
-- ================================================================

CREATE OR REPLACE FUNCTION public.prevent_staff_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Direct JWT/PostgREST writes run as 'authenticated' / 'anon'.
  -- SECURITY DEFINER RPCs run as the function owner and are allowed.
  IF current_user IN ('authenticated', 'anon') THEN
    IF (NEW.id        IS DISTINCT FROM OLD.id)
    OR (NEW.role      IS DISTINCT FROM OLD.role)
    OR (NEW.depot_id  IS DISTINCT FROM OLD.depot_id)
    OR (NEW.is_active IS DISTINCT FROM OLD.is_active)
    OR (NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at)
    OR (NEW.username  IS DISTINCT FROM OLD.username)
    THEN
      RAISE EXCEPTION
        'Modification of staff authorization fields is forbidden from client connections. '
        'Use the admin staff RPCs. (staff_id: %)', NEW.id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_staff_privilege_escalation() IS
  'Blocks authenticated/anon clients from modifying auth-critical staff fields. SECURITY DEFINER RPCs (owner role) are exempt.';


-- ================================================================
-- Private helpers
-- ================================================================

CREATE OR REPLACE FUNCTION private.lock_active_admins()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  PERFORM s.id
  FROM public.staff s
  WHERE s.role = 'admin'
    AND s.is_active = true
  ORDER BY s.id
  FOR UPDATE;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.lock_active_admins() FROM PUBLIC;

COMMENT ON FUNCTION private.lock_active_admins() IS
  'Locks every active admin row in id order. Required before any write that can change active-admin status.';


CREATE OR REPLACE FUNCTION private.raise_admin_unique_violation(p_sqlerrm text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF p_sqlerrm ILIKE '%one_active_cashier%'
     OR p_sqlerrm ILIKE '%one_active_depot_staff%' THEN
    PERFORM private.raise_vhm_error('STAFF_ROLE_SLOT_TAKEN',
      jsonb_build_object('sqlerrm', p_sqlerrm));
  ELSIF p_sqlerrm ILIKE '%staff_username%' THEN
    PERFORM private.raise_vhm_error('USERNAME_TAKEN',
      jsonb_build_object('sqlerrm', p_sqlerrm));
  ELSIF p_sqlerrm ILIKE '%depots_code%' THEN
    PERFORM private.raise_vhm_error('DEPOT_CODE_CONFLICT',
      jsonb_build_object('sqlerrm', p_sqlerrm));
  ELSIF p_sqlerrm ILIKE '%categories_unique%' THEN
    PERFORM private.raise_vhm_error('CATEGORY_NAME_CONFLICT',
      jsonb_build_object('sqlerrm', p_sqlerrm));
  ELSE
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'unique_violation', 'sqlerrm', p_sqlerrm));
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.raise_admin_unique_violation(text) FROM PUBLIC;


CREATE OR REPLACE FUNCTION private.validate_role_depot(p_role text, p_depot_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_depot public.depots%ROWTYPE;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('admin', 'cashier', 'depot_staff') THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'invalid_role', 'role', p_role));
  END IF;

  IF p_role = 'admin' THEN
    IF p_depot_id IS NOT NULL THEN
      PERFORM private.raise_vhm_error('INVALID_DEPOT',
        jsonb_build_object('reason', 'admin_must_not_have_depot'));
    END IF;
    RETURN;
  END IF;

  IF p_depot_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('reason', 'depot_required_for_role', 'role', p_role));
  END IF;

  SELECT * INTO v_depot FROM public.depots WHERE id = p_depot_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('reason', 'depot_not_found', 'depot_id', p_depot_id));
  END IF;
  IF NOT v_depot.is_active THEN
    PERFORM private.raise_vhm_error('DEPOT_INACTIVE',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.validate_role_depot(text, uuid) FROM PUBLIC;


CREATE OR REPLACE FUNCTION private.require_https_url(p_url text, p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF p_url IS NULL OR p_url !~ '^https://' THEN
    PERFORM private.raise_vhm_error(p_code, jsonb_build_object('url', p_url));
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.require_https_url(text, text) FROM PUBLIC;


CREATE OR REPLACE FUNCTION private.staff_to_jsonb(p_staff public.staff)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, private
AS $$
  SELECT jsonb_build_object(
    'id',             p_staff.id,
    'username',       p_staff.username,
    'full_name',      p_staff.full_name,
    'role',           p_staff.role,
    'depot_id',       p_staff.depot_id,
    'is_active',      p_staff.is_active,
    'deactivated_at', p_staff.deactivated_at,
    'created_at',     p_staff.created_at
  );
$$;

REVOKE EXECUTE ON FUNCTION private.staff_to_jsonb(public.staff) FROM PUBLIC;


CREATE OR REPLACE FUNCTION private.assert_not_last_active_admin(p_staff_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_others integer;
BEGIN
  SELECT COUNT(*) INTO v_others
  FROM public.staff
  WHERE role = 'admin'
    AND is_active = true
    AND id IS DISTINCT FROM p_staff_id;

  IF COALESCE(v_others, 0) = 0 THEN
    PERFORM private.raise_vhm_error('LAST_ADMIN_REQUIRED',
      jsonb_build_object('staff_id', p_staff_id));
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.assert_not_last_active_admin(uuid) FROM PUBLIC;


-- ================================================================
-- Staff RPCs
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_insert_staff(
  p_staff_id  uuid,
  p_username  text,
  p_full_name text,
  p_role      text,
  p_depot_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx    private.caller_ctx;
  v_staff  public.staff%ROWTYPE;
  v_uname  text;
  v_name   text;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  IF p_staff_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_id_required', 'field', 'staff_id'));
  END IF;

  v_uname := lower(trim(coalesce(p_username, '')));
  IF v_uname = '' OR v_uname !~ '^[a-z0-9._-]+$' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'invalid_username', 'field', 'username'));
  END IF;

  v_name := trim(coalesce(p_full_name, ''));
  IF char_length(v_name) < 2 THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'full_name_required', 'field', 'full_name'));
  END IF;

  PERFORM private.validate_role_depot(p_role, p_depot_id);

  IF p_role = 'admin' THEN
    PERFORM private.lock_active_admins();
  END IF;

  INSERT INTO public.staff (
    id, username, full_name, role, depot_id, is_active, deactivated_at
  ) VALUES (
    p_staff_id, v_uname, v_name, p_role, p_depot_id, true, NULL
  )
  RETURNING * INTO v_staff;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'create_staff',
    p_entity_type := 'staff',
    p_entity_id   := v_staff.id,
    p_depot_id    := v_staff.depot_id,
    p_before_val  := NULL,
    p_after_val   := private.staff_to_jsonb(v_staff)
  );

  RETURN private.staff_to_jsonb(v_staff);

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN RAISE;
  WHEN unique_violation THEN
    PERFORM private.raise_admin_unique_violation(SQLERRM);
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_insert_staff(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_insert_staff(uuid, text, text, text, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_update_staff_row(
  p_staff_id  uuid,
  p_full_name text,
  p_role      text,
  p_depot_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx     private.caller_ctx;
  v_before  public.staff%ROWTYPE;
  v_after   public.staff%ROWTYPE;
  v_name    text;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  IF p_staff_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_id_required'));
  END IF;

  SELECT * INTO v_before FROM public.staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_not_found', 'staff_id', p_staff_id));
  END IF;

  v_name := trim(coalesce(p_full_name, ''));
  IF char_length(v_name) < 2 THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'full_name_required', 'field', 'full_name'));
  END IF;

  PERFORM private.validate_role_depot(p_role, p_depot_id);

  IF v_before.role = 'admin' OR p_role = 'admin' THEN
    PERFORM private.lock_active_admins();
  END IF;

  IF v_before.role = 'admin'
     AND v_before.is_active = true
     AND p_role IS DISTINCT FROM 'admin' THEN
    PERFORM private.assert_not_last_active_admin(p_staff_id);
  END IF;

  UPDATE public.staff
  SET full_name = v_name,
      role      = p_role,
      depot_id  = p_depot_id
  WHERE id = p_staff_id
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'update_staff',
    p_entity_type := 'staff',
    p_entity_id   := v_after.id,
    p_depot_id    := v_after.depot_id,
    p_before_val  := private.staff_to_jsonb(v_before),
    p_after_val   := private.staff_to_jsonb(v_after)
  );

  RETURN private.staff_to_jsonb(v_after);

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN RAISE;
  WHEN unique_violation THEN
    PERFORM private.raise_admin_unique_violation(SQLERRM);
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_staff_row(uuid, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_staff_row(uuid, text, text, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_deactivate_staff_row(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx     private.caller_ctx;
  v_before  public.staff%ROWTYPE;
  v_after   public.staff%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  IF p_staff_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_id_required'));
  END IF;

  IF p_staff_id = v_ctx.staff_id THEN
    PERFORM private.raise_vhm_error('CANNOT_DEACTIVATE_SELF',
      jsonb_build_object('staff_id', p_staff_id));
  END IF;

  SELECT * INTO v_before FROM public.staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_not_found', 'staff_id', p_staff_id));
  END IF;

  IF v_before.is_active = false THEN
    RETURN private.staff_to_jsonb(v_before) || jsonb_build_object('already_inactive', true);
  END IF;

  IF v_before.role = 'admin' THEN
    PERFORM private.lock_active_admins();
    PERFORM private.assert_not_last_active_admin(p_staff_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.shifts
    WHERE cashier_id = p_staff_id
      AND status = 'open'
  ) THEN
    PERFORM private.raise_vhm_error('STAFF_HAS_OPEN_SHIFT',
      jsonb_build_object('staff_id', p_staff_id));
  END IF;

  UPDATE public.staff
  SET is_active = false,
      deactivated_at = now()
  WHERE id = p_staff_id
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'deactivate_staff',
    p_entity_type := 'staff',
    p_entity_id   := v_after.id,
    p_depot_id    := v_after.depot_id,
    p_before_val  := private.staff_to_jsonb(v_before),
    p_after_val   := private.staff_to_jsonb(v_after)
  );

  RETURN private.staff_to_jsonb(v_after) || jsonb_build_object('already_inactive', false);

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_deactivate_staff_row(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_deactivate_staff_row(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_reactivate_staff_row(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx     private.caller_ctx;
  v_before  public.staff%ROWTYPE;
  v_after   public.staff%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  IF p_staff_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_id_required'));
  END IF;

  SELECT * INTO v_before FROM public.staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_not_found', 'staff_id', p_staff_id));
  END IF;

  IF v_before.is_active = true THEN
    RETURN private.staff_to_jsonb(v_before) || jsonb_build_object('already_active', true);
  END IF;

  PERFORM private.validate_role_depot(v_before.role, v_before.depot_id);

  IF v_before.role = 'admin' THEN
    PERFORM private.lock_active_admins();
  END IF;

  UPDATE public.staff
  SET is_active = true,
      deactivated_at = NULL
  WHERE id = p_staff_id
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'reactivate_staff',
    p_entity_type := 'staff',
    p_entity_id   := v_after.id,
    p_depot_id    := v_after.depot_id,
    p_before_val  := private.staff_to_jsonb(v_before),
    p_after_val   := private.staff_to_jsonb(v_after)
  );

  RETURN private.staff_to_jsonb(v_after) || jsonb_build_object('already_active', false);

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN RAISE;
  WHEN unique_violation THEN
    PERFORM private.raise_admin_unique_violation(SQLERRM);
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reactivate_staff_row(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_reactivate_staff_row(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_get_staff_row(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_staff public.staff%ROWTYPE;
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);

  IF p_staff_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_id_required'));
  END IF;

  SELECT * INTO v_staff FROM public.staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_not_found', 'staff_id', p_staff_id));
  END IF;

  RETURN private.staff_to_jsonb(v_staff);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_staff_row(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_get_staff_row(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_audit_staff_auth_reconcile(
  p_staff_id uuid,
  p_details  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx   private.caller_ctx;
  v_staff public.staff%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  IF p_staff_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_id_required'));
  END IF;

  SELECT * INTO v_staff FROM public.staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_not_found', 'staff_id', p_staff_id));
  END IF;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'staff_auth_reconcile',
    p_entity_type := 'staff',
    p_entity_id   := v_staff.id,
    p_depot_id    := v_staff.depot_id,
    p_before_val  := NULL,
    p_after_val   := jsonb_build_object(
      'is_active', v_staff.is_active,
      'details',   coalesce(p_details, '{}'::jsonb)
    )
  );

  RETURN private.staff_to_jsonb(v_staff);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_audit_staff_auth_reconcile(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_audit_staff_auth_reconcile(uuid, jsonb) TO authenticated;


-- ================================================================
-- Depot RPCs
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_depot(
  p_name     text,
  p_location text,
  p_code     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx   private.caller_ctx;
  v_depot public.depots%ROWTYPE;
  v_name  text;
  v_loc   text;
  v_code  text;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  v_name := trim(coalesce(p_name, ''));
  v_loc  := trim(coalesce(p_location, ''));
  v_code := upper(trim(coalesce(p_code, '')));

  IF v_name = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'name_required', 'field', 'name'));
  END IF;
  IF v_loc = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'location_required', 'field', 'location'));
  END IF;
  IF v_code = '' OR v_code !~ '^[A-Z0-9]{2,12}$' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'invalid_depot_code', 'field', 'code'));
  END IF;

  INSERT INTO public.depots (name, location, code, is_active, receipt_seq)
  VALUES (v_name, v_loc, v_code, true, 1)
  RETURNING * INTO v_depot;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'create_depot',
    p_entity_type := 'depot',
    p_entity_id   := v_depot.id,
    p_depot_id    := v_depot.id,
    p_before_val  := NULL,
    p_after_val   := to_jsonb(v_depot)
  );

  RETURN to_jsonb(v_depot);

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN RAISE;
  WHEN unique_violation THEN
    PERFORM private.raise_admin_unique_violation(SQLERRM);
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_depot(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_depot(text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_depot(
  p_depot_id uuid,
  p_name     text,
  p_location text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx    private.caller_ctx;
  v_before public.depots%ROWTYPE;
  v_after  public.depots%ROWTYPE;
  v_name   text;
  v_loc    text;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  v_name := trim(coalesce(p_name, ''));
  v_loc  := trim(coalesce(p_location, ''));
  IF v_name = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'name_required', 'field', 'name'));
  END IF;
  IF v_loc = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'location_required', 'field', 'location'));
  END IF;

  SELECT * INTO v_before FROM public.depots WHERE id = p_depot_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;

  UPDATE public.depots
  SET name = v_name,
      location = v_loc
  WHERE id = p_depot_id
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'update_depot',
    p_entity_type := 'depot',
    p_entity_id   := v_after.id,
    p_depot_id    := v_after.id,
    p_before_val  := jsonb_build_object('name', v_before.name, 'location', v_before.location),
    p_after_val   := jsonb_build_object('name', v_after.name, 'location', v_after.location)
  );

  RETURN to_jsonb(v_after);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_depot(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_depot(uuid, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.deactivate_depot(p_depot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx    private.caller_ctx;
  v_before public.depots%ROWTYPE;
  v_after  public.depots%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  SELECT * INTO v_before FROM public.depots WHERE id = p_depot_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;

  IF v_before.is_active = false THEN
    RETURN to_jsonb(v_before) || jsonb_build_object('already_inactive', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.staff
    WHERE depot_id = p_depot_id AND is_active = true
  ) THEN
    PERFORM private.raise_vhm_error('DEPOT_HAS_ACTIVE_STAFF',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.shifts
    WHERE depot_id = p_depot_id AND status = 'open'
  ) THEN
    PERFORM private.raise_vhm_error('DEPOT_HAS_OPEN_SHIFTS',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_transfers
    WHERE status = 'pending'
      AND (from_depot_id = p_depot_id OR to_depot_id = p_depot_id)
  ) THEN
    PERFORM private.raise_vhm_error('DEPOT_HAS_PENDING_TRANSFERS',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;

  UPDATE public.depots
  SET is_active = false
  WHERE id = p_depot_id
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'deactivate_depot',
    p_entity_type := 'depot',
    p_entity_id   := v_after.id,
    p_depot_id    := v_after.id,
    p_before_val  := jsonb_build_object('is_active', true),
    p_after_val   := jsonb_build_object('is_active', false)
  );

  RETURN to_jsonb(v_after) || jsonb_build_object('already_inactive', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_depot(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.deactivate_depot(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.reactivate_depot(p_depot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx    private.caller_ctx;
  v_before public.depots%ROWTYPE;
  v_after  public.depots%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  SELECT * INTO v_before FROM public.depots WHERE id = p_depot_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;

  IF v_before.is_active = true THEN
    RETURN to_jsonb(v_before) || jsonb_build_object('already_active', true);
  END IF;

  UPDATE public.depots
  SET is_active = true
  WHERE id = p_depot_id
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'reactivate_depot',
    p_entity_type := 'depot',
    p_entity_id   := v_after.id,
    p_depot_id    := v_after.id,
    p_before_val  := jsonb_build_object('is_active', false),
    p_after_val   := jsonb_build_object('is_active', true)
  );

  RETURN to_jsonb(v_after) || jsonb_build_object('already_active', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reactivate_depot(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reactivate_depot(uuid) TO authenticated;


-- ================================================================
-- Category RPCs
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_category(
  p_name      text,
  p_parent_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx      private.caller_ctx;
  v_cat      public.categories%ROWTYPE;
  v_parent   public.categories%ROWTYPE;
  v_name     text;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  v_name := trim(coalesce(p_name, ''));
  IF v_name = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'name_required', 'field', 'name'));
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.categories WHERE id = p_parent_id;
    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('INVALID_INPUT',
        jsonb_build_object('reason', 'parent_not_found', 'parent_id', p_parent_id));
    END IF;
    IF v_parent.is_active = false THEN
      PERFORM private.raise_vhm_error('CATEGORY_INACTIVE',
        jsonb_build_object('parent_id', p_parent_id));
    END IF;
  END IF;

  INSERT INTO public.categories (name, parent_id, is_active)
  VALUES (v_name, p_parent_id, true)
  RETURNING * INTO v_cat;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'create_category',
    p_entity_type := 'category',
    p_entity_id   := v_cat.id,
    p_depot_id    := NULL,
    p_before_val  := NULL,
    p_after_val   := to_jsonb(v_cat)
  );

  RETURN to_jsonb(v_cat);

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN RAISE;
  WHEN unique_violation THEN
    PERFORM private.raise_admin_unique_violation(SQLERRM);
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_category(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_category(text, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_category(
  p_category_id uuid,
  p_name        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx    private.caller_ctx;
  v_before public.categories%ROWTYPE;
  v_after  public.categories%ROWTYPE;
  v_name   text;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  v_name := trim(coalesce(p_name, ''));
  IF v_name = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'name_required', 'field', 'name'));
  END IF;

  SELECT * INTO v_before FROM public.categories WHERE id = p_category_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'category_not_found', 'category_id', p_category_id));
  END IF;

  UPDATE public.categories
  SET name = v_name
  WHERE id = p_category_id
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'update_category',
    p_entity_type := 'category',
    p_entity_id   := v_after.id,
    p_depot_id    := NULL,
    p_before_val  := jsonb_build_object('name', v_before.name),
    p_after_val   := jsonb_build_object('name', v_after.name)
  );

  RETURN to_jsonb(v_after);

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN RAISE;
  WHEN unique_violation THEN
    PERFORM private.raise_admin_unique_violation(SQLERRM);
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_category(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_category(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.deactivate_category(p_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx    private.caller_ctx;
  v_before public.categories%ROWTYPE;
  v_after  public.categories%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  SELECT * INTO v_before FROM public.categories WHERE id = p_category_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'category_not_found', 'category_id', p_category_id));
  END IF;

  IF v_before.is_active = false THEN
    RETURN to_jsonb(v_before) || jsonb_build_object('already_inactive', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.categories
    WHERE parent_id = p_category_id AND is_active = true
  ) THEN
    PERFORM private.raise_vhm_error('CATEGORY_HAS_ACTIVE_CHILDREN',
      jsonb_build_object('category_id', p_category_id));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.products
    WHERE category_id = p_category_id AND is_active = true
  ) THEN
    PERFORM private.raise_vhm_error('CATEGORY_HAS_ACTIVE_PRODUCTS',
      jsonb_build_object('category_id', p_category_id));
  END IF;

  UPDATE public.categories
  SET is_active = false
  WHERE id = p_category_id
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'deactivate_category',
    p_entity_type := 'category',
    p_entity_id   := v_after.id,
    p_depot_id    := NULL,
    p_before_val  := jsonb_build_object('is_active', true),
    p_after_val   := jsonb_build_object('is_active', false)
  );

  RETURN to_jsonb(v_after) || jsonb_build_object('already_inactive', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_category(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.deactivate_category(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.reactivate_category(p_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx    private.caller_ctx;
  v_before public.categories%ROWTYPE;
  v_after  public.categories%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  SELECT * INTO v_before FROM public.categories WHERE id = p_category_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'category_not_found', 'category_id', p_category_id));
  END IF;

  IF v_before.is_active = true THEN
    RETURN to_jsonb(v_before) || jsonb_build_object('already_active', true);
  END IF;

  IF v_before.parent_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.categories
       WHERE id = v_before.parent_id AND is_active = false
     ) THEN
    PERFORM private.raise_vhm_error('CATEGORY_INACTIVE',
      jsonb_build_object('reason', 'parent_inactive', 'parent_id', v_before.parent_id));
  END IF;

  UPDATE public.categories
  SET is_active = true
  WHERE id = p_category_id
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'reactivate_category',
    p_entity_type := 'category',
    p_entity_id   := v_after.id,
    p_depot_id    := NULL,
    p_before_val  := jsonb_build_object('is_active', false),
    p_after_val   := jsonb_build_object('is_active', true)
  );

  RETURN to_jsonb(v_after) || jsonb_build_object('already_active', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reactivate_category(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reactivate_category(uuid) TO authenticated;


-- ================================================================
-- Product / unit RPCs
-- ================================================================

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
  v_has0 boolean := false;
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

    IF trim(coalesce(v_unit->>'unit_name', '')) = '' THEN
      PERFORM private.raise_vhm_error('INVALID_INPUT',
        jsonb_build_object('reason', 'unit_name_required', 'unit_level', v_level));
    END IF;

    IF v_conv IS NULL OR v_conv <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_CONVERSION',
        jsonb_build_object('unit_level', v_level));
    END IF;

    IF v_level = 0 THEN
      v_has0 := true;
      IF v_conv <> 1 THEN
        PERFORM private.raise_vhm_error('INVALID_CONVERSION',
          jsonb_build_object('reason', 'base_conversion_must_be_1'));
      END IF;
    END IF;

    IF coalesce((v_unit->>'cost_price_cfa')::numeric, -1) < 0
       OR coalesce((v_unit->>'selling_price_cfa')::numeric, -1) < 0 THEN
      PERFORM private.raise_vhm_error('INVALID_PRICE',
        jsonb_build_object('unit_level', v_level));
    END IF;
  END LOOP;

  IF NOT v_has0 THEN
    PERFORM private.raise_vhm_error('UNIT_LEVEL_REQUIRED',
      jsonb_build_object('reason', 'base_unit_required'));
  END IF;
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
BEGIN
  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    v_level := (v_unit->>'unit_level')::smallint;
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
END;
$$;

REVOKE EXECUTE ON FUNCTION private.upsert_product_units(uuid, jsonb) FROM PUBLIC;


CREATE OR REPLACE FUNCTION private.product_with_units_json(p_product public.products)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_units jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.unit_level), '[]'::jsonb)
  INTO v_units
  FROM public.product_units u
  WHERE u.product_id = p_product.id;

  RETURN to_jsonb(p_product) || jsonb_build_object('units', v_units);
END;
$$;

REVOKE EXECUTE ON FUNCTION private.product_with_units_json(public.products) FROM PUBLIC;


CREATE OR REPLACE FUNCTION public.create_product(
  p_depot_id    uuid,
  p_category_id uuid,
  p_name        text,
  p_photo_url   text,
  p_units       jsonb
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
    depot_id, category_id, name, photo_url, current_stock_pieces, is_active
  ) VALUES (
    p_depot_id, p_category_id, v_name, p_photo_url, 0, true
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

REVOKE EXECUTE ON FUNCTION public.create_product(uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_product(uuid, uuid, text, text, jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_product(
  p_product_id  uuid,
  p_category_id uuid,
  p_name        text,
  p_photo_url   text,
  p_units       jsonb
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
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  v_name := trim(coalesce(p_name, ''));
  IF v_name = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'name_required', 'field', 'name'));
  END IF;

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
  SET category_id = p_category_id,
      name        = v_name,
      photo_url   = p_photo_url
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

REVOKE EXECUTE ON FUNCTION public.update_product(uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_product(uuid, uuid, text, text, jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.deactivate_product(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx    private.caller_ctx;
  v_before public.products%ROWTYPE;
  v_after  public.products%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  SELECT * INTO v_before FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('PRODUCT_NOT_FOUND',
      jsonb_build_object('product_id', p_product_id));
  END IF;

  IF v_before.is_active = false THEN
    RETURN to_jsonb(v_before) || jsonb_build_object('already_inactive', true);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_transfer_items sti
    JOIN public.stock_transfers st ON st.id = sti.transfer_id
    WHERE st.status = 'pending'
      AND (sti.from_product_id = p_product_id OR sti.to_product_id = p_product_id)
  ) THEN
    PERFORM private.raise_vhm_error('PRODUCT_IN_PENDING_TRANSFER',
      jsonb_build_object('product_id', p_product_id));
  END IF;

  UPDATE public.products
  SET is_active = false
  WHERE id = p_product_id
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'deactivate_product',
    p_entity_type := 'product',
    p_entity_id   := v_after.id,
    p_depot_id    := v_after.depot_id,
    p_before_val  := jsonb_build_object('is_active', true),
    p_after_val   := jsonb_build_object('is_active', false)
  );

  RETURN to_jsonb(v_after) || jsonb_build_object('already_inactive', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_product(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.deactivate_product(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.reactivate_product(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx    private.caller_ctx;
  v_before public.products%ROWTYPE;
  v_after  public.products%ROWTYPE;
  v_depot  public.depots%ROWTYPE;
  v_cat    public.categories%ROWTYPE;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  SELECT * INTO v_before FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('PRODUCT_NOT_FOUND',
      jsonb_build_object('product_id', p_product_id));
  END IF;

  IF v_before.is_active = true THEN
    RETURN to_jsonb(v_before) || jsonb_build_object('already_active', true);
  END IF;

  SELECT * INTO v_depot FROM public.depots WHERE id = v_before.depot_id;
  IF NOT FOUND OR NOT v_depot.is_active THEN
    PERFORM private.raise_vhm_error('DEPOT_INACTIVE',
      jsonb_build_object('depot_id', v_before.depot_id));
  END IF;

  SELECT * INTO v_cat FROM public.categories WHERE id = v_before.category_id;
  IF NOT FOUND OR NOT v_cat.is_active THEN
    PERFORM private.raise_vhm_error('CATEGORY_INACTIVE',
      jsonb_build_object('category_id', v_before.category_id));
  END IF;

  UPDATE public.products
  SET is_active = true
  WHERE id = p_product_id
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'reactivate_product',
    p_entity_type := 'product',
    p_entity_id   := v_after.id,
    p_depot_id    := v_after.depot_id,
    p_before_val  := jsonb_build_object('is_active', false),
    p_after_val   := jsonb_build_object('is_active', true)
  );

  RETURN to_jsonb(v_after) || jsonb_build_object('already_active', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reactivate_product(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reactivate_product(uuid) TO authenticated;


-- ================================================================
-- Settings + dashboard
-- ================================================================

CREATE OR REPLACE FUNCTION public.update_business_settings(
  p_business_name    text,
  p_logo_url         text,
  p_cfa_to_usd_rate  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx    private.caller_ctx;
  v_before public.business_settings%ROWTYPE;
  v_after  public.business_settings%ROWTYPE;
  v_name   text;
  v_logo   text;
  v_rate   numeric;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);

  v_name := trim(coalesce(p_business_name, ''));
  IF v_name = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'business_name_required', 'field', 'business_name'));
  END IF;

  v_logo := nullif(trim(coalesce(p_logo_url, '')), '');
  IF v_logo IS NOT NULL THEN
    PERFORM private.require_https_url(v_logo, 'INVALID_LOGO_URL');
  END IF;

  v_rate := p_cfa_to_usd_rate;
  IF v_rate IS NULL OR v_rate <= 0 THEN
    PERFORM private.raise_vhm_error('INVALID_EXCHANGE_RATE',
      jsonb_build_object('rate', v_rate));
  END IF;

  SELECT * INTO v_before FROM public.business_settings WHERE id = true FOR UPDATE;

  UPDATE public.business_settings
  SET business_name   = v_name,
      logo_url        = v_logo,
      cfa_to_usd_rate = v_rate,
      rate_updated_at = CASE
        WHEN v_rate IS DISTINCT FROM v_before.cfa_to_usd_rate THEN now()
        ELSE v_before.rate_updated_at
      END,
      rate_updated_by = CASE
        WHEN v_rate IS DISTINCT FROM v_before.cfa_to_usd_rate THEN v_ctx.staff_id
        ELSE v_before.rate_updated_by
      END
  WHERE id = true
  RETURNING * INTO v_after;

  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'update_business_settings',
    p_entity_type := 'business_settings',
    p_entity_id   := NULL,
    p_depot_id    := NULL,
    p_before_val  := to_jsonb(v_before),
    p_after_val   := to_jsonb(v_after)
  );

  RETURN to_jsonb(v_after);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_business_settings(text, text, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_business_settings(text, text, numeric) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_dashboard_summary(p_depot_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_sales_cfa numeric := 0;
  v_gp        numeric := 0;
  v_txn       integer := 0;
  v_avg       numeric := 0;
  v_top       jsonb   := '[]'::jsonb;
  v_hourly    jsonb   := '[]'::jsonb;
  v_low       jsonb   := '[]'::jsonb;
  v_balances  integer := 0;
  v_shifts    jsonb   := '[]'::jsonb;
  v_rate      jsonb;
BEGIN
  PERFORM private.get_caller_ctx(ARRAY['admin']);

  IF p_depot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.depots WHERE id = p_depot_id
  ) THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', p_depot_id));
  END IF;

  WITH today_sales AS (
    SELECT s.id, s.created_at, s.depot_id
    FROM public.sales s
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
  ),
  item_net AS (
    SELECT
      si.id,
      si.product_id,
      ts.created_at,
      si.quantity_in_unit,
      si.quantity_pieces,
      si.cost_price_cfa,
      si.net_line_total_cfa,
      COALESCE(SUM(sri.quantity_in_unit), 0)  AS returned_units,
      COALESCE(SUM(sri.quantity_pieces), 0)   AS returned_pieces,
      COALESCE(SUM(sri.refund_amount_cfa), 0) AS returned_refund
    FROM today_sales ts
    JOIN public.sale_items si ON si.sale_id = ts.id
    LEFT JOIN public.sale_return_items sri ON sri.sale_item_id = si.id
    GROUP BY si.id, si.product_id, ts.created_at, si.quantity_in_unit,
             si.quantity_pieces, si.cost_price_cfa, si.net_line_total_cfa
  ),
  remaining AS (
    SELECT
      product_id,
      created_at,
      quantity_pieces - returned_pieces AS net_pieces,
      net_line_total_cfa - returned_refund AS remaining_net,
      (net_line_total_cfa - returned_refund)
        - (cost_price_cfa * (quantity_in_unit - returned_units)) AS remaining_gp
    FROM item_net
  )
  SELECT
    COALESCE(SUM(remaining_net), 0),
    COALESCE(SUM(remaining_gp), 0)
  INTO v_sales_cfa, v_gp
  FROM remaining;

  SELECT COUNT(*) INTO v_txn
  FROM public.sales s
  WHERE s.status <> 'voided'
    AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
        = (now() AT TIME ZONE 'Africa/Abidjan')::date
    AND (p_depot_id IS NULL OR s.depot_id = p_depot_id);

  IF v_txn > 0 THEN
    v_avg := ROUND(v_sales_cfa / v_txn, 2);
  END IF;

  WITH today_sales AS (
    SELECT s.id
    FROM public.sales s
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
  ),
  item_net AS (
    SELECT
      si.product_id,
      si.quantity_pieces - COALESCE(SUM(sri.quantity_pieces), 0) AS net_pieces
    FROM today_sales ts
    JOIN public.sale_items si ON si.sale_id = ts.id
    LEFT JOIN public.sale_return_items sri ON sri.sale_item_id = si.id
    GROUP BY si.id, si.product_id, si.quantity_pieces
  ),
  net AS (
    SELECT product_id, SUM(net_pieces) AS net_pieces
    FROM item_net
    GROUP BY product_id
    HAVING SUM(net_pieces) > 0
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', n.product_id,
      'name', p.name,
      'net_pieces', n.net_pieces
    ) ORDER BY n.net_pieces DESC
  ), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT * FROM net ORDER BY net_pieces DESC LIMIT 8
  ) n
  JOIN public.products p ON p.id = n.product_id;

  -- Hourly remaining sales (today, Africa/Abidjan)
  WITH today_sales AS (
    SELECT s.id, s.created_at
    FROM public.sales s
    WHERE s.status <> 'voided'
      AND (s.created_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR s.depot_id = p_depot_id)
  ),
  item_net AS (
    SELECT
      EXTRACT(HOUR FROM (ts.created_at AT TIME ZONE 'Africa/Abidjan'))::int AS hour,
      si.net_line_total_cfa - COALESCE(SUM(sri.refund_amount_cfa), 0) AS remaining_net
    FROM today_sales ts
    JOIN public.sale_items si ON si.sale_id = ts.id
    LEFT JOIN public.sale_return_items sri ON sri.sale_item_id = si.id
    GROUP BY ts.created_at, si.id, si.net_line_total_cfa
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('hour', h.hour, 'sales_cfa', h.sales_cfa) ORDER BY h.hour
  ), '[]'::jsonb)
  INTO v_hourly
  FROM (
    SELECT hour, SUM(remaining_net) AS sales_cfa
    FROM item_net
    GROUP BY hour
  ) h;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', p.id,
      'name', p.name,
      'depot_id', p.depot_id,
      'current_stock_pieces', p.current_stock_pieces
    ) ORDER BY p.current_stock_pieces, p.name
  ), '[]'::jsonb)
  INTO v_low
  FROM (
    SELECT id, name, depot_id, current_stock_pieces
    FROM public.products
    WHERE is_active = true
      AND current_stock_pieces <= 10
      AND (p_depot_id IS NULL OR depot_id = p_depot_id)
    ORDER BY current_stock_pieces, name
    LIMIT 20
  ) p;

  SELECT COUNT(*) INTO v_balances
  FROM public.customers
  WHERE balance_owed_cfa > 0;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'shift_id', s.id,
      'depot_id', s.depot_id,
      'discrepancy_cfa', s.discrepancy_cfa,
      'closed_at', s.closed_at
    ) ORDER BY s.closed_at DESC
  ), '[]'::jsonb)
  INTO v_shifts
  FROM (
    SELECT id, depot_id, discrepancy_cfa, closed_at
    FROM public.shifts
    WHERE status = 'closed'
      AND discrepancy_cfa <> 0
      AND (closed_at AT TIME ZONE 'Africa/Abidjan')::date
          = (now() AT TIME ZONE 'Africa/Abidjan')::date
      AND (p_depot_id IS NULL OR depot_id = p_depot_id)
    ORDER BY closed_at DESC
    LIMIT 20
  ) s;

  SELECT jsonb_build_object(
    'cfa_to_usd_rate', bs.cfa_to_usd_rate,
    'rate_updated_at', bs.rate_updated_at
  )
  INTO v_rate
  FROM public.business_settings bs
  WHERE bs.id = true;

  RETURN jsonb_build_object(
    'sales_cfa', v_sales_cfa,
    'gross_profit_cfa', v_gp,
    'txn_count', v_txn,
    'avg_sale_cfa', v_avg,
    'top_products', coalesce(v_top, '[]'::jsonb),
    'hourly_sales', coalesce(v_hourly, '[]'::jsonb),
    'action_required', jsonb_build_object(
      'low_stock', coalesce(v_low, '[]'::jsonb),
      'outstanding_balances_count', v_balances,
      'shift_discrepancies', coalesce(v_shifts, '[]'::jsonb),
      'exchange_rate', v_rate
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_summary(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_dashboard_summary(uuid) TO authenticated;
