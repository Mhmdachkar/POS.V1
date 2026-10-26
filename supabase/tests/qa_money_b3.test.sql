-- ================================================================
-- B3 -- admin override must be 1..calculated total with a reason
-- ================================================================
-- Run after: supabase db reset
-- ================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
select set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000001', false);

do $B3_shift$
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
$B3_shift$;

do $B3_1$
begin
  begin
    perform public.complete_sale(
      p_depot_id                 := '00000000-0000-0000-0001-000000000001',
      p_customer_id              := null,
      p_cart_items               := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
      p_amount_tendered_cfa      := 0,
      p_display_currency         := 'CFA',
      p_override_total_cfa       := 0,
      p_shift_id                 := current_setting('qa.shift_id')::uuid,
      p_price_exception_reason   := 'zero override'
    );
    raise exception 'B3-1 FAIL: override 0 should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_AMOUNT%' then
        raise exception 'B3-1 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B3-1 PASS: override 0 is rejected';
end;
$B3_1$;

do $B3_2$
begin
  begin
    perform public.complete_sale(
      p_depot_id                 := '00000000-0000-0000-0001-000000000001',
      p_customer_id              := null,
      p_cart_items               := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
      p_amount_tendered_cfa      := 400,
      p_display_currency         := 'CFA',
      p_override_total_cfa       := 351,
      p_shift_id                 := current_setting('qa.shift_id')::uuid,
      p_price_exception_reason   := 'too high'
    );
    raise exception 'B3-2 FAIL: override above calculated should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_AMOUNT%' then
        raise exception 'B3-2 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B3-2 PASS: override above calculated total is rejected';
end;
$B3_2$;

do $B3_3$
begin
  begin
    perform public.complete_sale(
      p_depot_id            := '00000000-0000-0000-0001-000000000001',
      p_customer_id         := null,
      p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
      p_amount_tendered_cfa := 175,
      p_display_currency    := 'CFA',
      p_override_total_cfa  := 175,
      p_shift_id            := current_setting('qa.shift_id')::uuid
    );
    raise exception 'B3-3 FAIL: override without reason should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_INPUT%' then
        raise exception 'B3-3 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B3-3 PASS: override without reason is rejected';
end;
$B3_3$;

do $B3_4$
declare
  result jsonb;
  stored text;
begin
  result := public.complete_sale(
    p_depot_id                 := '00000000-0000-0000-0001-000000000001',
    p_customer_id              := null,
    p_cart_items               := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":1}]'::jsonb,
    p_amount_tendered_cfa      := 175,
    p_display_currency         := 'CFA',
    p_override_total_cfa       := 175,
    p_shift_id                 := current_setting('qa.shift_id')::uuid,
    p_price_exception_reason   := 'Negotiated price'
  );
  if (result->>'admin_override_total_cfa')::numeric != 175 then
    raise exception 'B3-4 FAIL: override not stored, got %', result->>'admin_override_total_cfa';
  end if;
  select price_exception_reason into stored from public.sales
  where id = (result->>'sale_id')::uuid;
  if stored is distinct from 'Negotiated price' then
    raise exception 'B3-4 FAIL: reason not stored, got %', stored;
  end if;
  raise notice 'B3-4 PASS: in-range override with reason is stored';
end;
$B3_4$;
