-- ================================================================
-- B8 — open shift required for complete_sale, process_return, record_payment
-- ================================================================
-- Run after: supabase db reset
-- ================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
select set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000001', false);

-- B8-1: complete_sale without a shift is rejected.
do $B8_1$
begin
  begin
    perform public.complete_sale(
      p_depot_id            := '00000000-0000-0000-0001-000000000001',
      p_customer_id         := null,
      p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
      p_amount_tendered_cfa := 350,
      p_display_currency    := 'CFA'
    );
    raise exception 'B8-1 FAIL: complete_sale without shift should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%SHIFT_NOT_OPEN%' then
        raise exception 'B8-1 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B8-1 PASS: complete_sale requires an open shift';
end;
$B8_1$;

-- B8-2: process_return without a shift is rejected.
do $B8_2$
declare
  sale_id uuid;
  item_id uuid;
  shift_id uuid;
begin
  shift_id := (public.open_shift(
    p_depot_id := '00000000-0000-0000-0001-000000000001',
    p_opening_float_cfa := 0
  )->>'shift_id')::uuid;

  sale_id := (public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := null,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350,
    p_display_currency    := 'CFA',
    p_shift_id            := shift_id
  )->>'sale_id')::uuid;

  select id into item_id from sale_items where sale_id = sale_id;

  begin
    perform public.process_return(
      p_sale_id         := sale_id,
      p_items           := jsonb_build_array(
        jsonb_build_object('sale_item_id', item_id, 'quantity_in_unit', 1)
      ),
      p_cash_refund_cfa := 350
    );
    raise exception 'B8-2 FAIL: process_return without shift should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%SHIFT_NOT_OPEN%' then
        raise exception 'B8-2 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B8-2 PASS: process_return requires an open shift';
end;
$B8_2$;

-- B8-3: record_payment without a shift is rejected.
do $B8_3$
declare
  cust_id constant uuid := '00000000-0000-0000-0005-000000000001';
begin
  insert into customers (id, name, phone, balance_owed_cfa, created_by)
  values (cust_id, 'B8 Test Customer', '0000000000', 500, '00000000-0000-0000-0000-000000000001')
  on conflict (id) do update set balance_owed_cfa = 500;

  begin
    perform public.record_payment(
      p_customer_id := cust_id,
      p_amount_cfa  := 100
    );
    raise exception 'B8-3 FAIL: record_payment without shift should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%SHIFT_NOT_OPEN%' then
        raise exception 'B8-3 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B8-3 PASS: record_payment requires an open shift';
end;
$B8_3$;

-- B8-4: complete_sale with an open shift succeeds and stores shift_id.
do $B8_4$
declare
  shift_id uuid;
  result   jsonb;
begin
  shift_id := (public.open_shift(
    p_depot_id := '00000000-0000-0000-0001-000000000001',
    p_opening_float_cfa := 0
  )->>'shift_id')::uuid;

  result := public.complete_sale(
    p_depot_id            := '00000000-0000-0000-0001-000000000001',
    p_customer_id         := null,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa := 350,
    p_display_currency    := 'CFA',
    p_shift_id            := shift_id
  );

  if (select shift_id from sales where id = (result->>'sale_id')::uuid) != shift_id then
    raise exception 'B8-4 FAIL: sale.shift_id was not stored';
  end if;
  raise notice 'B8-4 PASS: complete_sale stores the open shift id';
end;
$B8_4$;
