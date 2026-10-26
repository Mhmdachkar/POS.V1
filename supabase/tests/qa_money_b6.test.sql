-- ================================================================
-- B6 -- reports/dashboard use payable total; depot KPIs include
--       unattributed payments
-- ================================================================
-- Run after: supabase db reset
-- ================================================================

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
select set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000001', false);

do $B6_1$
declare
  depot_a  constant uuid := '00000000-0000-0000-0001-000000000001';
  today    date;
  shift_id uuid;
  before   numeric;
  after    numeric;
  dash_before numeric;
  dash_after  numeric;
  result   jsonb;
begin
  today := (now() AT TIME ZONE 'Africa/Abidjan')::date;

  select id into shift_id
  from public.shifts
  where status = 'open' and depot_id = depot_a
  order by opened_at desc
  limit 1;

  if shift_id is null then
    shift_id := (public.open_shift(p_depot_id := depot_a, p_opening_float_cfa := 0)->>'shift_id')::uuid;
  end if;

  result := public.admin_report_sales(depot_a, today, today);
  before := (result->>'sales_activity_cfa')::numeric;
  dash_before := (public.admin_dashboard_summary(depot_a)->>'sales_cfa')::numeric;

  perform public.complete_sale(
    p_depot_id            := depot_a,
    p_customer_id         := null,
    p_cart_items          := '[{"product_id":"00000000-0000-0000-0003-000000000001","unit_level":0,"quantity_in_unit":10}]'::jsonb,
    p_amount_tendered_cfa := 1750,
    p_display_currency    := 'CFA',
    p_override_total_cfa  := 1750,
    p_shift_id            := shift_id
  );

  result := public.admin_report_sales(depot_a, today, today);
  after := (result->>'sales_activity_cfa')::numeric;
  dash_after := (public.admin_dashboard_summary(depot_a)->>'sales_cfa')::numeric;

  if after - before != 1750 then
    raise exception 'B6-1 FAIL: report should add payable 1750 not catalog 3500, delta=%', after - before;
  end if;
  if dash_after - dash_before != 1750 then
    raise exception 'B6-1 FAIL: dashboard should add payable 1750, delta=%', dash_after - dash_before;
  end if;

  raise notice 'B6-1 PASS: reports and dashboard use payable override total';
end;
$B6_1$;

do $B6_2$
declare
  depot_a    constant uuid := '00000000-0000-0000-0001-000000000001';
  cashier_id constant uuid := '00000000-0000-0000-0000-000000000002';
  cust_id    constant uuid := '00000000-0000-0000-0005-000000000001';
  today      date;
  before     numeric;
  after      numeric;
  result     jsonb;
begin
  today := (now() AT TIME ZONE 'Africa/Abidjan')::date;

  insert into customers (id, name, phone, balance_owed_cfa, created_by)
  values (cust_id, 'B6 Customer', '0000000000', 250, '00000000-0000-0000-0000-000000000001')
  on conflict (id) do update set balance_owed_cfa = greatest(customers.balance_owed_cfa, 250);

  result := public.admin_report_customers(depot_a, today, today);
  before := (result->>'payment_activity_cfa')::numeric;

  insert into payments (
    customer_id, sale_id, shift_id, payment_type, amount_cfa, recorded_by, note
  ) values (
    cust_id, null, null, 'customer_payment', 250, cashier_id, 'B6 unattributed'
  );

  result := public.admin_report_customers(depot_a, today, today);
  after := (result->>'payment_activity_cfa')::numeric;

  if after - before != 250 then
    raise exception 'B6-2 FAIL: depot payment KPI should include unattributed 250, delta=%', after - before;
  end if;
  if (result->>'unattributed_payment_activity_cfa')::numeric < 250 then
    raise exception 'B6-2 FAIL: unattributed KPI missing the 250 payment';
  end if;

  raise notice 'B6-2 PASS: depot-scoped payment KPI includes unattributed cash';
end;
$B6_2$;
