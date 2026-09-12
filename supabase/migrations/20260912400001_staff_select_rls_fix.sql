-- ================================================================
-- VHM POS — Staff SELECT RLS recursion fix
-- Phase 3 Security / RLS remediation
-- ================================================================
--
-- Root cause:
--   staff_select_admin and staff_select_own queried public.staff
--   inside their own USING clauses. Those inner reads re-entered
--   staff RLS and PostgreSQL raised 42P17 (infinite recursion).
--
-- Fix:
--   staff_select_admin uses the existing SECURITY DEFINER helper
--   public.is_current_staff_admin() (auth.uid() + DB role + is_active).
--   staff_select_own uses id = auth.uid() with no staff subquery.
--
-- Visibility unchanged:
--   anon         — no staff rows
--   admin        — all staff rows
--   cashier      — own row only
--   depot_staff  — own row only
--   deactivated  — own row remains readable
--
-- This migration does not create or replace any functions.
-- ================================================================

drop policy if exists "staff_select_admin" on public.staff;
drop policy if exists "staff_select_own"   on public.staff;

create policy "staff_select_admin"
  on public.staff
  for select
  to authenticated
  using (public.is_current_staff_admin());

create policy "staff_select_own"
  on public.staff
  for select
  to authenticated
  using (id = auth.uid());

comment on policy "staff_select_admin" on public.staff is
  'Active admin (is_current_staff_admin SECURITY DEFINER) may SELECT all staff rows.';

comment on policy "staff_select_own" on public.staff is
  'Authenticated staff may SELECT their own row (id = auth.uid()). Includes deactivated own-row reads.';
