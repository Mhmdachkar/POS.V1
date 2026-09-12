-- ================================================================
-- VHM POS — Phase 4 RPC Transaction Tests
-- ================================================================
--
-- Run after: supabase db reset
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

-- ──────────────────────────────────────────────────────────────
-- SECTION A: Inventory drift invariant (post-seed baseline)
-- ──────────────────────────────────────────────────────────────

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
    p_discount_value      := null
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
  -- Insert a test customer
  insert into customers (id, name, phone, balance_owed_cfa)
  values ('00000000-0000-0000-0005-000000000001', 'Test Customer B2', '0000000000', 0)
  on conflict (id) do nothing;

  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := '00000000-0000-0000-0005-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000002","unit_level":0,"quantity_in_unit":2}]'::jsonb,
    p_amount_tendered_cfa := 0,   -- full credit
    p_display_currency    := 'CFA'
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
      p_amount_tendered_cfa := 0
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
      p_amount_tendered_cfa := 0   -- no cash = credit, but no customer
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
    p_idempotency_key     := key
  );
  result2 := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350,
    p_idempotency_key     := key
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
    p_discount_value      := 500
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

-- ──────────────────────────────────────────────────────────────
-- SECTION C: process_return
-- ──────────────────────────────────────────────────────────────

-- C1: Partial return — refund correct, status partially_returned
do $C1$
declare
  sale_result    jsonb;
  return_result  jsonb;
  sale_id        uuid;
  sale_item_id   uuid;
  stock_after    numeric;
  drift_count    int;
begin
  -- Create a fresh sale
  sale_result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":5}]'::jsonb,
    p_amount_tendered_cfa := 1750
  );
  sale_id := (sale_result->>'sale_id')::uuid;

  select id into sale_item_id from sale_items where sale_id = sale_id limit 1;

  return_result := public.process_return(
    p_sale_id         := sale_id,
    p_items           := jsonb_build_array(jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 2)),
    p_reason          := 'Test partial return',
    p_cash_refund_cfa := 700
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
  sale_id       uuid;
  sale_item_id  uuid;
begin
  sale_result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350
  );
  sale_id := (sale_result->>'sale_id')::uuid;
  perform public.void_sale(p_sale_id := sale_id);

  select id into sale_item_id from sale_items where sale_id = sale_id limit 1;

  begin
    perform public.process_return(
      p_sale_id         := sale_id,
      p_items           := jsonb_build_array(jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 1)),
      p_cash_refund_cfa := 350
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
  sale_id       uuid;
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
    p_discount_value      := 100
  );
  sale_id := (sale_result->>'sale_id')::uuid;
  select id into sale_item_id from sale_items where sale_id = sale_id limit 1;

  -- Get net_line_total_cfa for this item
  select net_line_total_cfa into net_total from sale_items where id = sale_item_id;

  -- Three separate single-unit returns
  r1 := public.process_return(
    p_sale_id := sale_id,
    p_items   := jsonb_build_array(jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 1)),
    p_cash_refund_cfa := round(net_total / 3, 2)
  );
  r2 := public.process_return(
    p_sale_id := sale_id,
    p_items   := jsonb_build_array(jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 1)),
    p_cash_refund_cfa := round(net_total / 3, 2)
  );
  r3 := public.process_return(
    p_sale_id := sale_id,
    p_items   := jsonb_build_array(jsonb_build_object('sale_item_id', sale_item_id, 'quantity_in_unit', 1)),
    p_cash_refund_cfa := net_total - round(net_total / 3, 2) * 2
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
    p_amount_tendered_cfa := 90000
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
    p_amount_tendered_cfa := 350
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

  result := public.restock_product(
    p_product_id       := '00000000-0000-0000-0003-000000000001',
    p_unit_level       := 1,  -- Case (12 bottles)
    p_quantity_in_unit := 5,  -- 5 cases = 60 pieces
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

-- ──────────────────────────────────────────────────────────────
-- SECTION H: Immutability triggers
-- ──────────────────────────────────────────────────────────────

-- H1: Attempt to UPDATE sale_items.unit_price_cfa → rejected
do $H1$
declare
  sale_id      uuid;
  sale_item_id uuid;
begin
  sale_id := (public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350
  )->>'sale_id')::uuid;

  select id into sale_item_id from sale_items where sale_id = sale_id limit 1;

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
    p_amount_tendered_cfa := 350
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
    p_amount_tendered_cfa := 350
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
-- FINAL SUMMARY
-- ──────────────────────────────────────────────────────────────
do $SUMMARY$
begin
  raise notice '=========================================';
  raise notice 'Phase 4 RPC Tests — ALL SECTIONS PASSED';
  raise notice 'Sections: A(drift) B(sale) C(return) D(void)';
  raise notice '          E(inventory) F(transfer) G(shift)';
  raise notice '          H(immutability) I(RLS)';
  raise notice '=========================================';
end;
$SUMMARY$;
