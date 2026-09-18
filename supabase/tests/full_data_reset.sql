-- ================================================================
-- VHM POS -- FULL DATA RESET (business data wipe)
-- ================================================================
--
-- NOT a migration. Do NOT put this in supabase/migrations/.
-- Run manually in Supabase SQL Editor (or psql) when you want an
-- empty catalog + empty history, while keeping login accounts.
--
-- CLEARS:
--   sales / returns / payments / shifts / customers / audit
--   inventory (entries, adjustments, transfers, ledger)
--   print_jobs / sale_fulfillments
--   products / product_units / categories  (all items)
--   (product-photos: clear via Dashboard > Storage, not SQL)
--
-- KEEPS (so you can still sign in and use the app):
--   auth.users / auth.identities
--   public.staff
--   public.depots  (receipt_seq reset to 1)
--   public.business_settings
--   schema, RPCs, RLS, storage bucket definition
--
-- IRREVERSIBLE. Do not run on a database with data you need to keep.
-- ================================================================

begin;

-- 1) Transactional + catalog tables (FK-safe via CASCADE)
truncate table
  public.print_jobs,
  public.sale_fulfillments,
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
  public.audit_log,
  public.product_units,
  public.products,
  public.categories
restart identity cascade;

-- 2) Depot receipt counters
update public.depots
set receipt_seq = 1;

-- 3) Product photos: cannot DELETE storage.objects via SQL (protect_delete).
--    Clear bucket "product-photos" in Dashboard > Storage if needed.

-- 4) Sanity checks
do $$
declare
  v_products   bigint;
  v_units      bigint;
  v_categories bigint;
  v_sales      bigint;
  v_stock      bigint;
  v_ledger     bigint;
  v_customers  bigint;
  v_shifts     bigint;
  v_print      bigint;
begin
  select count(*) into v_products   from public.products;
  select count(*) into v_units      from public.product_units;
  select count(*) into v_categories from public.categories;
  select count(*) into v_sales      from public.sales;
  select count(*) into v_stock      from public.stock_entries;
  select count(*) into v_ledger     from public.inventory_transactions;
  select count(*) into v_customers  from public.customers;
  select count(*) into v_shifts     from public.shifts;
  select count(*) into v_print      from public.print_jobs;

  if v_products <> 0
     or v_units <> 0
     or v_categories <> 0
     or v_sales <> 0
     or v_stock <> 0
     or v_ledger <> 0
     or v_customers <> 0
     or v_shifts <> 0
     or v_print <> 0
  then
    raise exception
      'FULL RESET FAILED: products=% units=% categories=% sales=% stock=% ledger=% customers=% shifts=% print=%',
      v_products, v_units, v_categories, v_sales, v_stock, v_ledger,
      v_customers, v_shifts, v_print;
  end if;

  raise notice 'FULL DATA RESET OK - catalog and history are empty. Staff/depots/auth kept.';
end;
$$;

commit;

-- Visible row for the hosted SQL editor Results tab
select
  'FULL DATA RESET OK' as status,
  (select count(*) from public.staff) as staff_kept,
  (select count(*) from public.depots) as depots_kept,
  (select count(*) from public.products) as products_left,
  (select count(*) from public.sales) as sales_left,
  (select count(*) from public.categories) as categories_left;
