-- ================================================================
-- B7 -- complete_sale rejects quantity above available stock
-- ================================================================
-- Run after: supabase db reset
-- ================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
select set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000001', false);

do $B7_1$
declare
  sid uuid;
  stock numeric;
begin
  select current_stock_pieces into stock
  from public.products
  where id = '00000000-0000-0000-0003-000000000001';

  select id into sid from public.shifts
  where status = 'open' and depot_id = '00000000-0000-0000-0001-000000000001'
  order by opened_at desc limit 1;
  if sid is null then
    sid := (public.open_shift(
      p_depot_id := '00000000-0000-0000-0001-000000000001',
      p_opening_float_cfa := 0
    )->>'shift_id')::uuid;
  end if;

  begin
    perform public.complete_sale(
      p_depot_id            := '00000000-0000-0000-0001-000000000001',
      p_customer_id         := null,
      p_cart_items          := jsonb_build_array(jsonb_build_object(
        'product_id', '00000000-0000-0000-0003-000000000001',
        'unit_level', 0,
        'quantity_in_unit', stock + 1
      )),
      p_amount_tendered_cfa := 1,
      p_display_currency    := 'CFA',
      p_shift_id            := sid
    );
    raise exception 'B7-1 FAIL: overstock sale should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INSUFFICIENT_STOCK%' then
        raise exception 'B7-1 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B7-1 PASS: complete_sale rejects qty above stock';
end;
$B7_1$;
