-- ================================================================
-- VHM POS — Phase 4 RPC Transaction Tests
-- ================================================================
--
-- Run after: supabase db reset
-- This suite is NOT idempotent. Re-running it on a dirty database will fail.
-- A0 fails early if seed stock/ledger is not at the clean baseline.
-- All tests are DO $$ blocks that RAISE EXCEPTION on failure.
-- A passing run produces no exceptions and one final success message.
--
-- Test sections:
--   A. Inventory drift invariant (baseline)
--   B. complete_sale — happy paths + validation
--   C. process_return — partial + full + rounding
--   D. void_sale — status, stock, payment reversal
--   E. adjust_inventory + restock_product
--   F. create_transfer_draft + complete_transfer
--   G. open_shift + close_shift + reconciliation
--   H. Immutability triggers
--   I. RLS — USING(true) check
-- ================================================================

-- ──────────────────────────────────────────────────────────────
-- SETUP: Test identity (bypass RLS by setting auth.uid via config)
-- ──────────────────────────────────────────────────────────────

-- Set auth.uid to admin for all subsequent RPC calls in this session.
-- This simulates a logged-in admin calling business functions.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
select set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000001', false);

-- B8: session open shift so sale/return/payment RPCs have a valid p_shift_id.
do $qa_shift$
declare
  sid uuid;
begin
  sid := (public.open_shift(
    p_depot_id := '00000000-0000-0000-0001-000000000001',
    p_opening_float_cfa := 0
  )->>'shift_id')::uuid;
  perform set_config('qa.shift_id', sid::text, false);
end;
$qa_shift$;


-- ──────────────────────────────────────────────────────────────
-- SECTION A: Clean seed baseline + inventory drift invariant
-- ──────────────────────────────────────────────────────────────

-- A0: Fail immediately if this is not a fresh seed.
-- Seed.sql ON CONFLICT DO NOTHING does not restore stock after prior test runs.
do $A0$
declare
  water_id     constant uuid := '00000000-0000-0000-0003-000000000001';
  water_stock  numeric;
  water_ledger numeric;
  dirty        text;
begin
  select p.current_stock_pieces, coalesce(it.ledger, 0)
  into water_stock, water_ledger
  from products p
  left join (
    select product_id, sum(quantity_pieces) as ledger
    from inventory_transactions
    group by product_id
  ) it on it.product_id = p.id
  where p.id = water_id;

  if water_stock is null then
    raise exception
      'TEST ENVIRONMENT NOT CLEAN: seeded water product % is missing. Run supabase db reset (or re-apply seed.sql on an empty public schema) before executing the suite.',
      water_id;
  end if;

  if water_stock != 500 or water_ledger != 500 then
    raise exception
      'TEST ENVIRONMENT NOT CLEAN: expected seeded water stock=500 and ledger=500, got stock=% ledger=%. Run supabase db reset before executing the suite. Re-running seed.sql will not restore stock (ON CONFLICT DO NOTHING).',
      water_stock, water_ledger;
  end if;

  -- Other seed products used by later sections (same class of failure as B1)
  select string_agg(format('%s stock=%s ledger=%s (expected %s)', p.id, p.current_stock_pieces, coalesce(it.ledger, 0), e.expected), ', ')
  into dirty
  from (
    values
      ('00000000-0000-0000-0003-000000000002'::uuid, 240::numeric),
      ('00000000-0000-0000-0003-000000000003'::uuid, 80::numeric),
      ('00000000-0000-0000-0003-000000000011'::uuid, 200::numeric),
      ('00000000-0000-0000-0003-000000000012'::uuid, 100::numeric)
  ) as e(id, expected)
  join products p on p.id = e.id
  left join (
    select product_id, sum(quantity_pieces) as ledger
    from inventory_transactions
    group by product_id
  ) it on it.product_id = p.id
  where p.current_stock_pieces != e.expected
     or coalesce(it.ledger, 0) != e.expected;

  if dirty is not null then
    raise exception
      'TEST ENVIRONMENT NOT CLEAN: seed products are not at baseline: %. Run supabase db reset before executing the suite.',
      dirty;
  end if;

  raise notice 'A0 PASS: clean seed baseline (water stock=500, ledger=500, other seed products match)';
end;
$A0$;

do $A$
declare drift_count int;
begin
  select count(*) into drift_count
  from products p
  left join (
    select product_id, sum(quantity_pieces) as ledger
    from inventory_transactions
    group by product_id
  ) it on it.product_id = p.id
  where p.current_stock_pieces != coalesce(it.ledger, 0);

  if drift_count > 0 then
    raise exception 'A1 FAIL: Seed inventory drift — % products out of sync', drift_count;
  end if;
  raise notice 'A1 PASS: Seed inventory ledger has zero drift';
end;
$A$;

-- ──────────────────────────────────────────────────────────────
-- SECTION B: complete_sale
-- ──────────────────────────────────────────────────────────────

-- B1: Walk-in cash sale — happy path
do $B1$
declare
  result      jsonb;
  sale_id     uuid;
  receipt     text;
  stock_after numeric;
  drift_count int;
begin
  -- Admin calling complete_sale for depot A
  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := null,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":3}]'::jsonb,
    p_amount_tendered_cfa := 1200,
    p_display_currency    := 'CFA',
    p_discount_type       := null,
    p_discount_value      := null,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  sale_id := (result->>'sale_id')::uuid;
  receipt  := result->>'receipt_number';

  if sale_id is null then
    raise exception 'B1 FAIL: complete_sale returned no sale_id. Result: %', result;
  end if;

  if not (receipt like 'DKR-%') then
    raise exception 'B1 FAIL: receipt_number format wrong: %', receipt;
  end if;

  -- Verify server computed correct amounts (3 bottles × 350 CFA = 1050 total)
  if (result->>'total_cfa')::numeric != 1050 then
    raise exception 'B1 FAIL: expected total=1050, got %', result->>'total_cfa';
  end if;
  if (result->>'change_given_cfa')::numeric != 150 then
    raise exception 'B1 FAIL: expected change=150, got %', result->>'change_given_cfa';
  end if;
  if (result->>'balance_added_cfa')::numeric != 0 then
    raise exception 'B1 FAIL: expected balance_added=0, got %', result->>'balance_added_cfa';
  end if;

  -- Verify stock reduced by 3 pieces
  select current_stock_pieces into stock_after
  from products where id = '00000000-0000-0000-0003-000000000001';
  if stock_after != 497 then
    raise exception 'B1 FAIL: expected stock=497, got %', stock_after;
  end if;

  -- Verify audit entry
  if not exists (
    select 1 from audit_log
    where action = 'complete_sale' and entity_id = sale_id
  ) then
    raise exception 'B1 FAIL: no audit_log entry for complete_sale';
  end if;

  -- Verify inventory_transactions entry
  if not exists (
    select 1 from inventory_transactions
    where reference_id = sale_id
      and transaction_type = 'SALE'
      and quantity_pieces = -3
  ) then
    raise exception 'B1 FAIL: no inventory_transactions SALE row with qty=-3';
  end if;

  -- Drift check after sale
  select count(*) into drift_count
  from products p
  left join (
    select product_id, sum(quantity_pieces) as ledger
    from inventory_transactions group by product_id
  ) it on it.product_id = p.id
  where p.current_stock_pieces != coalesce(it.ledger, 0);
  if drift_count > 0 then
    raise exception 'B1 FAIL: inventory drift after complete_sale (%)', drift_count;
  end if;

  raise notice 'B1 PASS: walk-in cash sale created, stock correct, audit and ledger consistent';
end;
$B1$;

-- B2: Credit sale with customer — balance created
do $B2$
declare
  result      jsonb;
  sale_id     uuid;
  new_balance numeric;
begin
  -- Insert a test customer (created_by is NOT NULL and FK to staff)
  insert into customers (id, name, phone, balance_owed_cfa, created_by)
  values (
    '00000000-0000-0000-0005-000000000001',
    'Test Customer B2',
    '0000000000',
    0,
    '00000000-0000-0000-0000-000000000001'
  )
  on conflict (id) do nothing;

  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := '00000000-0000-0000-0005-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000002","unit_level":0,"quantity_in_unit":2}]'::jsonb,
    p_amount_tendered_cfa := 0,   -- full credit
    p_display_currency    := 'CFA',
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  sale_id := (result->>'sale_id')::uuid;
  if (result->>'balance_added_cfa')::numeric != 600 then
    raise exception 'B2 FAIL: expected balance_added=600 (2×300), got %', result->>'balance_added_cfa';
  end if;

  select balance_owed_cfa into new_balance
  from customers where id = '00000000-0000-0000-0005-000000000001';
  if new_balance != 600 then
    raise exception 'B2 FAIL: customer balance should be 600, got %', new_balance;
  end if;

  raise notice 'B2 PASS: credit sale created, customer balance = 600';
end;
$B2$;

-- B3: Insufficient stock rejected
do $B3$
declare
  result jsonb;
begin
  begin
    result := public.complete_sale(
      p_depot_id            := '00000000-0000-0000-0001-000000000001',
      p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000003","unit_level":0,"quantity_in_unit":9999}]'::jsonb,
      p_amount_tendered_cfa := 0,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
    raise exception 'B3 FAIL: should have raised INSUFFICIENT_STOCK';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INSUFFICIENT_STOCK%' then
        raise exception 'B3 FAIL: wrong error code: %', sqlerrm;
      end if;
  end;
  raise notice 'B3 PASS: insufficient stock correctly rejected';
end;
$B3$;

-- B4: Walk-in credit sale rejected (no customer)
do $B4$
declare
  result jsonb;
begin
  begin
    result := public.complete_sale(
      p_depot_id            := '00000000-0000-0000-0001-000000000001',
      p_customer_id         := null,
      p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
      p_amount_tendered_cfa := 0   -- no cash = credit, but no customer,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
    raise exception 'B4 FAIL: should have raised CUSTOMER_REQUIRED';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%CUSTOMER_REQUIRED%' then
        raise exception 'B4 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B4 PASS: walk-in credit sale correctly rejected';
end;
$B4$;

-- B5: Idempotency — same key returns same sale
do $B5$
declare
  key     uuid := gen_random_uuid();
  result1 jsonb;
  result2 jsonb;
begin
  result1 := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350,
    p_idempotency_key     := key,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  result2 := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350,
    p_idempotency_key     := key,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  if (result1->>'sale_id') != (result2->>'sale_id') then
    raise exception 'B5 FAIL: idempotency key produced different sale_ids: % vs %',
      result1->>'sale_id', result2->>'sale_id';
  end if;
  if (result2->>'idempotent')::boolean != true then
    raise exception 'B5 FAIL: second call should return idempotent=true';
  end if;

  -- Verify only one sale created with this key
  if (select count(*) from sales where idempotency_key = key) != 1 then
    raise exception 'B5 FAIL: expected exactly 1 sale for idempotency_key, found %',
      (select count(*) from sales where idempotency_key = key);
  end if;

  raise notice 'B5 PASS: idempotency key deduplication works';
end;
$B5$;

-- B6: Discount — flat discount correct
do $B6$
declare
  result jsonb;
begin
  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":10}]'::jsonb,
    p_amount_tendered_cfa := 3000,
    p_discount_type       := 'flat',
    p_discount_value      := 500,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  -- 10×350 = 3500 subtotal, discount=500, total=3000
  if (result->>'total_cfa')::numeric != 3000 then
    raise exception 'B6 FAIL: flat discount total wrong, expected 3000 got %', result->>'total_cfa';
  end if;
  if (result->>'discount_amount_cfa')::numeric != 500 then
    raise exception 'B6 FAIL: discount_amount_cfa wrong, expected 500 got %', result->>'discount_amount_cfa';
  end if;
  raise notice 'B6 PASS: flat discount applied correctly';
end;
$B6$;

-- B7: Duplicate product lines in one cart — aggregate stock check
-- Verifies FIX 2 from migration 024: the per-item stock check must use
-- the cumulative total for each product across all cart lines, so that
-- two lines of the same product that individually fit stock but together
-- exceed it correctly raise INSUFFICIENT_STOCK (not a raw DB constraint).
do $B7$
declare
  prod_id uuid := 'bbbbbbbb-7777-0000-0000-000000000001';
begin
  -- Self-contained test product: 10 pieces
  -- photo_url is NOT NULL (mandatory product photo — do not omit)
  insert into products (id, depot_id, category_id, name, photo_url, current_stock_pieces, is_active)
  values (
    prod_id,
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0002-000000000001',
    'B7 Dup-Line Test Product',
    'https://placehold.co/200x200?text=B7',
    10,
    true
  ) on conflict (id) do update set current_stock_pieces = 10;

  insert into product_units (product_id, unit_level, unit_name, conversion_to_base, cost_price_cfa, selling_price_cfa)
  values (prod_id, 0, 'Unit', 1, 100, 500)
  on conflict (product_id, unit_level) do update set selling_price_cfa = 500;

  -- Insert seed ledger row so drift invariant holds
  delete from inventory_transactions where product_id = prod_id;
  insert into inventory_transactions (
    depot_id, product_id, quantity_pieces, transaction_type,
    reference_type, reference_id, created_by
  ) values (
    '00000000-0000-0000-0001-000000000001',
    prod_id, 10, 'RESTOCK', 'stock_entry',
    '00000000-0000-0000-0004-000000000099',
    '00000000-0000-0000-0000-000000000001'
  );

  -- Two lines of qty=7 each (7+7=14 > 10): each individually passes 10>=7,
  -- but aggregate 14 > 10 must produce INSUFFICIENT_STOCK.
  begin
    perform public.complete_sale(
      p_depot_id            := '00000000-0000-0000-0001-000000000001',
      p_cart_items          := jsonb_build_array(
        jsonb_build_object('product_id', prod_id, 'unit_level', 0, 'quantity_in_unit', 7),
        jsonb_build_object('product_id', prod_id, 'unit_level', 0, 'quantity_in_unit', 7)
      ),
      p_amount_tendered_cfa := 9999,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
    raise exception 'B7 FAIL: duplicate lines with aggregate > stock should have raised INSUFFICIENT_STOCK';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INSUFFICIENT_STOCK%' then
        raise exception 'B7 FAIL: wrong error code: %', sqlerrm;
      end if;
  end;

  -- Stock must be unchanged (no mutation should have occurred)
  if (select current_stock_pieces from products where id = prod_id) != 10 then
    raise exception 'B7 FAIL: stock was mutated despite expected INSUFFICIENT_STOCK';
  end if;

  -- Cleanup
  delete from inventory_transactions where product_id = prod_id;
  delete from product_units where product_id = prod_id;
  delete from products where id = prod_id;

  raise notice 'B7 PASS: duplicate product lines with aggregate > stock → INSUFFICIENT_STOCK, no mutation';
end;
$B7$;

-- B8: Cart iteration order must not change sale correctness for two distinct products.
-- Deterministic product locking is structural (PERFORM … ORDER BY id FOR UPDATE
-- in 20260917000001). A single-session test cannot prove pg_locks acquisition
-- sequence. Optional manual concurrency check: supabase/tests/concurrent_sale_test.sh
do $B8$
declare
  prod_lo     constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  prod_hi     constant uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  depot_id    constant uuid := '00000000-0000-0000-0001-000000000001';
  admin_id    constant uuid := '00000000-0000-0000-0000-000000000001';
  result_desc jsonb;
  result_asc  jsonb;
  sale_desc   uuid;
  sale_asc    uuid;
  stock_lo    numeric;
  stock_hi    numeric;
  drift_count int;
begin
  insert into products (id, depot_id, category_id, name, photo_url, current_stock_pieces, is_active)
  values
    (prod_lo, depot_id, '00000000-0000-0000-0002-000000000001', 'B8 Lock Lo', 'https://placehold.co/200x200?text=B8Lo', 10, true),
    (prod_hi, depot_id, '00000000-0000-0000-0002-000000000001', 'B8 Lock Hi', 'https://placehold.co/200x200?text=B8Hi', 10, true);
  insert into product_units (product_id, unit_level, unit_name, conversion_to_base, cost_price_cfa, selling_price_cfa)
  values
    (prod_lo, 0, 'Piece', 1, 50, 100),
    (prod_hi, 0, 'Piece', 1, 50, 100);
  insert into inventory_transactions (
    depot_id, product_id, quantity_pieces, transaction_type,
    reference_type, reference_id, created_by
  ) values
    (depot_id, prod_lo, 10, 'RESTOCK', 'stock_entry', '00000000-0000-0000-0004-000000000098', admin_id),
    (depot_id, prod_hi, 10, 'RESTOCK', 'stock_entry', '00000000-0000-0000-0004-000000000097', admin_id);

  -- Descending UUID cart order (hi then lo)
  result_desc := public.complete_sale(
    p_depot_id            := depot_id,
    p_cart_items          := jsonb_build_array(
      jsonb_build_object('product_id', prod_hi, 'unit_level', 0, 'quantity_in_unit', 1),
      jsonb_build_object('product_id', prod_lo, 'unit_level', 0, 'quantity_in_unit', 1)
    ),
    p_amount_tendered_cfa := 200,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  sale_desc := (result_desc->>'sale_id')::uuid;
  if sale_desc is null then
    raise exception 'B8 FAIL: descending-cart sale returned no sale_id';
  end if;
  if (result_desc->>'receipt_number') is null or (result_desc->>'receipt_number') not like 'DKR-%' then
    raise exception 'B8 FAIL: descending-cart receipt missing/wrong: %', result_desc->>'receipt_number';
  end if;
  if (result_desc->>'total_cfa')::numeric != 200 then
    raise exception 'B8 FAIL: descending-cart expected total=200, got %', result_desc->>'total_cfa';
  end if;

  -- Ascending UUID cart order (lo then hi)
  result_asc := public.complete_sale(
    p_depot_id            := depot_id,
    p_cart_items          := jsonb_build_array(
      jsonb_build_object('product_id', prod_lo, 'unit_level', 0, 'quantity_in_unit', 1),
      jsonb_build_object('product_id', prod_hi, 'unit_level', 0, 'quantity_in_unit', 1)
    ),
    p_amount_tendered_cfa := 200,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  sale_asc := (result_asc->>'sale_id')::uuid;
  if sale_asc is null then
    raise exception 'B8 FAIL: ascending-cart sale returned no sale_id';
  end if;
  if (result_asc->>'receipt_number') is null or (result_asc->>'receipt_number') not like 'DKR-%' then
    raise exception 'B8 FAIL: ascending-cart receipt missing/wrong: %', result_asc->>'receipt_number';
  end if;
  if (result_asc->>'total_cfa')::numeric != 200 then
    raise exception 'B8 FAIL: ascending-cart expected total=200, got %', result_asc->>'total_cfa';
  end if;

  select current_stock_pieces into stock_lo from products where id = prod_lo;
  select current_stock_pieces into stock_hi from products where id = prod_hi;
  if stock_lo != 8 or stock_hi != 8 then
    raise exception 'B8 FAIL: expected stock 8/8 after two 1-unit sales, got lo=% hi=%', stock_lo, stock_hi;
  end if;

  if (select count(*) from inventory_transactions
      where product_id = prod_lo and transaction_type = 'SALE' and quantity_pieces = -1) != 2 then
    raise exception 'B8 FAIL: expected 2 SALE ledger rows qty=-1 for prod_lo';
  end if;
  if (select count(*) from inventory_transactions
      where product_id = prod_hi and transaction_type = 'SALE' and quantity_pieces = -1) != 2 then
    raise exception 'B8 FAIL: expected 2 SALE ledger rows qty=-1 for prod_hi';
  end if;

  select count(*) into drift_count
  from products p
  left join (
    select product_id, sum(quantity_pieces) as ledger
    from inventory_transactions group by product_id
  ) it on it.product_id = p.id
  where p.id in (prod_lo, prod_hi)
    and p.current_stock_pieces != coalesce(it.ledger, 0);
  if drift_count > 0 then
    raise exception 'B8 FAIL: inventory drift after reverse/forward cart sales';
  end if;

  raise notice 'B8 PASS: descending and ascending two-product carts both succeed; stock and ledger match';
end;
$B8$;

-- ──────────────────────────────────────────────────────────────
-- SECTION C: process_return
-- ──────────────────────────────────────────────────────────────

-- C1: Partial return — refund correct, status partially_returned
do $C1$
declare
  sale_result    jsonb;
  return_result  jsonb;
  v_sale_id      uuid;
  sale_item_id   uuid;
  stock_after    numeric;
  drift_count    int;
begin
  -- Create a fresh sale
  sale_result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":5}]'::jsonb,
    p_amount_tendered_cfa := 1750,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  v_sale_id := (sale_result->>'sale_id')::uuid;

  -- v_sale_id: PL/pgSQL variable name must not match sale_items.sale_id
  select id into sale_item_id from sale_items where sale_items.sale_id = v_sale_id limit 1;

  return_result := public.process_return(
    p_sale_id         := v_sale_id,
    p_items           := jsonb_build_array(jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 2)),
    p_reason          := 'Test partial return',
    p_cash_refund_cfa := 700,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  if (return_result->>'new_sale_status') != 'partially_returned' then
    raise exception 'C1 FAIL: expected partially_returned, got %', return_result->>'new_sale_status';
  end if;
  if (return_result->>'refund_amount_cfa')::numeric != 700 then
    raise exception 'C1 FAIL: expected refund=700 (2×350), got %', return_result->>'refund_amount_cfa';
  end if;
  if (return_result->>'cash_refunded_cfa')::numeric != 700 then
    raise exception 'C1 FAIL: expected cash_refunded=700, got %', return_result->>'cash_refunded_cfa';
  end if;

  -- Stock check: returned 2, so should be +2 from post-sale stock
  select count(*) into drift_count
  from products p
  left join (select product_id, sum(quantity_pieces) as ledger from inventory_transactions group by product_id) it
    on it.product_id = p.id
  where p.current_stock_pieces != coalesce(it.ledger, 0);
  if drift_count > 0 then
    raise exception 'C1 FAIL: inventory drift after return';
  end if;

  raise notice 'C1 PASS: partial return correct, status=partially_returned, ledger consistent';
end;
$C1$;

-- C2: Return on voided sale rejected
do $C2$
declare
  sale_result   jsonb;
  v_sale_id     uuid;
  sale_item_id  uuid;
begin
  sale_result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  v_sale_id := (sale_result->>'sale_id')::uuid;
  perform public.void_sale(p_sale_id := v_sale_id);

  select id into sale_item_id from sale_items where sale_items.sale_id = v_sale_id limit 1;

  begin
    perform public.process_return(
      p_sale_id         := v_sale_id,
      p_items           := jsonb_build_array(jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 1)),
      p_cash_refund_cfa := 350,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
    raise exception 'C2 FAIL: should have raised SALE_VOIDED';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%SALE_VOIDED%' then
        raise exception 'C2 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'C2 PASS: return on voided sale correctly rejected';
end;
$C2$;

-- C3: Multi-return rounding — SUM of refunds = net_line_total_cfa
do $C3$
declare
  sale_result   jsonb;
  v_sale_id     uuid;
  sale_item_id  uuid;
  r1 jsonb; r2 jsonb; r3 jsonb;
  total_refunded numeric;
  net_total      numeric;
begin
  -- 3-unit sale with 100 CFA discount
  -- subtotal = 3×350 = 1050, discount=100, total=950
  -- net_line_total_cfa per item (one item, all to that item) = 950
  sale_result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":3}]'::jsonb,
    p_amount_tendered_cfa := 950,
    p_discount_type       := 'flat',
    p_discount_value      := 100,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  v_sale_id := (sale_result->>'sale_id')::uuid;
  select id into sale_item_id from sale_items where sale_items.sale_id = v_sale_id limit 1;

  -- Get net_line_total_cfa for this item
  select net_line_total_cfa into net_total from sale_items where id = sale_item_id;

  -- Three separate single-unit returns
  r1 := public.process_return(
    p_sale_id := v_sale_id,
    p_items   := jsonb_build_array(jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 1)),
    p_cash_refund_cfa := round(net_total / 3, 2),
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  r2 := public.process_return(
    p_sale_id := v_sale_id,
    p_items   := jsonb_build_array(jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 1)),
    p_cash_refund_cfa := round(net_total / 3, 2),
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  r3 := public.process_return(
    p_sale_id := v_sale_id,
    p_items   := jsonb_build_array(jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 1)),
    p_cash_refund_cfa := net_total - round(net_total / 3, 2) * 2,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  -- Sum all three refunds
  total_refunded :=
    (r1->>'refund_amount_cfa')::numeric +
    (r2->>'refund_amount_cfa')::numeric +
    (r3->>'refund_amount_cfa')::numeric;

  if abs(total_refunded - net_total) > 0.01 then
    raise exception 'C3 FAIL: refund sum mismatch. net_total=%, refunded=%', net_total, total_refunded;
  end if;

  if (r3->>'new_sale_status') != 'returned' then
    raise exception 'C3 FAIL: final return should set status=returned, got %', r3->>'new_sale_status';
  end if;

  raise notice 'C3 PASS: 3 partial returns sum exactly to net_line_total_cfa (%), no rounding leak', net_total;
end;
$C3$;

-- C4: Duplicate sale_item_id in one process_return payload must not
-- double-restore stock. Reject before any ledger write.
do $C4$
declare
  sale_result   jsonb;
  sale_id       uuid;
  sale_item_id  uuid;
  stock_after_sale numeric;
  stock_after_reject numeric;
begin
  sale_result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":2}]'::jsonb,
    p_amount_tendered_cfa := 700,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  sale_id := (sale_result->>'sale_id')::uuid;
  select id into sale_item_id from sale_items where sale_id = sale_id;
  select current_stock_pieces into stock_after_sale
    from products where id = '00000000-0000-0000-0003-000000000001';

  begin
    perform public.process_return(
      p_sale_id := sale_id,
      p_items   := jsonb_build_array(
        jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 2),
        jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 2)
      ),
      p_cash_refund_cfa := 700,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
    raise exception 'C4 FAIL: duplicate sale_item_id payload was accepted';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_INPUT%' then
        raise exception 'C4 FAIL: expected INVALID_INPUT, got %', sqlerrm;
      end if;
  end;

  select current_stock_pieces into stock_after_reject
    from products where id = '00000000-0000-0000-0003-000000000001';
  if stock_after_reject != stock_after_sale then
    raise exception 'C4 FAIL: stock changed after rejected duplicate return. after_sale=%, after_reject=%',
      stock_after_sale, stock_after_reject;
  end if;
  if exists (select 1 from sale_returns where sale_id = sale_id) then
    raise exception 'C4 FAIL: sale_returns row written for rejected duplicate payload';
  end if;

  raise notice 'C4 PASS: duplicate sale_item_id in one return payload rejected; stock unchanged';
end;
$C4$;

-- ──────────────────────────────────────────────────────────────
-- SECTION D: void_sale
-- ──────────────────────────────────────────────────────────────

-- D1: Void a sale — stock restored, payment reversed
do $D1$
declare
  sale_result   jsonb;
  void_result   jsonb;
  sale_id       uuid;
  stock_before  numeric;
  stock_after   numeric;
  drift_count   int;
begin
  select current_stock_pieces into stock_before from products where id = '00000000-0000-0000-0003-000000000003';

  sale_result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000003","unit_level":0,"quantity_in_unit":5}]'::jsonb,
    p_amount_tendered_cfa := 90000,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  sale_id := (sale_result->>'sale_id')::uuid;

  void_result := public.void_sale(p_sale_id := sale_id, p_reason := 'Test void');

  select current_stock_pieces into stock_after from products where id = '00000000-0000-0000-0003-000000000003';
  if stock_after != stock_before then
    raise exception 'D1 FAIL: stock not restored after void. before=%, after=%', stock_before, stock_after;
  end if;

  if (select status from sales where id = sale_id) != 'voided' then
    raise exception 'D1 FAIL: sale status should be voided';
  end if;

  -- Two audit entries: void_sale + (no sale_payment for walk-in, so just void_sale)
  if not exists (select 1 from audit_log where action = 'void_sale' and entity_id = sale_id) then
    raise exception 'D1 FAIL: missing void_sale audit entry';
  end if;

  -- Drift check
  select count(*) into drift_count
  from products p
  left join (select product_id, sum(quantity_pieces) as ledger from inventory_transactions group by product_id) it
    on it.product_id = p.id
  where p.current_stock_pieces != coalesce(it.ledger, 0);
  if drift_count > 0 then
    raise exception 'D1 FAIL: inventory drift after void';
  end if;

  raise notice 'D1 PASS: void restores stock, sets status=voided, ledger consistent';
end;
$D1$;

-- D2: Double void rejected
do $D2$
declare
  sale_id uuid;
begin
  sale_id := (public.complete_sale(
    p_depot_id := '00000000-0000-0000-0001-000000000001',
    p_cart_items := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350,
    p_shift_id := current_setting('qa.shift_id')::uuid
  )->>'sale_id')::uuid;

  perform public.void_sale(p_sale_id := sale_id);

  begin
    perform public.void_sale(p_sale_id := sale_id);
    raise exception 'D2 FAIL: double void should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%SALE_VOIDED%' then
        raise exception 'D2 FAIL: wrong error on double void: %', sqlerrm;
      end if;
  end;
  raise notice 'D2 PASS: double void correctly rejected with SALE_VOIDED';
end;
$D2$;

-- ──────────────────────────────────────────────────────────────
-- SECTION E: adjust_inventory + restock_product
-- ──────────────────────────────────────────────────────────────

-- E1: Adjust inventory (DAMAGE) — stock reduced
do $E1$
declare
  stock_before numeric;
  result       jsonb;
  drift_count  int;
begin
  select current_stock_pieces into stock_before from products where id = '00000000-0000-0000-0003-000000000001';

  result := public.adjust_inventory(
    p_product_id      := '00000000-0000-0000-0003-000000000001',
    p_adjustment_type := 'DAMAGE',
    p_quantity_pieces := -10,
    p_reason          := 'Broken bottles'
  );

  if (result->>'new_stock_pieces')::numeric != stock_before - 10 then
    raise exception 'E1 FAIL: expected stock %, got %', stock_before - 10, result->>'new_stock_pieces';
  end if;

  select count(*) into drift_count
  from products p
  left join (select product_id, sum(quantity_pieces) as ledger from inventory_transactions group by product_id) it
    on it.product_id = p.id
  where p.current_stock_pieces != coalesce(it.ledger, 0);
  if drift_count > 0 then raise exception 'E1 FAIL: inventory drift after adjustment'; end if;

  raise notice 'E1 PASS: DAMAGE adjustment correct, ledger consistent';
end;
$E1$;

-- E2: Negative result rejected
do $E2$
begin
  begin
    perform public.adjust_inventory(
      p_product_id      := '00000000-0000-0000-0003-000000000001',
      p_adjustment_type := 'DAMAGE',
      p_quantity_pieces := -99999
    );
    raise exception 'E2 FAIL: should have rejected negative result';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%ADJUSTMENT_NEGATIVE_RESULT%' then
        raise exception 'E2 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'E2 PASS: negative stock result correctly rejected';
end;
$E2$;

-- E3: Restock product
do $E3$
declare
  stock_before numeric;
  result       jsonb;
  drift_count  int;
begin
  select current_stock_pieces into stock_before from products where id = '00000000-0000-0000-0003-000000000001';

  -- Signature is (uuid, smallint, numeric, text). Named calls need
  -- explicit casts: integer does not resolve to smallint/numeric.
  result := public.restock_product(
    p_product_id       := '00000000-0000-0000-0003-000000000001'::uuid,
    p_unit_level       := 1::smallint,   -- Case (12 bottles)
    p_quantity_in_unit := 5::numeric,    -- 5 cases = 60 pieces
    p_note             := 'Supplier delivery'
  );

  if (result->>'quantity_pieces')::numeric != 60 then
    raise exception 'E3 FAIL: expected 60 pieces (5 cases × 12), got %', result->>'quantity_pieces';
  end if;
  if (result->>'new_stock_pieces')::numeric != stock_before + 60 then
    raise exception 'E3 FAIL: new_stock_pieces wrong';
  end if;

  select count(*) into drift_count
  from products p
  left join (select product_id, sum(quantity_pieces) as ledger from inventory_transactions group by product_id) it
    on it.product_id = p.id
  where p.current_stock_pieces != coalesce(it.ledger, 0);
  if drift_count > 0 then raise exception 'E3 FAIL: inventory drift after restock'; end if;

  raise notice 'E3 PASS: restock adds 60 pieces, ledger consistent';
end;
$E3$;

-- ──────────────────────────────────────────────────────────────
-- SECTION F: create_transfer_draft + complete_transfer
-- ──────────────────────────────────────────────────────────────

-- F1: Create and complete a transfer
do $F1$
declare
  draft_result    jsonb;
  complete_result jsonb;
  transfer_id     uuid;
  src_before      numeric;
  dst_before      numeric;
  drift_count     int;
begin
  select current_stock_pieces into src_before from products where id = '00000000-0000-0000-0003-000000000001';
  select current_stock_pieces into dst_before from products where id = '00000000-0000-0000-0003-000000000011';

  draft_result := public.create_transfer_draft(
    p_from_depot_id := '00000000-0000-0000-0001-000000000001',
    p_to_depot_id   := '00000000-0000-0000-0001-000000000002',
    p_items         := '[{"from_product_id":"00000000-0000-0000-0003-000000000001","to_product_id":"00000000-0000-0000-0003-000000000011","unit_level":0,"quantity_in_unit":20}]'::jsonb,
    p_note          := 'Test transfer'
  );
  transfer_id := (draft_result->>'transfer_id')::uuid;

  complete_result := public.complete_transfer(p_transfer_id := transfer_id);

  if (select status from stock_transfers where id = transfer_id) != 'completed' then
    raise exception 'F1 FAIL: transfer not marked completed';
  end if;

  if (select current_stock_pieces from products where id = '00000000-0000-0000-0003-000000000001') != src_before - 20 then
    raise exception 'F1 FAIL: source stock not reduced by 20';
  end if;
  if (select current_stock_pieces from products where id = '00000000-0000-0000-0003-000000000011') != dst_before + 20 then
    raise exception 'F1 FAIL: destination stock not increased by 20';
  end if;

  -- Verify TRANSFER_OUT + TRANSFER_IN in ledger
  if not exists (select 1 from inventory_transactions where reference_id = transfer_id and transaction_type = 'TRANSFER_OUT') then
    raise exception 'F1 FAIL: missing TRANSFER_OUT ledger entry';
  end if;
  if not exists (select 1 from inventory_transactions where reference_id = transfer_id and transaction_type = 'TRANSFER_IN') then
    raise exception 'F1 FAIL: missing TRANSFER_IN ledger entry';
  end if;

  select count(*) into drift_count
  from products p
  left join (select product_id, sum(quantity_pieces) as ledger from inventory_transactions group by product_id) it
    on it.product_id = p.id
  where p.current_stock_pieces != coalesce(it.ledger, 0);
  if drift_count > 0 then raise exception 'F1 FAIL: inventory drift after transfer'; end if;

  raise notice 'F1 PASS: transfer creates/completes, stock moved, TRANSFER_IN/OUT ledger entries, zero drift';
end;
$F1$;

-- F2: Double-complete rejected
do $F2$
declare
  transfer_id uuid;
begin
  transfer_id := (public.create_transfer_draft(
    p_from_depot_id := '00000000-0000-0000-0001-000000000001',
    p_to_depot_id   := '00000000-0000-0000-0001-000000000002',
    p_items         := '[{"from_product_id":"00000000-0000-0000-0003-000000000001","to_product_id":"00000000-0000-0000-0003-000000000011","unit_level":0,"quantity_in_unit":1}]'::jsonb
  )->>'transfer_id')::uuid;
  perform public.complete_transfer(p_transfer_id := transfer_id);
  begin
    perform public.complete_transfer(p_transfer_id := transfer_id);
    raise exception 'F2 FAIL: double-complete should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%TRANSFER_ALREADY_COMPLETED%' then
        raise exception 'F2 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'F2 PASS: double-complete correctly rejected';
end;
$F2$;

-- ──────────────────────────────────────────────────────────────
-- SECTION G: open_shift + close_shift
-- ──────────────────────────────────────────────────────────────

-- G1: Open and close a shift with correct reconciliation
do $G1$
declare
  shift_result  jsonb;
  close_result  jsonb;
  shift_id      uuid;
  sale_result   jsonb;
begin
  shift_result := public.open_shift(
    p_depot_id          := '00000000-0000-0000-0001-000000000001',
    p_opening_float_cfa := 10000
  );
  shift_id := (shift_result->>'shift_id')::uuid;

  -- Sale during this shift: 2 bottles × 350 = 700 cash
  sale_result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":2}]'::jsonb,
    p_amount_tendered_cfa := 700,
    p_shift_id            := shift_id
  );

  close_result := public.close_shift(
    p_shift_id        := shift_id,
    p_actual_cash_cfa := 10700   -- float 10000 + 700 sale
  );

  if (close_result->>'expected_cash_cfa')::numeric != 10700 then
    raise exception 'G1 FAIL: expected_cash should be 10700, got %', close_result->>'expected_cash_cfa';
  end if;
  if (close_result->>'discrepancy_cfa')::numeric != 0 then
    raise exception 'G1 FAIL: expected zero discrepancy, got %', close_result->>'discrepancy_cfa';
  end if;
  if (select status from shifts where id = shift_id) != 'closed' then
    raise exception 'G1 FAIL: shift should be closed';
  end if;

  raise notice 'G1 PASS: shift reconciliation correct, expected=10700, discrepancy=0';
end;
$G1$;

-- G2: open_shift rejects negative opening_float_cfa
do $G2$
begin
  begin
    perform public.open_shift(
      p_depot_id          := '00000000-0000-0000-0001-000000000001',
      p_opening_float_cfa := -100
    );
    raise exception 'G2 FAIL: negative opening_float should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_AMOUNT%' then
        raise exception 'G2 FAIL: expected INVALID_AMOUNT, got: %', sqlerrm;
      end if;
  end;
  raise notice 'G2 PASS: negative opening_float_cfa correctly rejected';
end;
$G2$;

-- G3: close_shift rejects negative actual_cash_cfa
do $G3$
declare
  shift_id uuid;
begin
  shift_id := (public.open_shift(
    p_depot_id          := '00000000-0000-0000-0001-000000000001',
    p_opening_float_cfa := 5000
  )->>'shift_id')::uuid;

  begin
    perform public.close_shift(
      p_shift_id        := shift_id,
      p_actual_cash_cfa := -1
    );
    raise exception 'G3 FAIL: negative actual_cash should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_AMOUNT%' then
        raise exception 'G3 FAIL: expected INVALID_AMOUNT, got: %', sqlerrm;
      end if;
  end;

  -- Close properly to clean up
  perform public.close_shift(p_shift_id := shift_id, p_actual_cash_cfa := 5000);

  raise notice 'G3 PASS: negative actual_cash_cfa correctly rejected';
end;
$G3$;

-- G4: close_shift on already-closed shift → SHIFT_NOT_OPEN
do $G4$
declare
  shift_id uuid;
begin
  shift_id := (public.open_shift(
    p_depot_id          := '00000000-0000-0000-0001-000000000001',
    p_opening_float_cfa := 0
  )->>'shift_id')::uuid;

  -- First close succeeds
  perform public.close_shift(p_shift_id := shift_id, p_actual_cash_cfa := 0);

  if (select status from shifts where id = shift_id) != 'closed' then
    raise exception 'G4 FAIL: shift should be closed after first close_shift';
  end if;

  -- Second close must be rejected
  begin
    perform public.close_shift(p_shift_id := shift_id, p_actual_cash_cfa := 0);
    raise exception 'G4 FAIL: repeated close_shift should raise SHIFT_NOT_OPEN';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%SHIFT_NOT_OPEN%' then
        raise exception 'G4 FAIL: expected SHIFT_NOT_OPEN, got: %', sqlerrm;
      end if;
  end;

  raise notice 'G4 PASS: repeated close_shift correctly rejected with SHIFT_NOT_OPEN';
end;
$G4$;

-- ──────────────────────────────────────────────────────────────
-- SECTION H: Immutability triggers
-- ──────────────────────────────────────────────────────────────

-- H1: Attempt to UPDATE sale_items.unit_price_cfa → rejected
do $H1$
declare
  v_sale_id    uuid;
  sale_item_id uuid;
begin
  v_sale_id := (public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350,
    p_shift_id := current_setting('qa.shift_id')::uuid
  )->>'sale_id')::uuid;

  select id into sale_item_id from sale_items where sale_items.sale_id = v_sale_id limit 1;

  begin
    -- Attempt privileged UPDATE via direct SQL
    update sale_items set unit_price_cfa = 999999 where id = sale_item_id;
    raise exception 'H1 FAIL: should have been blocked by immutability trigger';
  exception
    when sqlstate '23000' then null;  -- Expected: trigger raises this code
    when others then
      raise exception 'H1 FAIL: unexpected error %: %', sqlstate, sqlerrm;
  end;
  raise notice 'H1 PASS: sale_items.unit_price_cfa is immutable (trigger fired)';
end;
$H1$;

-- H2: Attempt to UPDATE sales.total_cfa → rejected
do $H2$
declare
  sale_id uuid;
begin
  sale_id := (public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350,
    p_shift_id := current_setting('qa.shift_id')::uuid
  )->>'sale_id')::uuid;

  begin
    update sales set total_cfa = 1 where id = sale_id;
    raise exception 'H2 FAIL: should have been blocked by immutability trigger';
  exception
    when sqlstate '23000' then null;
    when others then
      raise exception 'H2 FAIL: unexpected error %: %', sqlstate, sqlerrm;
  end;
  raise notice 'H2 PASS: sales.total_cfa is immutable (trigger fired)';
end;
$H2$;

-- H3: sale status IS mutable (void/return transitions)
do $H3$
declare
  sale_id uuid;
begin
  sale_id := (public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350,
    p_shift_id := current_setting('qa.shift_id')::uuid
  )->>'sale_id')::uuid;

  -- Void should change status without triggering immutability error
  perform public.void_sale(p_sale_id := sale_id);

  if (select status from sales where id = sale_id) != 'voided' then
    raise exception 'H3 FAIL: status should be voided after void_sale';
  end if;
  raise notice 'H3 PASS: sale.status is mutable (void transition works)';
end;
$H3$;

-- ──────────────────────────────────────────────────────────────
-- SECTION I: RLS — No USING(true) policies
-- ──────────────────────────────────────────────────────────────

do $I1$
declare
  broad_count int;
begin
  select count(*) into broad_count
  from pg_policies
  where qual = 'true'
    or with_check = 'true';

  if broad_count > 0 then
    raise exception 'I1 FAIL: % broad USING(true) or WITH CHECK(true) policies found! Run: SELECT * FROM pg_policies WHERE qual = ''true''', broad_count;
  end if;
  raise notice 'I1 PASS: Zero broad USING(true) policies in schema';
end;
$I1$;

-- ──────────────────────────────────────────────────────────────
-- SECTION J: Customer Management (Phase 6)
-- ──────────────────────────────────────────────────────────────
--
-- Tests cover:
--   J1:  create_customer — valid creation (cashier/admin role)
--   J2:  create_customer — empty name → INVALID_INPUT
--   J3:  create_customer — audit row created
--   J4:  update_customer — name/phone/address updated, balance unchanged
--   J5:  update_customer — empty name → INVALID_INPUT
--   J6:  deactivate_customer — admin succeeds; cashier blocked
--   J7:  deactivate_customer — balance and historical records preserved
--   J8:  reactivate_customer — admin succeeds, is_active restored
--   J9:  complete_sale with inactive customer → CUSTOMER_NOT_FOUND (inactive)
--   J10: record_payment — inactive customer with balance may still pay (lifecycle policy)
--   J11: record_payment — valid payment reduces balance, audit created
--   J12: record_payment — amount = 0 → INVALID_AMOUNT
--   J13: record_payment — amount > balance → PAYMENT_EXCEEDS_BALANCE
--   J14: record_payment — payment_type = 'customer_payment', sale_id = NULL
--   J15: Balance reconciliation — credit + payment = correct net balance
--   J16: Payments RLS policy — customer_payment policy exists and is depot-scoped
--   J17: update_customer does NOT modify balance_owed_cfa
--   J18: Reactivated customer is eligible for new sales
-- ──────────────────────────────────────────────────────────────

-- J1: create_customer — valid creation
do $J1$
declare
  result     jsonb;
  cust_id    uuid;
begin
  result := public.create_customer(
    p_name    := 'Fatou Diallo',
    p_phone   := '+221 77 111 2222',
    p_address := 'Dakar, Plateau'
  );

  cust_id := (result->>'id')::uuid;

  if cust_id is null then
    raise exception 'J1 FAIL: create_customer returned null id';
  end if;
  if result->>'name' != 'Fatou Diallo' then
    raise exception 'J1 FAIL: name mismatch: %', result->>'name';
  end if;
  if (result->>'balance_owed_cfa')::numeric != 0 then
    raise exception 'J1 FAIL: balance should be 0 at creation, got %', result->>'balance_owed_cfa';
  end if;
  if (result->>'is_active')::boolean != true then
    raise exception 'J1 FAIL: new customer should be active';
  end if;

  -- Verify row in DB
  if not exists (select 1 from customers where id = cust_id and is_active = true and balance_owed_cfa = 0) then
    raise exception 'J1 FAIL: customer row not found in DB with expected state';
  end if;

  raise notice 'J1 PASS: create_customer created active customer with zero balance';
end;
$J1$;

-- J2: create_customer — empty name → INVALID_INPUT
do $J2$
begin
  begin
    perform public.create_customer(p_name := '');
    raise exception 'J2 FAIL: empty name should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_INPUT%' then
        raise exception 'J2 FAIL: expected INVALID_INPUT, got: %', sqlerrm;
      end if;
  end;

  begin
    perform public.create_customer(p_name := null);
    raise exception 'J2 FAIL: null name should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_INPUT%' then
        raise exception 'J2 FAIL: expected INVALID_INPUT for null name, got: %', sqlerrm;
      end if;
  end;

  raise notice 'J2 PASS: empty/null name correctly rejected with INVALID_INPUT';
end;
$J2$;

-- J3: create_customer — audit row created
do $J3$
declare
  result      jsonb;
  cust_id     uuid;
  audit_count int;
begin
  result  := public.create_customer(p_name := 'Moussa Diop Audit');
  cust_id := (result->>'id')::uuid;

  select count(*) into audit_count
  from audit_log
  where action = 'create_customer'
    and entity_type = 'customer'
    and entity_id = cust_id;

  if audit_count = 0 then
    raise exception 'J3 FAIL: no audit row found for create_customer';
  end if;

  raise notice 'J3 PASS: create_customer writes audit row';
end;
$J3$;

-- J4: update_customer — name/phone/address updated; balance unchanged
do $J4$
declare
  result      jsonb;
  cust_id     uuid;
  old_balance numeric;
begin
  -- Create customer with initial state
  result   := public.create_customer(p_name := 'Ibrahim Sow', p_phone := '77-000-0000');
  cust_id  := (result->>'id')::uuid;
  old_balance := (result->>'balance_owed_cfa')::numeric;

  -- Update name/phone/address
  result := public.update_customer(
    p_customer_id := cust_id,
    p_name        := 'Ibrahim Sow Updated',
    p_phone       := '77-999-9999',
    p_address     := '123 Rue de la Paix'
  );

  if result->>'name' != 'Ibrahim Sow Updated' then
    raise exception 'J4 FAIL: name not updated, got: %', result->>'name';
  end if;
  if result->>'phone' != '77-999-9999' then
    raise exception 'J4 FAIL: phone not updated, got: %', result->>'phone';
  end if;
  if result->>'address' != '123 Rue de la Paix' then
    raise exception 'J4 FAIL: address not updated, got: %', result->>'address';
  end if;

  -- Balance must be unchanged
  if (result->>'balance_owed_cfa')::numeric != old_balance then
    raise exception 'J4 FAIL: update_customer modified balance_owed_cfa (should not have)';
  end if;

  -- Verify in DB
  if not exists (
    select 1 from customers
    where id = cust_id
      and name = 'Ibrahim Sow Updated'
      and balance_owed_cfa = old_balance
  ) then
    raise exception 'J4 FAIL: DB state does not match expected after update';
  end if;

  raise notice 'J4 PASS: update_customer updates name/phone/address and preserves balance';
end;
$J4$;

-- J5: update_customer — empty name → INVALID_INPUT
do $J5$
declare
  cust_id uuid;
begin
  cust_id := ((public.create_customer(p_name := 'Temp Name J5'))->>'id')::uuid;

  begin
    perform public.update_customer(
      p_customer_id := cust_id,
      p_name        := ''
    );
    raise exception 'J5 FAIL: empty name should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_INPUT%' then
        raise exception 'J5 FAIL: expected INVALID_INPUT, got: %', sqlerrm;
      end if;
  end;

  raise notice 'J5 PASS: update_customer rejects empty name with INVALID_INPUT';
end;
$J5$;

-- J6: deactivate_customer — admin succeeds
do $J6$
declare
  result  jsonb;
  cust_id uuid;
begin
  cust_id := ((public.create_customer(p_name := 'Ahmed Ba Deactivate'))->>'id')::uuid;

  result := public.deactivate_customer(p_customer_id := cust_id, p_reason := 'Test J6');

  if (result->>'is_active')::boolean != false then
    raise exception 'J6 FAIL: is_active should be false after deactivation';
  end if;
  if result->>'deactivated_at' is null then
    raise exception 'J6 FAIL: deactivated_at should be set';
  end if;
  if (result->>'already_inactive')::boolean != false then
    raise exception 'J6 FAIL: already_inactive should be false for fresh deactivation';
  end if;

  -- Verify in DB
  if not exists (
    select 1 from customers
    where id = cust_id and is_active = false and deactivated_at is not null
  ) then
    raise exception 'J6 FAIL: DB not showing inactive state';
  end if;

  -- Audit row must exist
  if not exists (
    select 1 from audit_log
    where action = 'deactivate_customer' and entity_id = cust_id
  ) then
    raise exception 'J6 FAIL: no audit row for deactivate_customer';
  end if;

  raise notice 'J6 PASS: deactivate_customer sets is_active=false with audit';
end;
$J6$;

-- J7: deactivate_customer — balance and historical sale records preserved
do $J7$
declare
  result       jsonb;
  cust_id      uuid;
  bal_before   numeric;
  sale_id      uuid;
begin
  -- Create customer and add balance via a credit sale
  cust_id := ((public.create_customer(p_name := 'Balance Preserved J7'))->>'id')::uuid;

  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := cust_id,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":2}]'::jsonb,
    p_amount_tendered_cfa := 0   -- full credit,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  sale_id := (result->>'sale_id')::uuid;

  select balance_owed_cfa into bal_before from customers where id = cust_id;

  -- Deactivate
  perform public.deactivate_customer(p_customer_id := cust_id);

  -- Balance must be unchanged after deactivation
  if (select balance_owed_cfa from customers where id = cust_id) != bal_before then
    raise exception 'J7 FAIL: balance changed after deactivation (should be preserved)';
  end if;

  -- Historical sale still exists
  if not exists (select 1 from sales where id = sale_id and customer_id = cust_id) then
    raise exception 'J7 FAIL: historical sale was removed after deactivation (should be preserved)';
  end if;

  raise notice 'J7 PASS: deactivation preserves balance (%) and historical sale', bal_before;
end;
$J7$;

-- J8: reactivate_customer — admin succeeds, is_active restored
do $J8$
declare
  result  jsonb;
  cust_id uuid;
begin
  cust_id := ((public.create_customer(p_name := 'Reactivate Test J8'))->>'id')::uuid;

  -- Deactivate first
  perform public.deactivate_customer(p_customer_id := cust_id);
  if (select is_active from customers where id = cust_id) != false then
    raise exception 'J8 FAIL: setup: customer not inactive';
  end if;

  -- Reactivate
  result := public.reactivate_customer(p_customer_id := cust_id);

  if (result->>'is_active')::boolean != true then
    raise exception 'J8 FAIL: is_active should be true after reactivation';
  end if;
  if (result->>'already_active')::boolean != false then
    raise exception 'J8 FAIL: already_active should be false for fresh reactivation';
  end if;

  -- Verify in DB: deactivated_at cleared
  if not exists (
    select 1 from customers
    where id = cust_id and is_active = true and deactivated_at is null
  ) then
    raise exception 'J8 FAIL: DB not showing active state or deactivated_at not cleared';
  end if;

  raise notice 'J8 PASS: reactivate_customer restores is_active=true and clears deactivated_at';
end;
$J8$;

-- J9: complete_sale with inactive customer → CUSTOMER_NOT_FOUND (reason: customer_is_inactive)
do $J9$
declare
  cust_id uuid;
begin
  cust_id := ((public.create_customer(p_name := 'Inactive POS Test J9'))->>'id')::uuid;
  perform public.deactivate_customer(p_customer_id := cust_id);

  begin
    perform public.complete_sale(
      p_depot_id            := '00000000-0000-0000-0001-000000000001',
      p_customer_id         := cust_id,
      p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
      p_amount_tendered_cfa := 0   -- credit sale,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
    raise exception 'J9 FAIL: inactive customer should be rejected for new sale';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%CUSTOMER_NOT_FOUND%' then
        raise exception 'J9 FAIL: expected CUSTOMER_NOT_FOUND, got: %', sqlerrm;
      end if;
      -- Check reason field
      if sqlerrm not like '%customer_is_inactive%' then
        raise exception 'J9 FAIL: expected reason=customer_is_inactive in error, got: %', sqlerrm;
      end if;
  end;

  raise notice 'J9 PASS: inactive customer correctly rejected for new sale with CUSTOMER_NOT_FOUND';
end;
$J9$;

-- J10: record_payment — inactive customer with outstanding balance may still pay
-- (Lifecycle policy: reactivation NOT required to record existing debt payment)
do $J10$
declare
  cust_id      uuid;
  bal_before   numeric;
  result       jsonb;
  bal_after    numeric;
begin
  -- Create customer, add credit via sale, then deactivate
  cust_id := ((public.create_customer(p_name := 'Payment Inactive J10'))->>'id')::uuid;

  perform public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := cust_id,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":2}]'::jsonb,
    p_amount_tendered_cfa := 0   -- full credit,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  select balance_owed_cfa into bal_before from customers where id = cust_id;

  if bal_before <= 0 then
    raise exception 'J10 FAIL: setup: expected positive balance, got %', bal_before;
  end if;

  -- Deactivate customer
  perform public.deactivate_customer(p_customer_id := cust_id);

  if (select is_active from customers where id = cust_id) != false then
    raise exception 'J10 FAIL: setup: customer not inactive';
  end if;

  -- Record payment against inactive customer — must succeed without error
  result := public.record_payment(
    p_customer_id := cust_id,
    p_amount_cfa  := bal_before   -- pay full balance,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  bal_after := (result->>'new_balance_owed_cfa')::numeric;

  if bal_after != 0 then
    raise exception 'J10 FAIL: expected new_balance=0 after full payment, got %', bal_after;
  end if;

  -- DB balance must match
  if (select balance_owed_cfa from customers where id = cust_id) != 0 then
    raise exception 'J10 FAIL: DB balance not updated after payment on inactive customer';
  end if;

  raise notice 'J10 PASS: inactive customer (balance %) can receive payment without reactivation', bal_before;
end;
$J10$;

-- J11: record_payment — valid payment reduces balance; payment_type correct
do $J11$
declare
  cust_id      uuid;
  result       jsonb;
  payment_id   uuid;
  pmt_type     text;
  pmt_sale_id  uuid;
begin
  cust_id := ((public.create_customer(p_name := 'Payment Valid J11'))->>'id')::uuid;

  -- Build up a balance
  perform public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := cust_id,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":3}]'::jsonb,
    p_amount_tendered_cfa := 0,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  result     := public.record_payment(p_customer_id := cust_id, p_amount_cfa := 100,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  payment_id := (result->>'payment_id')::uuid;

  -- Verify payment row
  select payment_type, sale_id into pmt_type, pmt_sale_id
  from payments where id = payment_id;

  if pmt_type != 'customer_payment' then
    raise exception 'J11 FAIL: payment_type should be customer_payment, got %', pmt_type;
  end if;
  if pmt_sale_id is not null then
    raise exception 'J11 FAIL: sale_id should be NULL for customer_payment (pooled model)';
  end if;

  -- Audit row must exist
  if not exists (
    select 1 from audit_log where action = 'record_payment' and entity_id = payment_id
  ) then
    raise exception 'J11 FAIL: no audit row for record_payment';
  end if;

  raise notice 'J11 PASS: record_payment creates customer_payment with sale_id=NULL and audit row';
end;
$J11$;

-- J12: record_payment — amount = 0 → INVALID_AMOUNT
do $J12$
declare
  cust_id uuid;
begin
  cust_id := ((public.create_customer(p_name := 'Zero Payment J12'))->>'id')::uuid;

  begin
    perform public.record_payment(p_customer_id := cust_id, p_amount_cfa := 0,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
    raise exception 'J12 FAIL: zero amount should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_AMOUNT%' then
        raise exception 'J12 FAIL: expected INVALID_AMOUNT, got: %', sqlerrm;
      end if;
  end;

  raise notice 'J12 PASS: record_payment rejects amount=0 with INVALID_AMOUNT';
end;
$J12$;

-- J13: record_payment — amount > balance → PAYMENT_EXCEEDS_BALANCE
do $J13$
declare
  cust_id uuid;
begin
  cust_id := ((public.create_customer(p_name := 'Exceeds Balance J13'))->>'id')::uuid;
  -- Customer has zero balance

  begin
    perform public.record_payment(p_customer_id := cust_id, p_amount_cfa := 5000,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
    raise exception 'J13 FAIL: payment exceeding balance should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%PAYMENT_EXCEEDS_BALANCE%' then
        raise exception 'J13 FAIL: expected PAYMENT_EXCEEDS_BALANCE, got: %', sqlerrm;
      end if;
  end;

  raise notice 'J13 PASS: record_payment correctly rejects amount > balance';
end;
$J13$;

-- J14: Balance reconciliation — credit sale + record_payment = correct net balance
do $J14$
declare
  cust_id      uuid;
  result       jsonb;
  balance_1    numeric;
  balance_2    numeric;
  expected_net numeric;
begin
  cust_id := ((public.create_customer(p_name := 'Balance Reconcile J14'))->>'id')::uuid;

  -- Credit sale: 3 × water (350 CFA each) = 1050 CFA credit
  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := cust_id,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":3}]'::jsonb,
    p_amount_tendered_cfa := 0,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  balance_1 := (result->>'balance_added_cfa')::numeric;

  -- Partial payment
  result    := public.record_payment(p_customer_id := cust_id, p_amount_cfa := 500,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  balance_2 := (result->>'new_balance_owed_cfa')::numeric;

  expected_net := balance_1 - 500;

  if balance_2 != expected_net then
    raise exception 'J14 FAIL: expected net balance %, got %', expected_net, balance_2;
  end if;

  if (select balance_owed_cfa from customers where id = cust_id) != expected_net then
    raise exception 'J14 FAIL: DB balance does not match expected %', expected_net;
  end if;

  raise notice 'J14 PASS: credit(%) + payment(500) = net balance(%) is correct', balance_1, expected_net;
end;
$J14$;

-- J15: Inventory drift check after all J-section mutations
do $J15$
declare drift_count int;
begin
  select count(*) into drift_count
  from products p
  left join (
    select product_id, sum(quantity_pieces) as ledger
    from inventory_transactions
    group by product_id
  ) it on it.product_id = p.id
  where p.current_stock_pieces != coalesce(it.ledger, 0);

  if drift_count > 0 then
    raise exception 'J15 FAIL: inventory drift after Phase 6 J-section tests — % products out of sync', drift_count;
  end if;
  raise notice 'J15 PASS: zero inventory drift after all Phase 6 customer/payment tests';
end;
$J15$;

-- J16: Payments RLS — narrowed cashier policy exists and is depot-scoped
-- Verifies the policy definition was created correctly by migration 025.
-- Full depot isolation runtime test requires switching to a cashier identity
-- (not possible in this single-identity test runner). The policy definition
-- is verified here; runtime behavior is validated against the DB constraints.
do $J16$
declare
  policy_count int;
  policy_qual  text;
begin
  select count(*) into policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'payments'
    and policyname = 'payments_select_cashier';

  if policy_count = 0 then
    raise exception 'J16 FAIL: payments_select_cashier policy not found';
  end if;

  select qual into policy_qual
  from pg_policies
  where schemaname = 'public'
    and tablename = 'payments'
    and policyname = 'payments_select_cashier';

  -- Policy must reference depot isolation (not just broad customer_payment access)
  if policy_qual like '%payment_type = ''customer_payment''%'
     and policy_qual not like '%get_current_staff_depot_id%' then
    raise exception 'J16 FAIL: cashier policy still has broad customer_payment access (missing depot isolation)';
  end if;

  raise notice 'J16 PASS: payments_select_cashier policy exists with depot isolation for customer_payment';
end;
$J16$;

-- J17: update_customer does NOT change balance_owed_cfa
do $J17$
declare
  cust_id     uuid;
  balance_before numeric;
  balance_after  numeric;
begin
  -- Create customer and add balance
  cust_id := ((public.create_customer(p_name := 'Balance Guard J17'))->>'id')::uuid;

  perform public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := cust_id,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 0,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  select balance_owed_cfa into balance_before from customers where id = cust_id;

  -- Update name only
  perform public.update_customer(
    p_customer_id := cust_id,
    p_name        := 'Balance Guard J17 Updated'
  );

  select balance_owed_cfa into balance_after from customers where id = cust_id;

  if balance_after != balance_before then
    raise exception 'J17 FAIL: update_customer changed balance (before=%, after=%)', balance_before, balance_after;
  end if;

  raise notice 'J17 PASS: update_customer does not modify balance_owed_cfa (preserved %)' , balance_before;
end;
$J17$;

-- J18: Reactivated customer is eligible for new sales
do $J18$
declare
  cust_id uuid;
  result  jsonb;
begin
  -- Create, deactivate, reactivate, then transact
  cust_id := ((public.create_customer(p_name := 'Reactivate Eligible J18'))->>'id')::uuid;
  perform public.deactivate_customer(p_customer_id := cust_id);
  perform public.reactivate_customer(p_customer_id := cust_id);

  -- New credit sale must succeed after reactivation
  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := cust_id,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 0,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  if (result->>'sale_id') is null then
    raise exception 'J18 FAIL: sale not created after customer reactivation';
  end if;

  raise notice 'J18 PASS: reactivated customer is immediately eligible for new sales';
end;
$J18$;


-- ──────────────────────────────────────────────────────────────
-- FINAL SUMMARY
-- ──────────────────────────────────────────────────────────────
do $SUMMARY$
begin
  raise notice '=========================================';
  raise notice 'Phase 4+6 RPC Tests — ALL SECTIONS PASSED';
  raise notice 'Sections: A(A0=clean-seed,A1=drift) B(sale,B7=dup-product) C(return) D(void)';
  raise notice '          E(inventory) F(transfer)';
  raise notice '          G(shift,G2=neg-float,G3=neg-cash,G4=repeated-close)';
  raise notice '          H(immutability) I(RLS)';
  raise notice '          J(customer-mgmt,J1-J18)';
  raise notice '=========================================';
end;
$SUMMARY$;

-- Visible row for the hosted SQL editor Results tab
select 'Phase 4+6 RPC Tests — ALL SECTIONS PASSED' as status;
