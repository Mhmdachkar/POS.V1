-- ================================================================
-- B5 -- negative prices rejected; sell-below-cost allowed
-- ================================================================
-- Run after: supabase db reset
-- ================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
select set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000001', false);

do $B5_1$
declare
  result jsonb;
begin
  begin
    perform public.create_product(
      p_depot_id    := '00000000-0000-0000-0001-000000000001',
      p_category_id := '00000000-0000-0000-0002-000000000001',
      p_name        := 'B5 Negative Price',
      p_photo_url   := 'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=800&h=800&q=80',
      p_units       := '[{"unit_level":0,"unit_name":"Piece","serial_number":"B5-NEG-001","cost_price_cfa":100,"selling_price_cfa":-1}]'::jsonb
    );
    raise exception 'B5-1 FAIL: negative selling price should be rejected';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%INVALID_PRICE%' then
        raise exception 'B5-1 FAIL: wrong error: %', sqlerrm;
      end if;
  end;
  raise notice 'B5-1 PASS: negative selling price is rejected';
end;
$B5_1$;

do $B5_2$
declare
  result jsonb;
  sell numeric;
  cost numeric;
begin
  result := public.create_product(
    p_depot_id    := '00000000-0000-0000-0001-000000000001',
    p_category_id := '00000000-0000-0000-0002-000000000001',
    p_name        := 'B5 Sell Below Cost',
    p_photo_url   := 'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=800&h=800&q=80',
    p_units       := '[{"unit_level":0,"unit_name":"Piece","serial_number":"B5-BELOW-001","cost_price_cfa":100,"selling_price_cfa":50}]'::jsonb
  );
  select pu.selling_price_cfa, pu.cost_price_cfa
    into sell, cost
  from public.product_units pu
  where pu.product_id = (result->>'product_id')::uuid
     or pu.product_id = (result->>'id')::uuid
  limit 1;
  if sell is null then
    raise exception 'B5-2 FAIL: product unit not found, result=%', result;
  end if;
  if sell != 50 or cost != 100 then
    raise exception 'B5-2 FAIL: expected sell 50 / cost 100, got % / %', sell, cost;
  end if;
  raise notice 'B5-2 PASS: sell below cost is stored';
end;
$B5_2$;
