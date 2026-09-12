-- ================================================================
-- VHM POS — Development Seed Data
-- ================================================================
--
-- THIS FILE IS FOR LOCAL DEVELOPMENT ONLY.
-- Run via: supabase db reset  (applies migrations then this seed)
--
-- PRODUCTION SETUP:
--   1. Apply all migrations: supabase db push
--   2. Insert business_settings manually or via admin UI
--   3. Create the first admin via Supabase Dashboard:
--        Authentication > Users > Invite User
--        Email: admin@vhm-pos.internal
--        Then insert into public.staff (id, username, full_name, role)
--
-- LOCAL DEV CREDENTIALS (change these for any real environment):
--   Admin:   username=admin   password=Admin2026!
--   Cashier: username=cashier password=Cashier2026!
--   Depot:   username=depot   password=Depot2026!
-- ================================================================

-- Deterministic UUIDs for dev consistency across resets
do $$
declare
  -- Staff UUIDs
  admin_id       constant uuid := '00000000-0000-0000-0000-000000000001';
  cashier_id     constant uuid := '00000000-0000-0000-0000-000000000002';
  depot_staff_id constant uuid := '00000000-0000-0000-0000-000000000003';

  -- Depot UUIDs
  depot_a_id     constant uuid := '00000000-0000-0000-0001-000000000001';
  depot_b_id     constant uuid := '00000000-0000-0000-0001-000000000002';

  -- Category UUIDs
  cat_beverages  constant uuid := '00000000-0000-0000-0002-000000000001';
  cat_food       constant uuid := '00000000-0000-0000-0002-000000000002';
  cat_household  constant uuid := '00000000-0000-0000-0002-000000000003';
  cat_drinks_sub constant uuid := '00000000-0000-0000-0002-000000000010'; -- sub of beverages

  -- Product UUIDs (depot_a)
  prod_water_a   constant uuid := '00000000-0000-0000-0003-000000000001';
  prod_soda_a    constant uuid := '00000000-0000-0000-0003-000000000002';
  prod_rice_a    constant uuid := '00000000-0000-0000-0003-000000000003';

  -- Product UUIDs (depot_b mirrors)
  prod_water_b   constant uuid := '00000000-0000-0000-0003-000000000011';
  prod_soda_b    constant uuid := '00000000-0000-0000-0003-000000000012';

  -- Stock entry UUIDs (deterministic for idempotent resets)
  entry_water_a  constant uuid := '00000000-0000-0000-0004-000000000001';
  entry_soda_a   constant uuid := '00000000-0000-0000-0004-000000000002';
  entry_rice_a   constant uuid := '00000000-0000-0000-0004-000000000003';
  entry_water_b  constant uuid := '00000000-0000-0000-0004-000000000011';
  entry_soda_b   constant uuid := '00000000-0000-0000-0004-000000000012';

  drift_count    int;
begin

  -- ─── Supabase Auth Users (local dev only) ─────────────────────
  -- pgcrypto crypt() produces a bcrypt hash. The password is verified
  -- by Supabase Auth on login. Only works in local Supabase dev stack.

  insert into auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change,
    is_sso_user
  ) values
    -- Admin
    (
      admin_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'admin@vhm-pos.internal',
      crypt('Admin2026!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
      '{}'::jsonb,
      now(), now(), '', '', '', '', false
    ),
    -- Cashier
    (
      cashier_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'cashier@vhm-pos.internal',
      crypt('Cashier2026!', gen_salt('bf')),
      now(),
      format('{"provider":"email","providers":["email"],"role":"cashier","depot_id":"%s"}', depot_a_id)::jsonb,
      '{}'::jsonb,
      now(), now(), '', '', '', '', false
    ),
    -- Depot Staff
    (
      depot_staff_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'depot@vhm-pos.internal',
      crypt('Depot2026!', gen_salt('bf')),
      now(),
      format('{"provider":"email","providers":["email"],"role":"depot_staff","depot_id":"%s"}', depot_a_id)::jsonb,
      '{}'::jsonb,
      now(), now(), '', '', '', '', false
    )
  on conflict (id) do nothing;

  -- Auth identities (required for Supabase email sign-in to work)
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values
    (
      admin_id, admin_id,
      'admin@vhm-pos.internal', 'email',
      format('{"sub":"%s","email":"admin@vhm-pos.internal"}', admin_id)::jsonb,
      now(), now(), now()
    ),
    (
      cashier_id, cashier_id,
      'cashier@vhm-pos.internal', 'email',
      format('{"sub":"%s","email":"cashier@vhm-pos.internal"}', cashier_id)::jsonb,
      now(), now(), now()
    ),
    (
      depot_staff_id, depot_staff_id,
      'depot@vhm-pos.internal', 'email',
      format('{"sub":"%s","email":"depot@vhm-pos.internal"}', depot_staff_id)::jsonb,
      now(), now(), now()
    )
  on conflict (id) do nothing;

  -- ─── Business Settings ───────────────────────────────────────────
  insert into business_settings (
    id, business_name, cfa_to_usd_rate, rate_updated_at, rate_updated_by
  ) values (
    true, 'VHM Trading', 620.000000, now(), admin_id
  ) on conflict (id) do nothing;

  -- ─── Depots ──────────────────────────────────────────────────────
  insert into depots (id, name, location, code, is_active) values
    (depot_a_id, 'Depot Dakar',    'Dakar, Sénégal',      'DKR', true),
    (depot_b_id, 'Depot Abidjan',  'Abidjan, Côte d''Ivoire', 'ABJ', true)
  on conflict (id) do nothing;

  -- ─── Staff ──────────────────────────────────────────────────────
  insert into staff (id, username, full_name, role, depot_id, is_active) values
    (admin_id,       'admin',   'System Administrator', 'admin',       null,       true),
    (cashier_id,     'cashier', 'Cashier Dakar',        'cashier',     depot_a_id, true),
    (depot_staff_id, 'depot',   'Stock Manager Dakar',  'depot_staff', depot_a_id, true)
  on conflict (id) do nothing;

  -- ─── Categories ──────────────────────────────────────────────────
  insert into categories (id, parent_id, name, is_active) values
    (cat_beverages,  null,          'Beverages',  true),
    (cat_food,       null,          'Food',       true),
    (cat_household,  null,          'Household',  true),
    (cat_drinks_sub, cat_beverages, 'Soft Drinks', true)
  on conflict (id) do nothing;

  -- ─── Products (Depot A — Dakar) ──────────────────────────────────
  insert into products (id, depot_id, category_id, name, photo_url, current_stock_pieces, is_active) values
    (prod_water_a, depot_a_id, cat_beverages, 'Mineral Water 1.5L', 'https://placehold.co/200x200?text=Water', 500,  true),
    (prod_soda_a,  depot_a_id, cat_drinks_sub,'Cola Can 33cl',       'https://placehold.co/200x200?text=Cola',  240,  true),
    (prod_rice_a,  depot_a_id, cat_food,      'Parboiled Rice 25kg', 'https://placehold.co/200x200?text=Rice',  80,   true)
  on conflict (id) do nothing;

  -- Product units for Depot A products
  insert into product_units (product_id, unit_level, unit_name, conversion_to_base, cost_price_cfa, selling_price_cfa) values
    -- Water: sold per piece or per case (12 bottles)
    (prod_water_a, 0, 'Bottle',  1,  250,   350),
    (prod_water_a, 1, 'Case',   12, 2800,  3800),
    -- Cola: sold per piece or per pack (6 cans)
    (prod_soda_a,  0, 'Can',     1,  200,   300),
    (prod_soda_a,  1, 'Pack',    6, 1100,  1600),
    -- Rice: sold per sack only
    (prod_rice_a,  0, 'Sack',    1, 14000, 18000)
  on conflict (product_id, unit_level) do nothing;

  -- ─── Products (Depot B — Abidjan, mirror for transfer testing) ───
  insert into products (id, depot_id, category_id, name, photo_url, current_stock_pieces, is_active) values
    (prod_water_b, depot_b_id, cat_beverages, 'Mineral Water 1.5L', 'https://placehold.co/200x200?text=Water', 200, true),
    (prod_soda_b,  depot_b_id, cat_drinks_sub,'Cola Can 33cl',       'https://placehold.co/200x200?text=Cola',  100, true)
  on conflict (id) do nothing;

  insert into product_units (product_id, unit_level, unit_name, conversion_to_base, cost_price_cfa, selling_price_cfa) values
    (prod_water_b, 0, 'Bottle',  1,  250,   350),
    (prod_water_b, 1, 'Case',   12, 2800,  3800),
    (prod_soda_b,  0, 'Can',     1,  200,   300),
    (prod_soda_b,  1, 'Pack',    6, 1100,  1600)
  on conflict (product_id, unit_level) do nothing;

  -- ─── Seed stock entries ───────────────────────────────────────
  -- These create the stock_entries business records that back the
  -- inventory_transactions ledger rows inserted below.
  -- current_stock_pieces values match the products inserts above.
  -- unit_level=0 (piece) with conversion_to_base=1 for simplicity.
  insert into stock_entries (id, product_id, depot_id, unit_level, quantity_in_unit, quantity_pieces, note, entered_by) values
    (entry_water_a, prod_water_a, depot_a_id, 0, 500,  500,  'Initial seed stock', admin_id),
    (entry_soda_a,  prod_soda_a,  depot_a_id, 0, 240,  240,  'Initial seed stock', admin_id),
    (entry_rice_a,  prod_rice_a,  depot_a_id, 0, 80,   80,   'Initial seed stock', admin_id),
    (entry_water_b, prod_water_b, depot_b_id, 0, 200,  200,  'Initial seed stock', admin_id),
    (entry_soda_b,  prod_soda_b,  depot_b_id, 0, 100,  100,  'Initial seed stock', admin_id)
  on conflict (id) do nothing;

  -- ─── Seed inventory_transactions ledger ──────────────────────
  -- Invariant: SUM(inventory_transactions.quantity_pieces) = products.current_stock_pieces
  -- Must hold immediately after supabase db reset.
  -- One RESTOCK row per seeded product with stock > 0.
  insert into inventory_transactions (depot_id, product_id, quantity_pieces, transaction_type, reference_type, reference_id, created_by, metadata) values
    (depot_a_id, prod_water_a, 500,  'RESTOCK', 'stock_entry', entry_water_a, admin_id, '{"note":"Initial seed stock"}'::jsonb),
    (depot_a_id, prod_soda_a,  240,  'RESTOCK', 'stock_entry', entry_soda_a,  admin_id, '{"note":"Initial seed stock"}'::jsonb),
    (depot_a_id, prod_rice_a,  80,   'RESTOCK', 'stock_entry', entry_rice_a,  admin_id, '{"note":"Initial seed stock"}'::jsonb),
    (depot_b_id, prod_water_b, 200,  'RESTOCK', 'stock_entry', entry_water_b, admin_id, '{"note":"Initial seed stock"}'::jsonb),
    (depot_b_id, prod_soda_b,  100,  'RESTOCK', 'stock_entry', entry_soda_b,  admin_id, '{"note":"Initial seed stock"}'::jsonb)
  on conflict do nothing;

  -- ─── Drift assertion ─────────────────────────────────────────
  -- Verify inventory_transactions ledger is in sync with products.current_stock_pieces.
  -- This check runs at the end of every supabase db reset.
  -- If it fails, the seed data or ledger rows are misconfigured.
  select count(*) into drift_count
  from products p
  left join (
    select product_id, sum(quantity_pieces) as ledger
    from inventory_transactions
    group by product_id
  ) it on it.product_id = p.id
  where p.current_stock_pieces != coalesce(it.ledger, 0);

  if drift_count > 0 then
    raise exception 'SEED ERROR: % product(s) have inventory_transactions ledger drift. Check seed data.', drift_count;
  end if;

end $$;
