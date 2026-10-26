-- ================================================================
-- B2 -- payable total of 0 requires admin + stored reason
--        percent > 100 remains INVALID_DISCOUNT
-- ================================================================
-- Run after: supabase db reset
-- ================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
select set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000001', false);

do $B2_shift$
declare
  sid uuid;
begin
  select id into sid from public.shifts
  where status = 'open' and depot_id = '00000000-0000-0000-0001-000000000001'
  order by opened_at desc limit 1;
  if sid is null then
    sid := (public.open_shift(
      p_depot_id := '00000000-0000-0000-0001-000000000001',
      p_opening_float_cfa := 0
    )->>'shift_id')::uuid;
  end if;
  perform set_config('qa.shift_id', sid::text, false);
end;
$B2_shift$;

-- B2-1: cashier cannot complete a 100% (zero total) sale
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', false);
select set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000002', false);

do $B2_1$
begin
  begin
    perform public.complete_sale(
      p_depot_id            := '00000000-0000-0000-0001-000000000001',
      p_customer_id         := null,
      p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
      p_amount_tendered_cfa := 0,
      p_display_currency    := 'CFA',
      p_discount_type       := 'percent',
      p_discount_value      := 100,
      p_shift_id            := current_setting('qa.shift_id')::uuid
    );
    raise exception 'B2-1 FAIL: cashier 100%% sale should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%UNAUTHORIZED%' then
        raise exception 'B2-1 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B2-1 PASS: cashier cannot complete a 0-total sale';
end;
$B2_1$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
select set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000001', false);

do $B2_2$
begin
  begin
    perform public.complete_sale(
      p_depot_id            := '00000000-0000-0000-0001-000000000001',
      p_customer_id         := null,
      p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
      p_amount_tendered_cfa := 0,
      p_display_currency    := 'CFA',
      p_discount_type       := 'percent',
      p_discount_value      := 100,
      p_shift_id            := current_setting('qa.shift_id')::uuid
    );
    raise exception 'B2-2 FAIL: admin 100%% without reason should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_INPUT%' then
        raise exception 'B2-2 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B2-2 PASS: admin 0-total without reason is rejected';
end;
$B2_2$;

do $B2_3$
declare
  result jsonb;
  sale_id uuid;
  stored text;
begin
  result := public.complete_sale(
    p_depot_id                 := '00000000-0000-0000-0001-000000000001',
    p_customer_id              := null,
    p_cart_items               := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa      := 0,
    p_display_currency         := 'CFA',
    p_discount_type            := 'percent',
    p_discount_value           := 100,
    p_shift_id                 := current_setting('qa.shift_id')::uuid,
    p_price_exception_reason   := 'Courtesy waiver'
  );
  if (result->>'total_cfa')::numeric != 0 then
    raise exception 'B2-3 FAIL: calculated total should be 0, got %', result->>'total_cfa';
  end if;
  sale_id := (result->>'sale_id')::uuid;
  select price_exception_reason into stored from public.sales where id = sale_id;
  if stored is distinct from 'Courtesy waiver' then
    raise exception 'B2-3 FAIL: reason not stored, got %', stored;
  end if;
  raise notice 'B2-3 PASS: admin 100%% with reason stores price_exception_reason';
end;
$B2_3$;

do $B2_4$
begin
  begin
    perform public.complete_sale(
      p_depot_id            := '00000000-0000-0000-0001-000000000001',
      p_customer_id         := null,
      p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
      p_amount_tendered_cfa := 0,
      p_display_currency    := 'CFA',
      p_discount_type       := 'percent',
      p_discount_value      := 150,
      p_shift_id            := current_setting('qa.shift_id')::uuid
    );
    raise exception 'B2-4 FAIL: 150%% should be INVALID_DISCOUNT';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_DISCOUNT%' then
        raise exception 'B2-4 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B2-4 PASS: 150%% percent is rejected';
end;
$B2_4$;

do $B2_5$
declare
  result jsonb;
begin
  result := public.complete_sale(
    p_depot_id                 := '00000000-0000-0000-0001-000000000001',
    p_customer_id              := null,
    p_cart_items               := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa      := 0,
    p_display_currency         := 'CFA',
    p_discount_type            := 'flat',
    p_discount_value           := 350,
    p_shift_id                 := current_setting('qa.shift_id')::uuid,
    p_price_exception_reason   := 'Full flat waiver'
  );
  if (result->>'total_cfa')::numeric != 0 then
    raise exception 'B2-5 FAIL: full flat should yield 0, got %', result->>'total_cfa';
  end if;
  raise notice 'B2-5 PASS: admin full flat discount with reason succeeds';
end;
$B2_5$;
