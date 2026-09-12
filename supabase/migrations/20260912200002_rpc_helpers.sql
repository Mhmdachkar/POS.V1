-- ================================================================
-- VHM POS — Migration 016: Private RPC Helper Functions
-- ================================================================
--
-- Four SECURITY DEFINER functions in the private schema.
-- Called only by the public SECURITY DEFINER business RPCs.
-- NOT callable directly by the authenticated role.
--
-- All functions declare:
--   SET search_path = pg_catalog, public, private
-- to prevent schema-shadowing attacks.
--
-- Functions:
--   private.get_caller_ctx(required_roles)  → caller info or UNAUTHORIZED
--   private.raise_vhm_error(code, details)  → structured JSON exception
--   private.write_audit(...)                → audit_log INSERT
--   private.validate_shift(shift_id, depot) → shift validation + FOR UPDATE
-- ================================================================

-- ─── private.raise_vhm_error ────────────────────────────────────
-- Raises a structured JSON exception with a standard error envelope.
-- All business RPCs use this for client-parseable errors.
-- ERRCODE 'P0001' is the standard user-defined exception code in PostgreSQL.
--
-- The frontend parseError() tries JSON.parse(err.message) to extract
-- { code: VhmErrorCode, details: { ... } }.

create or replace function private.raise_vhm_error(
  p_code    text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  raise exception '%',
    jsonb_build_object(
      'code',    p_code,
      'details', coalesce(p_details, '{}'::jsonb)
    )::text
  using errcode = 'P0001';
end;
$$;

revoke execute on function private.raise_vhm_error(text, jsonb) from public;

comment on function private.raise_vhm_error(text, jsonb) is
  'Raises a structured JSON exception parseable by the frontend parseError(). Always ERRCODE=P0001.';

-- ─── private.get_caller_ctx ─────────────────────────────────────
-- Reads the calling staff from public.staff by auth.uid().
-- Validates:
--   1. auth.uid() is not null (authenticated request)
--   2. staff row exists
--   3. is_active = true
--   4. role is in required_roles (pass empty array to skip role check)
--
-- Returns a record with (staff_id, role, depot_id, full_name).
-- Raises UNAUTHORIZED on any validation failure.
--
-- IMPORTANT: Reads from DB, not JWT claims. JWT can be stale.

create type private.caller_ctx as (
  staff_id  uuid,
  role      text,
  depot_id  uuid,
  full_name text
);

create or replace function private.get_caller_ctx(
  p_required_roles text[] default '{}'::text[]
)
returns private.caller_ctx
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx    private.caller_ctx;
  v_uid    uuid;
begin
  v_uid := auth.uid();

  if v_uid is null then
    perform private.raise_vhm_error('UNAUTHORIZED',
      '{"reason": "no_authenticated_session"}'::jsonb);
  end if;

  select
    s.id, s.role, s.depot_id, s.full_name
  into
    v_ctx.staff_id, v_ctx.role, v_ctx.depot_id, v_ctx.full_name
  from public.staff s
  where s.id = v_uid
    and s.is_active = true;

  if not found then
    perform private.raise_vhm_error('UNAUTHORIZED',
      '{"reason": "staff_not_found_or_inactive"}'::jsonb);
  end if;

  if array_length(p_required_roles, 1) > 0
     and not (v_ctx.role = any(p_required_roles)) then
    perform private.raise_vhm_error('UNAUTHORIZED',
      jsonb_build_object(
        'reason', 'insufficient_role',
        'required', p_required_roles,
        'actual', v_ctx.role
      ));
  end if;

  return v_ctx;
end;
$$;

revoke execute on function private.get_caller_ctx(text[]) from public;

comment on function private.get_caller_ctx(text[]) is
  'Reads caller from staff table (not JWT). Validates is_active and role. Raises UNAUTHORIZED on failure. Pass empty array to skip role check.';

-- ─── private.write_audit ────────────────────────────────────────
-- Inserts one row into audit_log inside the current transaction.
-- If the outer transaction rolls back, this audit entry rolls back too.
-- All business RPCs call this; an operation without an audit entry
-- cannot succeed because this is called before RETURN.

create or replace function private.write_audit(
  p_actor_id    uuid,
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_depot_id    uuid,
  p_before_val  jsonb default null,
  p_after_val   jsonb default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.audit_log (
    actor_id, action, entity_type, entity_id,
    depot_id, before_value, after_value, occurred_at
  ) values (
    p_actor_id, p_action, p_entity_type, p_entity_id,
    p_depot_id, p_before_val, p_after_val, now()
  );
end;
$$;

revoke execute on function private.write_audit(uuid, text, text, uuid, uuid, jsonb, jsonb) from public;

comment on function private.write_audit(uuid, text, text, uuid, uuid, jsonb, jsonb) is
  'Inserts audit_log row inside the current transaction. Rolls back with the business transaction on failure.';

-- ─── private.validate_shift ─────────────────────────────────────
-- Validates that a shift_id is:
--   1. not null (if null, returns null — shift is optional)
--   2. exists in the shifts table
--   3. belongs to the given depot
--   4. has status = 'open'
--
-- Acquires FOR UPDATE lock on the shift row so that concurrent
-- close_shift cannot race with in-progress sales.
--
-- LOCK ORDER NOTE: This function is called early in RPCs that also
-- lock products. The lock order is therefore:
--   shift (via validate_shift) → depot → products (ASC UUID) → customer
-- All RPCs that lock both shifts and products must call validate_shift
-- first to maintain this consistent ordering.
--
-- SHIFT OWNERSHIP RULE:
--   Any authorized cashier or admin in the same depot may transact
--   against any open shift in that depot. There is no restriction
--   to the shift's opening cashier.

create or replace function private.validate_shift(
  p_shift_id uuid,
  p_depot_id uuid
)
returns public.shifts
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_shift public.shifts;
begin
  -- Shifts are optional: if null, skip validation and return null
  if p_shift_id is null then
    return null;
  end if;

  select * into v_shift
  from public.shifts
  where id = p_shift_id
  for update;                  -- Lock: prevents concurrent close_shift race

  if not found then
    perform private.raise_vhm_error('SHIFT_NOT_FOUND',
      jsonb_build_object('shift_id', p_shift_id));
  end if;

  if v_shift.depot_id != p_depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object(
        'shift_depot_id', v_shift.depot_id,
        'expected_depot_id', p_depot_id
      ));
  end if;

  if v_shift.status != 'open' then
    perform private.raise_vhm_error('SHIFT_NOT_OPEN',
      jsonb_build_object(
        'shift_id', p_shift_id,
        'status', v_shift.status
      ));
  end if;

  return v_shift;
end;
$$;

revoke execute on function private.validate_shift(uuid, uuid) from public;

comment on function private.validate_shift(uuid, uuid) is
  'Validates shift exists, belongs to depot, and is open. Acquires FOR UPDATE lock. Returns null if p_shift_id is null (shifts are optional). Lock order: shift BEFORE products.';
