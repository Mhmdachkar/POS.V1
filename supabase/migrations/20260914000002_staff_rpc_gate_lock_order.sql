-- ================================================================
-- Phase 11 follow-up: staff RPC edge gate + last-admin lock order
-- ================================================================
-- Authenticated JWT clients may only mutate staff through Edge
-- Functions. Those functions read a private gate token with the
-- service role (read-only) and pass it as p_staff_rpc_gate while
-- still invoking the SECURITY DEFINER RPCs with the caller JWT so
-- private.get_caller_ctx(['admin']) sees auth.uid().
--
-- Direct PostgREST calls from the browser cannot supply the token.
-- ================================================================

CREATE TABLE IF NOT EXISTS private.staff_rpc_gate (
  id    boolean PRIMARY KEY DEFAULT true CHECK (id),
  token text NOT NULL
);

INSERT INTO private.staff_rpc_gate (id, token)
VALUES (true, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE private.staff_rpc_gate FROM PUBLIC;
REVOKE ALL ON TABLE private.staff_rpc_gate FROM anon;
REVOKE ALL ON TABLE private.staff_rpc_gate FROM authenticated;


CREATE OR REPLACE FUNCTION private.require_staff_rpc_gate(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    PERFORM private.raise_vhm_error('UNAUTHORIZED',
      jsonb_build_object('reason', 'staff_rpc_gate_required'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM private.staff_rpc_gate g
    WHERE g.token = p_token
  ) THEN
    PERFORM private.raise_vhm_error('UNAUTHORIZED',
      jsonb_build_object('reason', 'staff_rpc_gate_invalid'));
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.require_staff_rpc_gate(text) FROM PUBLIC;


CREATE OR REPLACE FUNCTION public.admin_read_staff_rpc_gate()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT g.token FROM private.staff_rpc_gate g WHERE g.id = true;
$$;

REVOKE ALL ON FUNCTION public.admin_read_staff_rpc_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_read_staff_rpc_gate() FROM anon;
REVOKE ALL ON FUNCTION public.admin_read_staff_rpc_gate() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_read_staff_rpc_gate() TO service_role;


DROP FUNCTION IF EXISTS public.admin_insert_staff(uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.admin_update_staff_row(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.admin_deactivate_staff_row(uuid);
DROP FUNCTION IF EXISTS public.admin_reactivate_staff_row(uuid);
DROP FUNCTION IF EXISTS public.admin_audit_staff_auth_reconcile(uuid, jsonb);


CREATE OR REPLACE FUNCTION public.admin_insert_staff(
  p_staff_id        uuid,
  p_username        text,
  p_full_name       text,
  p_role            text,
  p_depot_id        uuid,
  p_staff_rpc_gate  text
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
  PERFORM private.require_staff_rpc_gate(p_staff_rpc_gate);

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

REVOKE EXECUTE ON FUNCTION public.admin_insert_staff(uuid, text, text, text, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_insert_staff(uuid, text, text, text, uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_update_staff_row(
  p_staff_id        uuid,
  p_full_name       text,
  p_role            text,
  p_depot_id        uuid,
  p_staff_rpc_gate  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx        private.caller_ctx;
  v_before     public.staff%ROWTYPE;
  v_after      public.staff%ROWTYPE;
  v_name       text;
  v_peek_role  text;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);
  PERFORM private.require_staff_rpc_gate(p_staff_rpc_gate);

  IF p_staff_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_id_required'));
  END IF;

  v_name := trim(coalesce(p_full_name, ''));
  IF char_length(v_name) < 2 THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'full_name_required', 'field', 'full_name'));
  END IF;

  PERFORM private.validate_role_depot(p_role, p_depot_id);

  IF p_role = 'admin' THEN
    PERFORM private.lock_active_admins();
  ELSE
    SELECT s.role INTO v_peek_role
    FROM public.staff s
    WHERE s.id = p_staff_id;
    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('INVALID_INPUT',
        jsonb_build_object('reason', 'staff_not_found', 'staff_id', p_staff_id));
    END IF;
    IF v_peek_role = 'admin' THEN
      PERFORM private.lock_active_admins();
    END IF;
  END IF;

  SELECT * INTO v_before FROM public.staff WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_not_found', 'staff_id', p_staff_id));
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

REVOKE EXECUTE ON FUNCTION public.admin_update_staff_row(uuid, text, text, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_staff_row(uuid, text, text, uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_deactivate_staff_row(
  p_staff_id       uuid,
  p_staff_rpc_gate text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx         private.caller_ctx;
  v_before      public.staff%ROWTYPE;
  v_after       public.staff%ROWTYPE;
  v_peek_role   text;
  v_peek_active boolean;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);
  PERFORM private.require_staff_rpc_gate(p_staff_rpc_gate);

  IF p_staff_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_id_required'));
  END IF;

  IF p_staff_id = v_ctx.staff_id THEN
    PERFORM private.raise_vhm_error('CANNOT_DEACTIVATE_SELF',
      jsonb_build_object('staff_id', p_staff_id));
  END IF;

  SELECT s.role, s.is_active INTO v_peek_role, v_peek_active
  FROM public.staff s
  WHERE s.id = p_staff_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_not_found', 'staff_id', p_staff_id));
  END IF;

  IF v_peek_active = false THEN
    SELECT * INTO v_before FROM public.staff WHERE id = p_staff_id;
    RETURN private.staff_to_jsonb(v_before) || jsonb_build_object('already_inactive', true);
  END IF;

  IF v_peek_role = 'admin' THEN
    PERFORM private.lock_active_admins();
  END IF;

  SELECT * INTO v_before FROM public.staff WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_not_found', 'staff_id', p_staff_id));
  END IF;

  IF v_before.is_active = false THEN
    RETURN private.staff_to_jsonb(v_before) || jsonb_build_object('already_inactive', true);
  END IF;

  IF v_before.role = 'admin' THEN
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

REVOKE EXECUTE ON FUNCTION public.admin_deactivate_staff_row(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_deactivate_staff_row(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_reactivate_staff_row(
  p_staff_id       uuid,
  p_staff_rpc_gate text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx         private.caller_ctx;
  v_before      public.staff%ROWTYPE;
  v_after       public.staff%ROWTYPE;
  v_peek_role   text;
  v_peek_active boolean;
BEGIN
  v_ctx := private.get_caller_ctx(ARRAY['admin']);
  PERFORM private.require_staff_rpc_gate(p_staff_rpc_gate);

  IF p_staff_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_id_required'));
  END IF;

  SELECT s.role, s.is_active INTO v_peek_role, v_peek_active
  FROM public.staff s
  WHERE s.id = p_staff_id;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_not_found', 'staff_id', p_staff_id));
  END IF;

  IF v_peek_active = true THEN
    SELECT * INTO v_before FROM public.staff WHERE id = p_staff_id;
    RETURN private.staff_to_jsonb(v_before) || jsonb_build_object('already_active', true);
  END IF;

  IF v_peek_role = 'admin' THEN
    PERFORM private.lock_active_admins();
  END IF;

  SELECT * INTO v_before FROM public.staff WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'staff_not_found', 'staff_id', p_staff_id));
  END IF;

  IF v_before.is_active = true THEN
    RETURN private.staff_to_jsonb(v_before) || jsonb_build_object('already_active', true);
  END IF;

  PERFORM private.validate_role_depot(v_before.role, v_before.depot_id);

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

REVOKE EXECUTE ON FUNCTION public.admin_reactivate_staff_row(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_reactivate_staff_row(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_audit_staff_auth_reconcile(
  p_staff_id       uuid,
  p_details        jsonb,
  p_staff_rpc_gate text
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
  PERFORM private.require_staff_rpc_gate(p_staff_rpc_gate);

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

REVOKE EXECUTE ON FUNCTION public.admin_audit_staff_auth_reconcile(uuid, jsonb, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_audit_staff_auth_reconcile(uuid, jsonb, text) TO authenticated;
