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
-- LOCAL DEV CREDENTIALS:
-- Plaintext passwords are intentionally NOT stored in this file (secret scanners).
-- auth.users rows below use fixed bcrypt hashes for the standard local trio:
--   usernames: admin | cashier | depot  (emails: *@vhm-pos.internal)
--   admin password (local): Admin2026!
-- Cashier / depot: ask the project owner or reset via Supabase Dashboard after `supabase db reset`.
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
  cat_personal   constant uuid := '00000000-0000-0000-0002-000000000004';
  cat_snacks     constant uuid := '00000000-0000-0000-0002-000000000005';
  cat_drinks_sub constant uuid := '00000000-0000-0000-0002-000000000010'; -- sub of beverages

  -- Product UUIDs (depot_a — Dakar POS catalog)
  prod_water_a   constant uuid := '00000000-0000-0000-0003-000000000001';
  prod_soda_a    constant uuid := '00000000-0000-0000-0003-000000000002';
  prod_rice_a    constant uuid := '00000000-0000-0000-0003-000000000003';
  prod_juice_a   constant uuid := '00000000-0000-0000-0003-000000000004';
  prod_milk_a    constant uuid := '00000000-0000-0000-0003-000000000005';
  prod_bread_a   constant uuid := '00000000-0000-0000-0003-000000000006';
  prod_pasta_a   constant uuid := '00000000-0000-0000-0003-000000000007';
  prod_sugar_a   constant uuid := '00000000-0000-0000-0003-000000000008';
  prod_oil_a     constant uuid := '00000000-0000-0000-0003-000000000009';
  prod_sauce_a   constant uuid := '00000000-0000-0000-0003-00000000000a';
  prod_beans_a   constant uuid := '00000000-0000-0000-0003-00000000000b';
  prod_tuna_a    constant uuid := '00000000-0000-0000-0003-00000000000c';
  prod_biscuits_a constant uuid := '00000000-0000-0000-0003-00000000000d';
  prod_chips_a   constant uuid := '00000000-0000-0000-0003-00000000000e';
  prod_chocolate_a constant uuid := '00000000-0000-0000-0003-00000000000f';
  prod_detergent_a constant uuid := '00000000-0000-0000-0003-000000000010';
  prod_shampoo_a constant uuid := '00000000-0000-0000-0003-000000000013';
  prod_soap_a    constant uuid := '00000000-0000-0000-0003-000000000014';
  prod_toothpaste_a constant uuid := '00000000-0000-0000-0003-000000000015';
  prod_tissue_a  constant uuid := '00000000-0000-0000-0003-000000000016';
  prod_bleach_a  constant uuid := '00000000-0000-0000-0003-000000000017';
  prod_yogurt_a  constant uuid := '00000000-0000-0000-0003-000000000018';
  prod_eggs_a    constant uuid := '00000000-0000-0000-0003-000000000019';
  prod_coffee_a  constant uuid := '00000000-0000-0000-0003-00000000001a';
  prod_tea_a     constant uuid := '00000000-0000-0000-0003-00000000001b';
  prod_flour_a   constant uuid := '00000000-0000-0000-0003-00000000001c';
  prod_matches_a constant uuid := '00000000-0000-0000-0003-00000000001d';
  prod_longname_a constant uuid := '00000000-0000-0000-0003-00000000001e';

  -- Product UUIDs (depot_b mirrors — keep original IDs)
  prod_water_b   constant uuid := '00000000-0000-0000-0003-000000000011';
  prod_soda_b    constant uuid := '00000000-0000-0000-0003-000000000012';

  -- Stock entry UUIDs (deterministic for idempotent resets)
  entry_water_a  constant uuid := '00000000-0000-0000-0004-000000000001';
  entry_soda_a   constant uuid := '00000000-0000-0000-0004-000000000002';
  entry_rice_a   constant uuid := '00000000-0000-0000-0004-000000000003';
  entry_juice_a  constant uuid := '00000000-0000-0000-0004-000000000004';
  entry_milk_a   constant uuid := '00000000-0000-0000-0004-000000000005';
  entry_bread_a  constant uuid := '00000000-0000-0000-0004-000000000006';
  entry_pasta_a  constant uuid := '00000000-0000-0000-0004-000000000007';
  entry_sugar_a  constant uuid := '00000000-0000-0000-0004-000000000008';
  entry_oil_a    constant uuid := '00000000-0000-0000-0004-000000000009';
  entry_sauce_a  constant uuid := '00000000-0000-0000-0004-00000000000a';
  entry_beans_a  constant uuid := '00000000-0000-0000-0004-00000000000b';
  entry_tuna_a   constant uuid := '00000000-0000-0000-0004-00000000000c';
  entry_biscuits_a constant uuid := '00000000-0000-0000-0004-00000000000d';
  entry_chips_a  constant uuid := '00000000-0000-0000-0004-00000000000e';
  entry_chocolate_a constant uuid := '00000000-0000-0000-0004-00000000000f';
  entry_detergent_a constant uuid := '00000000-0000-0000-0004-000000000010';
  entry_shampoo_a constant uuid := '00000000-0000-0000-0004-000000000013';
  entry_soap_a   constant uuid := '00000000-0000-0000-0004-000000000014';
  entry_toothpaste_a constant uuid := '00000000-0000-0000-0004-000000000015';
  entry_tissue_a constant uuid := '00000000-0000-0000-0004-000000000016';
  entry_bleach_a constant uuid := '00000000-0000-0000-0004-000000000017';
  entry_yogurt_a constant uuid := '00000000-0000-0000-0004-000000000018';
  entry_eggs_a   constant uuid := '00000000-0000-0000-0004-000000000019';
  entry_coffee_a constant uuid := '00000000-0000-0000-0004-00000000001a';
  entry_tea_a    constant uuid := '00000000-0000-0000-0004-00000000001b';
  entry_flour_a  constant uuid := '00000000-0000-0000-0004-00000000001c';
  entry_matches_a constant uuid := '00000000-0000-0000-0004-00000000001d';
  entry_longname_a constant uuid := '00000000-0000-0000-0004-00000000001e';
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
      '$2b$10$0X.lp4lV3R05G9S6md9Q3.y9P2L8KjcBISrqQaLJC2Hd3526eZKwS',
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
      '$2b$10$y.q379Xqn5.7UtSTsahfZOb2ofxUMxbXkxTP7ZHmN00ByMu4lr8iG',
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
      '$2b$10$kfZqB5bJtMEnQDZB0Bir4.7AZcA4YqW86JUtNnAuH.tGnuHLli1nO',
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

  -- FK order:
  --   staff.id            → auth.users(id)
  --   staff.depot_id      → depots(id)
  --   business_settings.rate_updated_by → staff(id)
  -- So: depots → staff → business_settings.

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

  -- ─── Business Settings ───────────────────────────────────────────
  insert into business_settings (
    id, business_name, cfa_to_usd_rate, rate_updated_at, rate_updated_by
  ) values (
    true, 'Aquilux', 620.000000, now(), admin_id
  ) on conflict (id) do nothing;

  -- ─── Categories ──────────────────────────────────────────────────
  insert into categories (id, parent_id, name, is_active) values
    (cat_beverages,  null,          'Beverages',     true),
    (cat_food,       null,          'Food',          true),
    (cat_household,  null,          'Household',     true),
    (cat_personal,   null,          'Personal Care', true),
    (cat_snacks,     null,          'Snacks',        true),
    (cat_drinks_sub, cat_beverages, 'Soft Drinks',   true)
  on conflict (id) do nothing;

  -- ─── Products (Depot A — Dakar POS QA catalog) ───────────────────
  insert into products (id, depot_id, category_id, name, photo_url, current_stock_pieces, is_active) values
    (prod_water_a,     depot_a_id, cat_beverages,  'Mineral Water 1.5L', 'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=800&h=800&q=80', 500, true),
    (prod_soda_a,      depot_a_id, cat_drinks_sub, 'Cola Can 33cl',       'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=800&h=800&q=80', 240, true),
    (prod_rice_a,      depot_a_id, cat_food,       'Parboiled Rice 25kg', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&h=800&q=80',  80, true),
    (prod_juice_a,     depot_a_id, cat_beverages,  'Orange Juice 1L',     'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=800&h=800&q=80', 180, true),
    (prod_milk_a,      depot_a_id, cat_beverages,  'UHT Milk 1L',         'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=800&h=800&q=80',  90, true),
    (prod_yogurt_a,    depot_a_id, cat_beverages,  'Natural Yogurt 125g', 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&h=800&q=80',  36, true),
    (prod_bread_a,     depot_a_id, cat_food,       'Sliced Bread 500g',   'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&h=800&q=80',  24, true),
    (prod_pasta_a,     depot_a_id, cat_food,       'Spaghetti 500g',      'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&h=800&q=80', 150, true),
    (prod_sugar_a,     depot_a_id, cat_food,       'White Sugar 1kg',     'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=800&h=800&q=80',  60, true),
    (prod_oil_a,       depot_a_id, cat_food,       'Cooking Oil 1L',      'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=800&h=800&q=80',  40, true),
    (prod_sauce_a,     depot_a_id, cat_food,       'Tomato Sauce 400g',   'https://images.unsplash.com/photo-1472476443507-c7a9ba33acc0?auto=format&fit=crop&w=800&h=800&q=80',  70, true),
    (prod_beans_a,     depot_a_id, cat_food,       'Canned White Beans',  'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&w=800&h=800&q=80',  55, true),
    (prod_tuna_a,      depot_a_id, cat_food,       'Canned Tuna 160g',    'https://images.unsplash.com/photo-1599084993091-1cb5c0721eb6?auto=format&fit=crop&w=800&h=800&q=80',  80, true),
    (prod_eggs_a,      depot_a_id, cat_food,       'Eggs (tray of 12)',   'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=800&h=800&q=80',  48, true),
    (prod_flour_a,     depot_a_id, cat_food,       'Wheat Flour 1kg',     'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=800&h=800&q=80',  35, true),
    (prod_biscuits_a,  depot_a_id, cat_snacks,     'Tea Biscuits 200g',   'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&h=800&q=80', 100, true),
    (prod_chips_a,     depot_a_id, cat_snacks,     'Potato Chips 150g',   'https://images.unsplash.com/photo-1566478989037-eec17017d0b4?auto=format&fit=crop&w=800&h=800&q=80',  75, true),
    (prod_chocolate_a, depot_a_id, cat_snacks,     'Milk Chocolate 100g', 'https://images.unsplash.com/photo-1606312619070-d48b4d9382c7?auto=format&fit=crop&w=800&h=800&q=80',  45, true),
    (prod_detergent_a, depot_a_id, cat_household,  'Laundry Detergent 2kg', 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?auto=format&fit=crop&w=800&h=800&q=80', 30, true),
    (prod_bleach_a,    depot_a_id, cat_household,  'Household Bleach 1L', 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=800&h=800&q=80',  22, true),
    (prod_tissue_a,    depot_a_id, cat_household,  'Toilet Tissue 4-pack', 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=800&h=800&q=80', 40, true),
    (prod_matches_a,   depot_a_id, cat_household,  'Safety Matches',      'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=800&h=800&q=80',   0, true),
    (prod_soap_a,      depot_a_id, cat_personal,   'Bar Soap 125g',       'https://images.unsplash.com/photo-1584305574647-0cc949a2d9ff?auto=format&fit=crop&w=800&h=800&q=80', 120, true),
    (prod_toothpaste_a,depot_a_id, cat_personal,   'Toothpaste 75ml',     'https://images.unsplash.com/photo-1629198688000-71f23e745b6e?auto=format&fit=crop&w=800&h=800&q=80',  64, true),
    (prod_shampoo_a,   depot_a_id, cat_personal,   'Shampoo 400ml',       'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?auto=format&fit=crop&w=800&h=800&q=80',  28, true),
    (prod_coffee_a,    depot_a_id, cat_food,       'Ground Coffee 250g',  'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=800&h=800&q=80',  20, true),
    (prod_tea_a,       depot_a_id, cat_beverages,  'Black Tea 50 bags',   'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=800&h=800&q=80',   4, true),
    (prod_longname_a,  depot_a_id, cat_food,       'Premium Extra-Virgin Olive Oil Cold Pressed 750ml', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=800&h=800&q=80', 12, true)
  on conflict (id) do nothing;

  -- Product units for Depot A products
  insert into product_units (product_id, unit_level, unit_name, conversion_to_base, cost_price_cfa, selling_price_cfa) values
    (prod_water_a,      0, 'Bottle',  1,   250,    350),
    (prod_water_a,      1, 'Case',   12,  2800,   3800),
    (prod_soda_a,       0, 'Can',     1,   200,    300),
    (prod_soda_a,       1, 'Pack',    6,  1100,   1600),
    (prod_rice_a,       0, 'Sack',    1, 14000,  18000),
    (prod_juice_a,      0, 'Bottle',  1,   450,    650),
    (prod_juice_a,      1, 'Pack',    6,  2500,   3600),
    (prod_milk_a,       0, 'Carton',  1,   500,    700),
    (prod_milk_a,       1, 'Pack',    6,  2800,   3900),
    (prod_yogurt_a,     0, 'Cup',     1,   150,    250),
    (prod_bread_a,      0, 'Loaf',    1,   400,    600),
    (prod_pasta_a,      0, 'Pack',    1,   350,    500),
    (prod_sugar_a,      0, 'Bag',     1,   550,    750),
    (prod_oil_a,        0, 'Bottle',  1,   900,   1250),
    (prod_sauce_a,      0, 'Tin',     1,   300,    450),
    (prod_beans_a,      0, 'Tin',     1,   280,    400),
    (prod_tuna_a,       0, 'Tin',     1,   450,    650),
    (prod_eggs_a,       0, 'Tray',    1,  1400,   1800),
    (prod_flour_a,      0, 'Bag',     1,   500,    700),
    (prod_biscuits_a,   0, 'Pack',    1,   250,    400),
    (prod_chips_a,      0, 'Bag',     1,   300,    500),
    (prod_chocolate_a,  0, 'Bar',     1,   200,    350),
    (prod_detergent_a,  0, 'Bag',     1,  1800,   2500),
    (prod_bleach_a,     0, 'Bottle',  1,   400,    600),
    (prod_tissue_a,     0, 'Pack',    1,   700,   1000),
    (prod_matches_a,    0, 'Box',     1,    50,    100),
    (prod_soap_a,       0, 'Bar',     1,   150,    250),
    (prod_toothpaste_a, 0, 'Tube',    1,   400,    650),
    (prod_shampoo_a,    0, 'Bottle',  1,   800,   1200),
    (prod_coffee_a,     0, 'Pack',    1,  1500,   2200),
    (prod_tea_a,        0, 'Box',     1,   600,    900),
    (prod_longname_a,   0, 'Bottle',  1,  2800,   3900)
  on conflict (product_id, unit_level) do nothing;

  -- ─── Products (Depot B — Abidjan, mirror for transfer testing) ───
  insert into products (id, depot_id, category_id, name, photo_url, current_stock_pieces, is_active) values
    (prod_water_b, depot_b_id, cat_beverages, 'Mineral Water 1.5L', 'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=800&h=800&q=80', 200, true),
    (prod_soda_b,  depot_b_id, cat_drinks_sub,'Cola Can 33cl',       'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=800&h=800&q=80',  100, true)
  on conflict (id) do nothing;

  -- Re-apply catalog photos on reset (inserts above are no-ops for existing rows).
  update products set photo_url = 'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=800&h=800&q=80'
    where id in (prod_water_a, prod_water_b);
  update products set photo_url = 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=800&h=800&q=80'
    where id in (prod_soda_a, prod_soda_b);
  update products set photo_url = 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&h=800&q=80'
    where id = prod_rice_a;

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
  -- Products with 0 stock (matches) have no stock_entry / ledger row.
  insert into stock_entries (id, product_id, depot_id, unit_level, quantity_in_unit, quantity_pieces, note, entered_by) values
    (entry_water_a,      prod_water_a,      depot_a_id, 0, 500, 500, 'Initial seed stock', admin_id),
    (entry_soda_a,       prod_soda_a,       depot_a_id, 0, 240, 240, 'Initial seed stock', admin_id),
    (entry_rice_a,       prod_rice_a,       depot_a_id, 0,  80,  80, 'Initial seed stock', admin_id),
    (entry_juice_a,      prod_juice_a,      depot_a_id, 0, 180, 180, 'Initial seed stock', admin_id),
    (entry_milk_a,       prod_milk_a,       depot_a_id, 0,  90,  90, 'Initial seed stock', admin_id),
    (entry_yogurt_a,     prod_yogurt_a,     depot_a_id, 0,  36,  36, 'Initial seed stock', admin_id),
    (entry_bread_a,      prod_bread_a,      depot_a_id, 0,  24,  24, 'Initial seed stock', admin_id),
    (entry_pasta_a,      prod_pasta_a,      depot_a_id, 0, 150, 150, 'Initial seed stock', admin_id),
    (entry_sugar_a,      prod_sugar_a,      depot_a_id, 0,  60,  60, 'Initial seed stock', admin_id),
    (entry_oil_a,        prod_oil_a,        depot_a_id, 0,  40,  40, 'Initial seed stock', admin_id),
    (entry_sauce_a,      prod_sauce_a,      depot_a_id, 0,  70,  70, 'Initial seed stock', admin_id),
    (entry_beans_a,      prod_beans_a,      depot_a_id, 0,  55,  55, 'Initial seed stock', admin_id),
    (entry_tuna_a,       prod_tuna_a,       depot_a_id, 0,  80,  80, 'Initial seed stock', admin_id),
    (entry_eggs_a,       prod_eggs_a,       depot_a_id, 0,  48,  48, 'Initial seed stock', admin_id),
    (entry_flour_a,      prod_flour_a,      depot_a_id, 0,  35,  35, 'Initial seed stock', admin_id),
    (entry_biscuits_a,   prod_biscuits_a,   depot_a_id, 0, 100, 100, 'Initial seed stock', admin_id),
    (entry_chips_a,      prod_chips_a,      depot_a_id, 0,  75,  75, 'Initial seed stock', admin_id),
    (entry_chocolate_a,  prod_chocolate_a,  depot_a_id, 0,  45,  45, 'Initial seed stock', admin_id),
    (entry_detergent_a,  prod_detergent_a,  depot_a_id, 0,  30,  30, 'Initial seed stock', admin_id),
    (entry_bleach_a,     prod_bleach_a,     depot_a_id, 0,  22,  22, 'Initial seed stock', admin_id),
    (entry_tissue_a,     prod_tissue_a,     depot_a_id, 0,  40,  40, 'Initial seed stock', admin_id),
    (entry_soap_a,       prod_soap_a,       depot_a_id, 0, 120, 120, 'Initial seed stock', admin_id),
    (entry_toothpaste_a, prod_toothpaste_a, depot_a_id, 0,  64,  64, 'Initial seed stock', admin_id),
    (entry_shampoo_a,    prod_shampoo_a,    depot_a_id, 0,  28,  28, 'Initial seed stock', admin_id),
    (entry_coffee_a,     prod_coffee_a,     depot_a_id, 0,  20,  20, 'Initial seed stock', admin_id),
    (entry_tea_a,        prod_tea_a,        depot_a_id, 0,   4,   4, 'Initial seed stock', admin_id),
    (entry_longname_a,   prod_longname_a,   depot_a_id, 0,  12,  12, 'Initial seed stock', admin_id),
    (entry_water_b,      prod_water_b,      depot_b_id, 0, 200, 200, 'Initial seed stock', admin_id),
    (entry_soda_b,       prod_soda_b,       depot_b_id, 0, 100, 100, 'Initial seed stock', admin_id)
  on conflict (id) do nothing;

  -- ─── Seed inventory_transactions ledger ──────────────────────
  -- Invariant: SUM(inventory_transactions.quantity_pieces) = products.current_stock_pieces
  -- Must hold immediately after supabase db reset.
  -- One RESTOCK row per seeded product with stock > 0.
  insert into inventory_transactions (depot_id, product_id, quantity_pieces, transaction_type, reference_type, reference_id, created_by, metadata)
  select depot_id, product_id, quantity_pieces, 'RESTOCK', 'stock_entry', id, admin_id, '{"note":"Initial seed stock"}'::jsonb
  from stock_entries
  where id in (
    entry_water_a, entry_soda_a, entry_rice_a,
    entry_juice_a, entry_milk_a, entry_yogurt_a, entry_bread_a, entry_pasta_a,
    entry_sugar_a, entry_oil_a, entry_sauce_a, entry_beans_a, entry_tuna_a,
    entry_eggs_a, entry_flour_a, entry_biscuits_a, entry_chips_a, entry_chocolate_a,
    entry_detergent_a, entry_bleach_a, entry_tissue_a,
    entry_soap_a, entry_toothpaste_a, entry_shampoo_a,
    entry_coffee_a, entry_tea_a, entry_longname_a,
    entry_water_b, entry_soda_b
  )
  and not exists (
    select 1 from inventory_transactions it
    where it.reference_type = 'stock_entry' and it.reference_id = stock_entries.id
  );

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
