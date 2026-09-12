-- ================================================================
-- VHM POS — Migration 012: Row Level Security Policies
-- ================================================================
--
-- DESIGN PRINCIPLES:
--
--   1. ALL transactional writes go through Edge Functions using the
--      service_role key, which BYPASSES RLS entirely. No INSERT /
--      UPDATE / DELETE policies are created on transactional tables.
--      The client SDK (anon / authenticated role) can NEVER write
--      directly to sales, payments, stock, etc.
--
--   2. SELECT policies control what each role can read:
--        admin:       full access to all depots
--        cashier:     own depot only; own record on staff
--        depot_staff: own depot only; own record on staff
--
--   3. Helper functions from migration 011 are used for role and
--      depot lookups. They are SECURITY DEFINER to avoid recursion
--      when reading the staff table from within a policy.
--
--   4. The staff table uses a simple auth.uid() check for own-record
--      reads to avoid any recursion in the helper functions.
--
--   5. audit_log: SELECT admin only. Zero write policies (append-only
--      via service_role in Edge Functions).
--
--   6. business_settings: all authenticated staff can SELECT.
--      Writes go through an admin Edge Function.
-- ================================================================

-- ─── business_settings ─────────────────────────────────────────

alter table business_settings enable row level security;

create policy "business_settings_select_authenticated"
  on business_settings for select
  using (auth.uid() is not null);
  -- Any active authenticated user can read the exchange rate and business name

-- ─── depots ─────────────────────────────────────────────────────

alter table depots enable row level security;

create policy "depots_select_admin"
  on depots for select
  using (public.is_current_staff_admin());

create policy "depots_select_own_depot"
  on depots for select
  using (
    id = public.get_current_staff_depot_id()
    and not public.is_current_staff_admin()
  );

-- ─── staff ──────────────────────────────────────────────────────

alter table staff enable row level security;

-- Admin can see all staff (uses simple auth.uid() to avoid recursion
-- because is_current_staff_admin() reads from staff itself)
create policy "staff_select_admin"
  on staff for select
  using (
    exists (
      select 1 from public.staff s2
      where s2.id = auth.uid()
        and s2.role = 'admin'
        and s2.is_active = true
    )
  );

-- Non-admin staff can only see their own record
create policy "staff_select_own"
  on staff for select
  using (
    id = auth.uid()
    and not exists (
      select 1 from public.staff s2
      where s2.id = auth.uid()
        and s2.role = 'admin'
        and s2.is_active = true
    )
  );

-- ─── categories ─────────────────────────────────────────────────

alter table categories enable row level security;

-- All authenticated staff can read categories (shared across depots)
create policy "categories_select_authenticated"
  on categories for select
  using (auth.uid() is not null);

-- ─── products ───────────────────────────────────────────────────

alter table products enable row level security;

create policy "products_select_admin"
  on products for select
  using (public.is_current_staff_admin());

-- Cashier and depot_staff see products for their depot only
-- (includes inactive products — needed for historical sale display)
create policy "products_select_own_depot"
  on products for select
  using (
    depot_id = public.get_current_staff_depot_id()
    and not public.is_current_staff_admin()
  );

-- ─── product_units ───────────────────────────────────────────────

alter table product_units enable row level security;

create policy "product_units_select_admin"
  on product_units for select
  using (public.is_current_staff_admin());

create policy "product_units_select_own_depot"
  on product_units for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_units.product_id
        and p.depot_id = public.get_current_staff_depot_id()
    )
    and not public.is_current_staff_admin()
  );

-- ─── stock_entries ───────────────────────────────────────────────

alter table stock_entries enable row level security;

create policy "stock_entries_select_admin"
  on stock_entries for select
  using (public.is_current_staff_admin());

create policy "stock_entries_select_own_depot"
  on stock_entries for select
  using (
    depot_id = public.get_current_staff_depot_id()
    and not public.is_current_staff_admin()
  );

-- ─── inventory_adjustments ──────────────────────────────────────

alter table inventory_adjustments enable row level security;

create policy "inventory_adj_select_admin"
  on inventory_adjustments for select
  using (public.is_current_staff_admin());

create policy "inventory_adj_select_own_depot"
  on inventory_adjustments for select
  using (
    depot_id = public.get_current_staff_depot_id()
    and not public.is_current_staff_admin()
  );

-- ─── stock_transfers ────────────────────────────────────────────

alter table stock_transfers enable row level security;

create policy "stock_transfers_select_admin"
  on stock_transfers for select
  using (public.is_current_staff_admin());

-- Depot staff/cashier can see transfers involving their depot
create policy "stock_transfers_select_own_depot"
  on stock_transfers for select
  using (
    (
      from_depot_id = public.get_current_staff_depot_id()
      or to_depot_id = public.get_current_staff_depot_id()
    )
    and not public.is_current_staff_admin()
  );

-- ─── stock_transfer_items ───────────────────────────────────────

alter table stock_transfer_items enable row level security;

create policy "stock_transfer_items_select_admin"
  on stock_transfer_items for select
  using (public.is_current_staff_admin());

create policy "stock_transfer_items_select_own_depot"
  on stock_transfer_items for select
  using (
    exists (
      select 1 from public.stock_transfers st
      where st.id = stock_transfer_items.transfer_id
        and (
          st.from_depot_id = public.get_current_staff_depot_id()
          or st.to_depot_id = public.get_current_staff_depot_id()
        )
    )
    and not public.is_current_staff_admin()
  );

-- ─── shifts ─────────────────────────────────────────────────────

alter table shifts enable row level security;

create policy "shifts_select_admin"
  on shifts for select
  using (public.is_current_staff_admin());

-- Cashier sees shifts for their depot
create policy "shifts_select_own_depot"
  on shifts for select
  using (
    depot_id = public.get_current_staff_depot_id()
    and not public.is_current_staff_admin()
  );

-- ─── customers ──────────────────────────────────────────────────

alter table customers enable row level security;

-- Admin sees all customers
create policy "customers_select_admin"
  on customers for select
  using (public.is_current_staff_admin());

-- Cashier sees all customers (needed for lookup at POS and payment recording)
-- Depot_staff does NOT need customer access — inventory-focused role
create policy "customers_select_cashier"
  on customers for select
  using (public.is_current_staff_cashier());

-- ─── sales ──────────────────────────────────────────────────────

alter table sales enable row level security;

create policy "sales_select_admin"
  on sales for select
  using (public.is_current_staff_admin());

-- Cashier sees own depot sales
create policy "sales_select_cashier"
  on sales for select
  using (
    depot_id = public.get_current_staff_depot_id()
    and public.is_current_staff_cashier()
  );

-- ─── sale_items ─────────────────────────────────────────────────

alter table sale_items enable row level security;

create policy "sale_items_select_admin"
  on sale_items for select
  using (public.is_current_staff_admin());

create policy "sale_items_select_cashier"
  on sale_items for select
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and s.depot_id = public.get_current_staff_depot_id()
    )
    and public.is_current_staff_cashier()
  );

-- ─── sale_returns ───────────────────────────────────────────────

alter table sale_returns enable row level security;

create policy "sale_returns_select_admin"
  on sale_returns for select
  using (public.is_current_staff_admin());

create policy "sale_returns_select_cashier"
  on sale_returns for select
  using (
    depot_id = public.get_current_staff_depot_id()
    and public.is_current_staff_cashier()
  );

-- ─── sale_return_items ──────────────────────────────────────────

alter table sale_return_items enable row level security;

create policy "sale_return_items_select_admin"
  on sale_return_items for select
  using (public.is_current_staff_admin());

create policy "sale_return_items_select_cashier"
  on sale_return_items for select
  using (
    exists (
      select 1 from public.sale_returns sr
      where sr.id = sale_return_items.return_id
        and sr.depot_id = public.get_current_staff_depot_id()
    )
    and public.is_current_staff_cashier()
  );

-- ─── payments ───────────────────────────────────────────────────

alter table payments enable row level security;

create policy "payments_select_admin"
  on payments for select
  using (public.is_current_staff_admin());

-- Cashier sees payments for customers they can access
-- (payments for customers from sales in their depot)
create policy "payments_select_cashier"
  on payments for select
  using (
    public.is_current_staff_cashier()
    and (
      -- sale_payment: accessible if sale is in their depot
      (
        payment_type = 'sale_payment'
        and exists (
          select 1 from public.sales s
          where s.id = payments.sale_id
            and s.depot_id = public.get_current_staff_depot_id()
        )
      )
      or
      -- customer_payment: accessible for any customer (cashier manages all customer payments)
      payment_type = 'customer_payment'
    )
  );

-- ─── audit_log ──────────────────────────────────────────────────

alter table audit_log enable row level security;

-- Only admin can read audit logs. No write policy — append-only via service_role.
create policy "audit_log_select_admin"
  on audit_log for select
  using (public.is_current_staff_admin());
