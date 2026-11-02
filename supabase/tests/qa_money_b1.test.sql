-- ================================================================
-- B1 — process_return refunds follow payable total, capped at cash+credit
-- ================================================================
-- Run after: supabase db reset
-- Independent of rpc_transactions.test.sql (uses remaining seed stock).
-- ================================================================

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


-- B1-1: full return of an overridden sale refunds the override, not catalog nets.
do $B1_1$
declare
  sale_id uuid;
  item_id uuid;
  result  jsonb;
begin
  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := null,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":10}]'::jsonb,
    p_amount_tendered_cfa := 1750,
    p_display_currency    := 'CFA',
    p_override_total_cfa  := 1750,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  sale_id := (result->>'sale_id')::uuid;
  if (result->>'total_cfa')::numeric != 3500 then
    raise exception 'B1-1 FAIL: calculated total should be 3500, got %', result->>'total_cfa';
  end if;
  if (result->>'admin_override_total_cfa')::numeric != 1750 then
    raise exception 'B1-1 FAIL: override should be 1750, got %', result->>'admin_override_total_cfa';
  end if;

  select id into item_id from sale_items where sale_id = sale_id;

  result := public.process_return(
    p_sale_id         := sale_id,
    p_items           := jsonb_build_array(
      jsonb_build_object('sale_item_id', item_id, 'quantity_in_unit', 10)
    ),
    p_cash_refund_cfa := 1750,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  if (result->>'refund_amount_cfa')::numeric != 1750 then
    raise exception 'B1-1 FAIL: expected refund 1750 (override), got %', result->>'refund_amount_cfa';
  end if;
  if (result->>'cash_refunded_cfa')::numeric != 1750 then
    raise exception 'B1-1 FAIL: expected cash 1750, got %', result->>'cash_refunded_cfa';
  end if;

  raise notice 'B1-1 PASS: full return of overridden sale refunds payable total';
end;
$B1_1$;

-- B1-2: two lines share the override; sequential returns sum to cash+credit taken.
do $B1_2$
declare
  sale_id   uuid;
  water_id  uuid;
  soda_id   uuid;
  r1        jsonb;
  r2        jsonb;
  water_pid constant uuid := '00000000-0000-0000-0003-000000000001';
  soda_pid  constant uuid := '00000000-0000-0000-0003-000000000002';
begin
  r1 := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := null,
    p_cart_items          := '[
      {"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":2},
      {"product_id":"00000000-0000-0000-0003-000000000002","unit_level":0,"quantity_in_unit":2}
    ]'::jsonb,
    p_amount_tendered_cfa := 650,
    p_display_currency    := 'CFA',
    p_override_total_cfa  := 650,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  sale_id := (r1->>'sale_id')::uuid;
  -- 2×350 + 2×300 = 1300 calculated; override 650.
  select si.id into water_id from sale_items si where si.sale_id = sale_id and si.product_id = water_pid;
  select si.id into soda_id  from sale_items si where si.sale_id = sale_id and si.product_id = soda_pid;

  r1 := public.process_return(
    p_sale_id         := sale_id,
    p_items           := jsonb_build_array(
      jsonb_build_object('sale_item_id', water_id, 'quantity_in_unit', 2)
    ),
    p_cash_refund_cfa := 350,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  if (r1->>'refund_amount_cfa')::numeric != 350 then
    raise exception 'B1-2 FAIL: water share of 650 should be 350, got %', r1->>'refund_amount_cfa';
  end if;

  r2 := public.process_return(
    p_sale_id         := sale_id,
    p_items           := jsonb_build_array(
      jsonb_build_object('sale_item_id', soda_id, 'quantity_in_unit', 2)
    ),
    p_cash_refund_cfa := 300,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  if (r2->>'refund_amount_cfa')::numeric != 300 then
    raise exception 'B1-2 FAIL: soda share of 650 should be 300, got %', r2->>'refund_amount_cfa';
  end if;

  raise notice 'B1-2 PASS: line shares of override sum to cash collected';
end;
$B1_2$;

-- B1-3: without override, residual still sums to catalog net (cash+credit = total).
do $B1_3$
declare
  sale_id uuid;
  item_id uuid;
  r1      jsonb;
  r2      jsonb;
begin
  r1 := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := null,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":3}]'::jsonb,
    p_amount_tendered_cfa := 1050,
    p_display_currency    := 'CFA',
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  sale_id := (r1->>'sale_id')::uuid;
  select id into item_id from sale_items where sale_id = sale_id;

  r1 := public.process_return(
    p_sale_id         := sale_id,
    p_items           := jsonb_build_array(
      jsonb_build_object('sale_item_id', item_id, 'quantity_in_unit', 1)
    ),
    p_cash_refund_cfa := 350,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  r2 := public.process_return(
    p_sale_id         := sale_id,
    p_items           := jsonb_build_array(
      jsonb_build_object('sale_item_id', item_id, 'quantity_in_unit', 2)
    ),
    p_cash_refund_cfa := 700,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  if (r1->>'refund_amount_cfa')::numeric + (r2->>'refund_amount_cfa')::numeric != 1050 then
    raise exception 'B1-3 FAIL: residual refunds should sum to 1050, got % + %',
      r1->>'refund_amount_cfa', r2->>'refund_amount_cfa';
  end if;

  raise notice 'B1-3 PASS: no-override residual still sums to collected total';
end;
$B1_3$;

-- B1-4: custom refund above remaining collected pool is rejected.
do $B1_4$
declare
  sale_id uuid;
  item_id uuid;
  result  jsonb;
begin
  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := null,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":2}]'::jsonb,
    p_amount_tendered_cfa := 350,
    p_display_currency    := 'CFA',
    p_override_total_cfa  := 350,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  sale_id := (result->>'sale_id')::uuid;
  select id into item_id from sale_items where sale_id = sale_id;

  begin
    result := public.process_return(
      p_sale_id         := sale_id,
      p_items           := jsonb_build_array(
        jsonb_build_object(
          'sale_item_id', item_id,
          'quantity_in_unit', 2,
          'refund_amount_cfa', 700
        )
      ),
      p_cash_refund_cfa := 700,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
    raise exception 'B1-4 FAIL: custom refund above collected pool should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_AMOUNT%' then
        raise exception 'B1-4 FAIL: wrong error: %', sqlerrm;
      end if;
  end;

  raise notice 'B1-4 PASS: custom refund above cash+credit is rejected';
end;
$B1_4$;

-- B1-5: credit + cash taken is the cap (applied 200 + credit 150 = override 350).
do $B1_5$
declare
  sale_id uuid;
  item_id uuid;
  result  jsonb;
  cust_id constant uuid := '00000000-0000-0000-0005-000000000001';
begin
  insert into customers (id, name, phone, balance_owed_cfa, created_by)
  values (cust_id, 'B1 Test Customer', '0000000000', 0, '00000000-0000-0000-0000-000000000001')
  on conflict (id) do nothing;

  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := cust_id,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":2}]'::jsonb,
    p_amount_tendered_cfa := 200,
    p_display_currency    := 'CFA',
    p_override_total_cfa  := 350,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  sale_id := (result->>'sale_id')::uuid;
  if (result->>'amount_applied_cfa')::numeric != 200 then
    raise exception 'B1-5 FAIL: applied should be 200, got %', result->>'amount_applied_cfa';
  end if;
  if (result->>'balance_added_cfa')::numeric != 150 then
    raise exception 'B1-5 FAIL: credit should be 150, got %', result->>'balance_added_cfa';
  end if;

  select id into item_id from sale_items where sale_id = sale_id;

  result := public.process_return(
    p_sale_id         := sale_id,
    p_items           := jsonb_build_array(
      jsonb_build_object('sale_item_id', item_id, 'quantity_in_unit', 2)
    ),
    p_cash_refund_cfa := 200,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );

  if (result->>'refund_amount_cfa')::numeric != 350 then
    raise exception 'B1-5 FAIL: refund should equal cash+credit 350, got %', result->>'refund_amount_cfa';
  end if;

  raise notice 'B1-5 PASS: refund capped at cash + credit collected';
end;
$B1_5$;

-- B1-6: MAIN-00000026 shape. 2 pieces at 2 500, cash 5 000.
-- First piece refunded 1 000. Last piece cap is 2 500, not 4 000.
do $B1_6$
declare
  sale_id uuid;
  item_id uuid;
  r1      jsonb;
  r2      jsonb;
  water   constant uuid := '00000000-0000-0000-0003-000000000001';
  old_price numeric;
begin
  select selling_price_cfa into old_price
  from product_units
  where product_id = water and unit_level = 0;

  update product_units
  set selling_price_cfa = 2500
  where product_id = water and unit_level = 0;

  r1 := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := null,
    p_cart_items          := jsonb_build_array(
      jsonb_build_object('product_id', water, 'unit_level', 0, 'quantity_in_unit', 2)
    ),
    p_amount_tendered_cfa := 5000,
    p_display_currency    := 'CFA',
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  sale_id := (r1->>'sale_id')::uuid;
  if (r1->>'total_cfa')::numeric != 5000 then
    raise exception 'B1-6 FAIL: sale total should be 5000, got %', r1->>'total_cfa';
  end if;
  select id into item_id from sale_items where sale_id = sale_id;

  r1 := public.process_return(
    p_sale_id         := sale_id,
    p_items           := jsonb_build_array(
      jsonb_build_object(
        'sale_item_id', item_id,
        'quantity_in_unit', 1,
        'refund_amount_cfa', 1000
      )
    ),
    p_cash_refund_cfa := 1000,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  if (r1->>'refund_amount_cfa')::numeric != 1000 then
    raise exception 'B1-6 FAIL: first refund should be 1000, got %', r1->>'refund_amount_cfa';
  end if;

  begin
    perform public.process_return(
      p_sale_id         := sale_id,
      p_items           := jsonb_build_array(
        jsonb_build_object(
          'sale_item_id', item_id,
          'quantity_in_unit', 1,
          'refund_amount_cfa', 4000
        )
      ),
      p_cash_refund_cfa := 4000,
      p_shift_id := current_setting('qa.shift_id')::uuid
    );
    raise exception 'B1-6 FAIL: 4000 on the last piece should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_AMOUNT%' then
        raise exception 'B1-6 FAIL: wrong error: %', sqlerrm;
      end if;
  end;

  r2 := public.process_return(
    p_sale_id         := sale_id,
    p_items           := jsonb_build_array(
      jsonb_build_object('sale_item_id', item_id, 'quantity_in_unit', 1)
    ),
    p_cash_refund_cfa := 2500,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  if (r2->>'refund_amount_cfa')::numeric != 2500 then
    raise exception 'B1-6 FAIL: last piece full value should be 2500, got %', r2->>'refund_amount_cfa';
  end if;

  update product_units
  set selling_price_cfa = old_price
  where product_id = water and unit_level = 0;

  raise notice 'B1-6 PASS: last piece capped at 2500 after a 1000 refund on a 5000 sale';
exception
  when others then
    update product_units
    set selling_price_cfa = old_price
    where product_id = water and unit_level = 0;
    raise;
end;
$B1_6$;

-- Payment cap follows ledger debt, not a higher customers.balance_owed_cfa.
-- Client owes 1 400 on the ledger; the column is inflated to 1 500.
-- 1 500 must be rejected. 1 400 must be accepted.
do $PAY_CAP$
declare
  cust_id uuid;
  result  jsonb;
  water   constant uuid := '00000000-0000-0000-0003-000000000001';
  old_price numeric;
begin
  select selling_price_cfa into old_price
  from product_units
  where product_id = water and unit_level = 0;

  update product_units
  set selling_price_cfa = 1400
  where product_id = water and unit_level = 0;

  cust_id := ((public.create_customer(p_name := 'Pay Cap 1400'))->>'id')::uuid;

  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := cust_id,
    p_cart_items          := jsonb_build_array(
      jsonb_build_object('product_id', water, 'unit_level', 0, 'quantity_in_unit', 1)
    ),
    p_amount_tendered_cfa := 0,
    p_display_currency    := 'CFA',
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  if (result->>'balance_added_cfa')::numeric != 1400 then
    raise exception 'PAY CAP FAIL: credit should be 1400, got %', result->>'balance_added_cfa';
  end if;

  update public.customers
  set balance_owed_cfa = 1500
  where id = cust_id;

  begin
    perform public.record_payment(
      p_customer_id := cust_id,
      p_amount_cfa := 1500,
      p_shift_id := current_setting('qa.shift_id')::uuid
    );
    raise exception 'PAY CAP FAIL: 1500 should be rejected when ledger debt is 1400';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%PAYMENT_EXCEEDS_BALANCE%' then
        raise exception 'PAY CAP FAIL: wrong error: %', sqlerrm;
      end if;
  end;

  result := public.record_payment(
    p_customer_id := cust_id,
    p_amount_cfa := 1400,
    p_shift_id := current_setting('qa.shift_id')::uuid
  );
  if (result->>'amount_cfa')::numeric != 1400 then
    raise exception 'PAY CAP FAIL: 1400 should be accepted, got %', result;
  end if;

  update product_units
  set selling_price_cfa = old_price
  where product_id = water and unit_level = 0;

  raise notice 'PAY CAP PASS: 1500 rejected and 1400 accepted against ledger debt';
exception
  when others then
    update product_units
    set selling_price_cfa = old_price
    where product_id = water and unit_level = 0;
    raise;
end;
$PAY_CAP$;
