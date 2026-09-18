-- ================================================================
-- DEV ONLY — restore the seed baseline so rpc_transactions.test.sql
-- can run once on a hosted/dev database.
--
-- NOT a migration. Do NOT add this to supabase/migrations/.
-- Do NOT run on a database that has real client sales or customers.
--
-- What this does:
--   1. Deletes transactional / test-created rows
--   2. Leaves staff, depots, categories, seed products, product_units,
--      business_settings, and auth.users in place
--   3. Sets seed product stock + ledger back to seed.sql values
--   4. Resets depot receipt_seq to 1
--
-- After this succeeds, run supabase/tests/rpc_transactions.test.sql ONCE.
-- ================================================================

-- Child → parent transactional tables
truncate table
  public.sale_return_items,
  public.sale_returns,
  public.payments,
  public.sale_items,
  public.sales,
  public.stock_transfer_items,
  public.stock_transfers,
  public.inventory_adjustments,
  public.inventory_transactions,
  public.stock_entries,
  public.shifts,
  public.customers,
  public.audit_log
restart identity cascade;

-- B7 throwaway product (if a previous run left it behind)
delete from public.product_units
where product_id = 'bbbbbbbb-7777-0000-0000-000000000001';
delete from public.products
where id = 'bbbbbbbb-7777-0000-0000-000000000001';

-- Restore seed stock (seed.sql ON CONFLICT DO NOTHING cannot do this)
update public.products set current_stock_pieces = 500
where id = '00000000-0000-0000-0003-000000000001';
update public.products set current_stock_pieces = 240
where id = '00000000-0000-0000-0003-000000000002';
update public.products set current_stock_pieces = 80
where id = '00000000-0000-0000-0003-000000000003';
update public.products set current_stock_pieces = 200
where id = '00000000-0000-0000-0003-000000000011';
update public.products set current_stock_pieces = 100
where id = '00000000-0000-0000-0003-000000000012';

update public.depots set receipt_seq = 1
where id in (
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0001-000000000002'
);

-- Re-create seed stock_entries + matching ledger rows
insert into public.stock_entries (
  id, product_id, depot_id, unit_level, quantity_in_unit, quantity_pieces, note, entered_by
) values
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000001', 0, 500, 500, 'Initial seed stock', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0001-000000000001', 0, 240, 240, 'Initial seed stock', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0001-000000000001', 0, 80,  80,  'Initial seed stock', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0004-000000000011', '00000000-0000-0000-0003-000000000011', '00000000-0000-0000-0001-000000000002', 0, 200, 200, 'Initial seed stock', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0004-000000000012', '00000000-0000-0000-0003-000000000012', '00000000-0000-0000-0001-000000000002', 0, 100, 100, 'Initial seed stock', '00000000-0000-0000-0000-000000000001');

insert into public.inventory_transactions (
  depot_id, product_id, quantity_pieces, transaction_type, reference_type, reference_id, created_by, metadata
) values
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0003-000000000001', 500, 'RESTOCK', 'stock_entry', '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001', '{"note":"Initial seed stock"}'::jsonb),
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0003-000000000002', 240, 'RESTOCK', 'stock_entry', '00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000001', '{"note":"Initial seed stock"}'::jsonb),
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0003-000000000003', 80,  'RESTOCK', 'stock_entry', '00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0000-000000000001', '{"note":"Initial seed stock"}'::jsonb),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0003-000000000011', 200, 'RESTOCK', 'stock_entry', '00000000-0000-0000-0004-000000000011', '00000000-0000-0000-0000-000000000001', '{"note":"Initial seed stock"}'::jsonb),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0003-000000000012', 100, 'RESTOCK', 'stock_entry', '00000000-0000-0000-0004-000000000012', '00000000-0000-0000-0000-000000000001', '{"note":"Initial seed stock"}'::jsonb);

-- Sanity: water must be 500 / 500 or A0 will still fail
do $$
declare
  stock  numeric;
  ledger numeric;
begin
  select p.current_stock_pieces, coalesce(it.ledger, 0)
  into stock, ledger
  from products p
  left join (
    select product_id, sum(quantity_pieces) as ledger
    from inventory_transactions
    group by product_id
  ) it on it.product_id = p.id
  where p.id = '00000000-0000-0000-0003-000000000001';

  if stock != 500 or ledger != 500 then
    raise exception 'RESET FAILED: water stock=% ledger=% (expected 500/500)', stock, ledger;
  end if;

  raise notice 'DEV RESET OK: water stock=500 ledger=500. You may run rpc_transactions.test.sql once.';
end;
$$;

-- Visible row for the hosted SQL editor Results tab
select 'DEV RESET OK' as status, 500 as water_stock, 500 as water_ledger;
