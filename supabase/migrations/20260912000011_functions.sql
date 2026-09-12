-- ================================================================
-- VHM POS — Migration 011: RLS Helper Functions
-- ================================================================
--
-- These SECURITY DEFINER functions read the staff table with
-- elevated privileges, bypassing RLS on the staff table itself.
-- This avoids infinite recursion when RLS policies on other tables
-- try to look up the caller's role/depot_id from the staff table.
--
-- All functions are:
--   - SECURITY DEFINER: execute as owner (postgres), bypasses RLS
--   - STABLE: safe to call multiple times per query (result cached)
--   - SET search_path = public: prevents search_path injection
--
-- IMPORTANT: JWT app_metadata contains role/depot_id for performance
-- (set by create_staff Edge Function), but Edge Functions always
-- re-verify from the staff table directly (never trust JWT alone).
-- These functions also re-read from the DB, not from JWT, so they
-- stay correct even after role changes or deactivation.
-- ================================================================

-- ─── Current staff role ─────────────────────────────────────────
-- Returns the role of the currently authenticated active staff.
-- Returns NULL if not authenticated, not found, or deactivated.

create or replace function public.get_current_staff_role()
returns text
security definer
stable
language sql
set search_path = public
as $$
  select role
  from public.staff
  where id = auth.uid()
    and is_active = true
  limit 1
$$;

comment on function public.get_current_staff_role() is
  'SECURITY DEFINER. Returns role of active authenticated staff. NULL if deactivated or not found. Used in RLS policies.';

-- ─── Current staff depot_id ─────────────────────────────────────
-- Returns depot_id for cashier/depot_staff. Returns NULL for admins.
-- Returns NULL if not authenticated or deactivated.

create or replace function public.get_current_staff_depot_id()
returns uuid
security definer
stable
language sql
set search_path = public
as $$
  select depot_id
  from public.staff
  where id = auth.uid()
    and is_active = true
  limit 1
$$;

comment on function public.get_current_staff_depot_id() is
  'SECURITY DEFINER. Returns depot_id of active authenticated staff. NULL for admins and deactivated staff. Used in RLS policies.';

-- ─── Is admin check ─────────────────────────────────────────────
-- Quick boolean: is the current user an active admin?

create or replace function public.is_current_staff_admin()
returns boolean
security definer
stable
language sql
set search_path = public
as $$
  select exists (
    select 1
    from public.staff
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  )
$$;

comment on function public.is_current_staff_admin() is
  'SECURITY DEFINER. Returns true if current user is an active admin. Used in RLS policies.';

-- ─── Is active cashier check ────────────────────────────────────
create or replace function public.is_current_staff_cashier()
returns boolean
security definer
stable
language sql
set search_path = public
as $$
  select exists (
    select 1
    from public.staff
    where id = auth.uid()
      and role = 'cashier'
      and is_active = true
  )
$$;

comment on function public.is_current_staff_cashier() is
  'SECURITY DEFINER. Returns true if current user is an active cashier. Used in RLS policies.';

-- ─── Is active depot_staff check ────────────────────────────────
create or replace function public.is_current_staff_depot_staff()
returns boolean
security definer
stable
language sql
set search_path = public
as $$
  select exists (
    select 1
    from public.staff
    where id = auth.uid()
      and role = 'depot_staff'
      and is_active = true
  )
$$;

comment on function public.is_current_staff_depot_staff() is
  'SECURITY DEFINER. Returns true if current user is active depot_staff. Used in RLS policies.';
