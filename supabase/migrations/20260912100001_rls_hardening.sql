-- ================================================================
-- VHM POS — Migration 014: RLS Hardening
-- Phase 3 — Authentication & Authorization
-- ================================================================
--
-- Addresses Phase 3 gap analysis findings:
--
--   GAP 1: SECURITY DEFINER functions had EXECUTE granted to PUBLIC
--           (includes the anon role). Revoked and re-granted to
--           authenticated only.
--
--   GAP 2: Client table grants — explicitly revoke INSERT, UPDATE,
--           DELETE from authenticated and anon. Only service_role
--           (used exclusively by Edge Functions) has mutation access.
--           This adds table-level protection on top of RLS-level
--           protection (defense in depth).
--
--   GAP 3: Staff sensitive-field protection trigger — prevents any
--           JWT-authenticated request from modifying authorization-
--           critical fields (role, depot_id, is_active, id, username).
--           Service-role Edge Functions (auth.uid() = NULL) are exempt.
--
--   GAP 4: Efficient composite staff lookup function — replaces
--           5 separate SECURITY DEFINER calls with one that returns
--           all needed fields atomically.
-- ================================================================

-- ─── Step 1: Restrict SECURITY DEFINER function execution ───────
-- Phase 2 created these 5 helper functions. By default PostgreSQL
-- grants EXECUTE to PUBLIC when a function is created. We restrict
-- these to authenticated users only.

revoke execute on function public.get_current_staff_role()      from public;
revoke execute on function public.get_current_staff_depot_id()  from public;
revoke execute on function public.is_current_staff_admin()      from public;
revoke execute on function public.is_current_staff_cashier()    from public;
revoke execute on function public.is_current_staff_depot_staff() from public;

grant execute on function public.get_current_staff_role()       to authenticated;
grant execute on function public.get_current_staff_depot_id()   to authenticated;
grant execute on function public.is_current_staff_admin()       to authenticated;
grant execute on function public.is_current_staff_cashier()     to authenticated;
grant execute on function public.is_current_staff_depot_staff() to authenticated;

-- Trigger-internal functions: called by PostgreSQL itself, not users.
-- Revoke from public so they cannot be called directly.
revoke execute on function public.set_updated_at()                   from public;
revoke execute on function public.validate_transfer_item_depots()    from public;
revoke execute on function public.prevent_return_of_voided_sale()    from public;

-- ─── Step 2: Efficient composite staff lookup function ──────────
-- Returns all authorization-relevant fields in a single DB round-trip.
-- Used by Edge Functions after verifying the caller's JWT.
-- SECURITY DEFINER: bypasses RLS on staff table (safe — the function
-- logic is fully controlled and returns only the caller's own record
-- based on auth.uid()).

create or replace function public.get_current_staff_ctx()
returns table (
  staff_id    uuid,
  role        text,
  depot_id    uuid,
  is_active   boolean,
  full_name   text
)
security definer
stable
language sql
set search_path = public
as $$
  select
    id         as staff_id,
    role,
    depot_id,
    is_active,
    full_name
  from public.staff
  where id = auth.uid()
  limit 1
$$;

revoke execute on function public.get_current_staff_ctx() from public;
grant  execute on function public.get_current_staff_ctx() to authenticated;

comment on function public.get_current_staff_ctx() is
  'Returns all auth-relevant fields for the current JWT user in one round-trip. SECURITY DEFINER. Use in Edge Functions.';

-- ─── Step 3: Table-level mutation privilege revocation ──────────
-- Client connections (authenticated + anon) should NEVER directly
-- mutate business tables. All mutations go through Edge Functions
-- that use the service_role key (which bypasses RLS).
--
-- Revoking INSERT/UPDATE/DELETE at the table-privilege level adds
-- a second layer of protection beyond RLS. Even if a future RLS
-- policy bug accidentally permits a mutation, the table-level
-- privilege check will block it first.
--
-- IMPORTANT: service_role is a Supabase superuser role and is NOT
-- affected by these REVOKE statements. It retains full access.

revoke insert, update, delete on all tables in schema public from authenticated;
revoke all                     on all tables in schema public from anon;

-- Ensure authenticated can still SELECT (RLS governs which rows)
grant usage  on schema public to authenticated;
grant select on all tables in schema public to authenticated;

-- Apply same defaults to future tables created in this schema
alter default privileges in schema public
  grant select on tables to authenticated;

alter default privileges in schema public
  revoke insert, update, delete on tables from authenticated;

comment on schema public is
  'VHM POS public schema. authenticated role: SELECT only (RLS restricts rows). All mutations via service_role Edge Functions.';

-- ─── Step 4: Staff sensitive-field protection trigger ───────────
-- Belt-and-suspenders: even if a future migration accidentally adds
-- an UPDATE policy on the staff table for authenticated users,
-- this trigger will catch and reject modifications to authorization-
-- critical fields.
--
-- The check key: auth.uid() IS NOT NULL means "JWT-authenticated".
-- service_role Edge Functions do not set auth.uid(), so they pass.
-- This ensures admin Edge Functions can still update these fields.

create or replace function public.prevent_staff_privilege_escalation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only applies to JWT-authenticated clients (auth.uid() != NULL)
  -- Service-role Edge Functions have auth.uid() = NULL → allowed
  if auth.uid() is not null then

    -- Block changes to authorization-critical fields
    if (new.id        is distinct from old.id)
    or (new.role      is distinct from old.role)
    or (new.depot_id  is distinct from old.depot_id)
    or (new.is_active is distinct from old.is_active)
    or (new.deactivated_at is distinct from old.deactivated_at)
    or (new.username  is distinct from old.username)
    then
      raise exception
        'Modification of staff authorization fields is forbidden from client connections. '
        'Use the admin Edge Function. (staff_id: %)', new.id
        using errcode = 'insufficient_privilege';
    end if;

  end if;

  return new;
end;
$$;

drop trigger if exists prevent_staff_privilege_escalation_trigger on staff;
create trigger prevent_staff_privilege_escalation_trigger
  before update on staff
  for each row
  execute function public.prevent_staff_privilege_escalation();

revoke execute on function public.prevent_staff_privilege_escalation() from public;

comment on function public.prevent_staff_privilege_escalation() is
  'Blocks JWT-authenticated clients from modifying auth-critical staff fields. Service-role (auth.uid()=NULL) is exempt.';

-- ─── Step 5: Verify no USING(true) policies ─────────────────────
-- This DO block verifies that no RLS policy has an unguarded
-- USING (true) or WITH CHECK (true) clause. It runs at migration
-- time and will fail the migration if any such policy is found.
-- (This is a self-test that runs once at migration apply time.)

do $$
declare
  v_count integer;
begin
  -- pg_policy is the catalog table (polqual/polwithcheck are pg_node_tree).
  -- The human-readable expressions live on the pg_policies view as qual/with_check.
  select count(*)
  into v_count
  from pg_policies
  where (qual = 'true' or with_check = 'true')
    and policyname not like '%_test_%';  -- exclude any test policies

  if v_count > 0 then
    raise exception
      'SECURITY: Found % RLS policy/policies with unguarded USING(true) or WITH CHECK(true). '
      'Inspect pg_policy and fix before deploying.', v_count;
  end if;

  raise notice 'RLS audit: No unguarded true policies found. ✓';
end $$;

-- ─── Step 6: Session validation helper function ─────────────────
-- Called by the frontend to verify staff is still active.
-- Returns null if caller is not an active staff member.
-- Used for periodic re-validation without a full round-trip.

create or replace function public.validate_active_session()
returns jsonb
security definer
stable
language plpgsql
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('valid', false, 'reason', 'no_session');
  end if;

  select * into v_staff
  from public.staff
  where id = auth.uid()
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'staff_not_found');
  end if;

  if not v_staff.is_active then
    return jsonb_build_object('valid', false, 'reason', 'deactivated');
  end if;

  return jsonb_build_object(
    'valid',     true,
    'staff_id',  v_staff.id,
    'role',      v_staff.role,
    'depot_id',  v_staff.depot_id,
    'full_name', v_staff.full_name,
    'is_active', v_staff.is_active
  );
end;
$$;

revoke execute on function public.validate_active_session() from public;
grant  execute on function public.validate_active_session() to authenticated;
-- Also grant to anon so that an expired/unauthenticated caller gets the
-- 'no_session' response rather than a permission error
grant  execute on function public.validate_active_session() to anon;

comment on function public.validate_active_session() is
  'Lightweight session validation. Returns {valid, reason} or {valid, staff_id, role, depot_id}. Used by frontend periodic re-check.';
