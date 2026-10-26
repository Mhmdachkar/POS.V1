-- ================================================================
-- EYO fix: move catalog to Abidjan (ABJ), remove Dakar (DKR),
-- open temporary Storage write for photo upload script, then
-- (after _upload_eyo_photos.cjs) apply HTTPS photo URLs.
-- ================================================================
--
-- Run order:
--   1) Run THIS file in Supabase SQL editor
--   2) node _upload_eyo_photos.cjs
--   3) The upload script prints/applies photo URL updates and
--      drops the temporary storage write policy
-- ================================================================

do $$
declare
  v_abj uuid;
  v_dkr uuid;
  v_moved int;
begin
  select id into v_abj from public.depots
  where upper(code) = 'ABJ' or lower(name) like '%abidjan%'
  order by case when upper(code) = 'ABJ' then 0 else 1 end
  limit 1;

  if v_abj is null then
    raise exception 'EYO fix: Abidjan depot (ABJ) not found';
  end if;

  select id into v_dkr from public.depots
  where upper(code) = 'DKR' or lower(name) like '%dakar%'
  order by case when upper(code) = 'DKR' then 0 else 1 end
  limit 1;

  -- Ensure Abidjan is active
  update public.depots set is_active = true where id = v_abj;

  if v_dkr is not null and v_dkr <> v_abj then
    -- Move Dakar staff to Abidjan when role slot is free; otherwise deactivate them
    update public.staff s
    set depot_id = v_abj
    where s.depot_id = v_dkr
      and s.is_active = true
      and s.role in ('cashier', 'depot_staff')
      and not exists (
        select 1 from public.staff o
        where o.depot_id = v_abj
          and o.role = s.role
          and o.is_active = true
      );

    update public.staff
    set is_active = false,
        deactivated_at = coalesce(deactivated_at, now())
    where depot_id = v_dkr
      and is_active = true
      and role in ('cashier', 'depot_staff');

    -- Move all operational rows to Abidjan
    update public.products set depot_id = v_abj, updated_at = now() where depot_id = v_dkr;
    get diagnostics v_moved = row_count;
    update public.stock_entries set depot_id = v_abj where depot_id = v_dkr;
    update public.inventory_transactions set depot_id = v_abj where depot_id = v_dkr;
    update public.inventory_adjustments set depot_id = v_abj where depot_id = v_dkr;
    update public.sales set depot_id = v_abj where depot_id = v_dkr;
    update public.shifts set depot_id = v_abj where depot_id = v_dkr;
    update public.stock_transfers set from_depot_id = v_abj where from_depot_id = v_dkr;
    update public.stock_transfers set to_depot_id = v_abj where to_depot_id = v_dkr;
    update public.print_jobs set depot_id = v_abj where depot_id = v_dkr;

    -- Soft-delete Dakar then hard-delete if nothing still references it
    update public.depots set is_active = false where id = v_dkr;

    -- Move any remaining staff FK off Dakar so the depot can be deleted
    update public.staff
    set depot_id = v_abj
    where depot_id = v_dkr;

    begin
      delete from public.depots where id = v_dkr;
      raise notice 'EYO fix: deleted depot Dakar %', v_dkr;
    exception when foreign_key_violation then
      raise notice 'EYO fix: Dakar kept inactive (FK history remains) %', v_dkr;
    end;

    raise notice 'EYO fix: moved % products to Abidjan %', v_moved, v_abj;
  else
    raise notice 'EYO fix: no Dakar depot found; ensuring products on Abidjan';
  end if;

  -- Any EYO-seeded products still not on ABJ
  update public.products p
  set depot_id = v_abj, updated_at = now()
  where p.depot_id is distinct from v_abj
    and exists (
      select 1 from public.product_units u
      where u.product_id = p.id and u.serial_number like '%-PCE'
    );

  update public.stock_entries se
  set depot_id = v_abj
  where se.depot_id is distinct from v_abj
    and exists (select 1 from public.products p where p.id = se.product_id and p.depot_id = v_abj);

  update public.inventory_transactions it
  set depot_id = v_abj
  where it.depot_id is distinct from v_abj
    and exists (select 1 from public.products p where p.id = it.product_id and p.depot_id = v_abj);
end;
$$;

-- Temporary Storage write for EYO photo upload (anon key via script).
drop policy if exists product_photos_eyo_seed_insert on storage.objects;
create policy product_photos_eyo_seed_insert
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'product-photos' and name like 'eyo/%');

drop policy if exists product_photos_eyo_seed_update on storage.objects;
create policy product_photos_eyo_seed_update
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'product-photos' and name like 'eyo/%')
  with check (bucket_id = 'product-photos' and name like 'eyo/%');

drop policy if exists product_photos_eyo_seed_delete on storage.objects;
create policy product_photos_eyo_seed_delete
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'product-photos' and name like 'eyo/%');

select
  'EYO DEPOT FIX OK' as status,
  (select count(*) from public.depots where upper(code)='ABJ' or lower(name) like '%abidjan%') as abidjan_depots,
  (select count(*) from public.depots where upper(code)='DKR' or lower(name) like '%dakar%') as dakar_depots_left,
  (select count(*) from public.products p
    join public.depots d on d.id = p.depot_id
    where upper(d.code)='ABJ' or lower(d.name) like '%abidjan%') as products_on_abidjan;