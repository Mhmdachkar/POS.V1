-- ================================================================
-- VHM POS — Seed catalog from DOSSIER 1 EYO.xlsx (sheet CI)
-- ================================================================
--
-- Unit logic:
--   pcs/pq  = pieces per package (L1 relative_quantity)
--   paquet  = packages per carton (L2 relative_quantity)
--   CTN     = opening stock in cartons
--   stock_pieces = CTN * paquet * pcs/pq
--
-- Example (JK-1): 30 CTN x 20 paquet x 12 pcs = 7200 pieces
--
-- Categories: RESOLVED from existing admin categories (no inserts).
-- Excel typos mapped: minuserie→menuserie, electrecite→electricite, etc.
-- Photos: public/products/eyo/ referenced as /products/eyo/...
-- Depot: first active depot (prefers code DKR if present).
-- Prices: cost=0, selling=1 CFA placeholder — update in Inventory.
-- Idempotent: fixed UUIDs from item numbers (+ excel row for dups).
-- Must run AFTER product_units serial/hierarchy migrations.
-- NOT for re-running on a DB that already has live sales against these IDs.
-- ================================================================

do $$
declare
  v_depot_id uuid;
  v_admin_id uuid;
  v_cat_id uuid;
  v_product_id uuid;
  v_stock numeric;
  v_pcs_per_pkg numeric;
  v_pkg_per_ctn numeric;
  v_pcs_per_ctn numeric;
  v_entry_id uuid;
  v_excel_key text;
  v_stem text;
  v_missing text;
  v_available text;
begin
  select id into v_depot_id
  from public.depots
  where is_active = true
  order by case when upper(code) = 'DKR' then 0 else 1 end, name
  limit 1;

  if v_depot_id is null then
    raise exception 'EYO seed: no active depot found';
  end if;

  select id into v_admin_id
  from public.staff
  where role = 'admin' and is_active = true
  order by created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'EYO seed: no active admin staff found';
  end if;

  -- Map Excel category labels onto EXISTING admin categories (do not create).
  create temporary table eyo_cat_alias (
    excel_key text not null,
    alias_norm text not null
  ) on commit drop;

  create temporary table eyo_cat_map (
    excel_key text primary key,
    category_id uuid not null,
    matched_name text not null
  ) on commit drop;

  insert into eyo_cat_alias (excel_key, alias_norm) values ('clef', 'clef');
  insert into eyo_cat_alias (excel_key, alias_norm) values ('clef', 'clefs');
  insert into eyo_cat_alias (excel_key, alias_norm) values ('clef', 'cle');
  insert into eyo_cat_alias (excel_key, alias_norm) values ('clef', 'cles');
  insert into eyo_cat_alias (excel_key, alias_norm) values ('electrecite', 'electrecite');
  insert into eyo_cat_alias (excel_key, alias_norm) values ('electrecite', 'electricite');
  insert into eyo_cat_alias (excel_key, alias_norm) values ('electrecite', 'electricit');
  insert into eyo_cat_alias (excel_key, alias_norm) values ('minuserie', 'minuserie');
  insert into eyo_cat_alias (excel_key, alias_norm) values ('minuserie', 'menuserie');
  insert into eyo_cat_alias (excel_key, alias_norm) values ('outils', 'outils');
  insert into eyo_cat_alias (excel_key, alias_norm) values ('plomberie', 'plomberie');

  -- Exact / alias match on active root categories (accent-insensitive)
  insert into eyo_cat_map (excel_key, category_id, matched_name)
  select distinct on (a.excel_key)
    a.excel_key,
    c.id,
    c.name
  from eyo_cat_alias a
  join public.categories c
    on c.is_active = true
   and c.parent_id is null
   and lower(translate(trim(c.name), 'àâäáãåāăąèéêëēĕėęěìíîïĩīĭįıòóôöõøōŏőùúûüũūŭůűųýÿŷçćčñńņňÀÂÄÁÃÅĀĂĄÈÉÊËĒĔĖĘĚÌÍÎÏĨĪĬĮİÒÓÔÖÕØŌŎŐÙÚÛÜŨŪŬŮŰŲÝŸŶÇĆČÑŃŅŇ', 'aaaaaaaaaeeeeeeeeeeeiiiiiiiiiooooooooouuuuuuuuuuyyycsccnnnAAAAAAAAAEEEEEEEEEEEIIIIIIIIIOOOOOOOOOUUUUUUUUUUYYYCSCCNNN')) = a.alias_norm
  order by a.excel_key, length(c.name), c.created_at;

  -- Fuzzy contains fallback for unresolved excel keys
  for v_excel_key in
    select distinct excel_key from eyo_cat_alias
    except
    select excel_key from eyo_cat_map
  loop
    insert into eyo_cat_map (excel_key, category_id, matched_name)
    select v_excel_key, c.id, c.name
    from public.categories c
    where c.is_active = true
      and c.parent_id is null
      and lower(translate(trim(c.name), 'àâäáãåāăąèéêëēĕėęěìíîïĩīĭįıòóôöõøōŏőùúûüũūŭůűųýÿŷçćčñńņňÀÂÄÁÃÅĀĂĄÈÉÊËĒĔĖĘĚÌÍÎÏĨĪĬĮİÒÓÔÖÕØŌŎŐÙÚÛÜŨŪŬŮŰŲÝŸŶÇĆČÑŃŅŇ', 'aaaaaaaaaeeeeeeeeeeeiiiiiiiiiooooooooouuuuuuuuuuyyycsccnnnAAAAAAAAAEEEEEEEEEEEIIIIIIIIIOOOOOOOOOUUUUUUUUUUYYYCSCCNNN')) like '%' || v_excel_key || '%'
    order by length(c.name), c.created_at
    limit 1
    on conflict (excel_key) do nothing;
  end loop;

  -- Excel typos: electrecite↔electric*, minuserie↔menu*
  for v_excel_key, v_stem in
    select * from (values
      ('electrecite', 'electric'),
      ('minuserie', 'menu')
    ) as t(excel_key, stem)
  loop
    if exists (select 1 from eyo_cat_map where excel_key = v_excel_key) then
      continue;
    end if;
    insert into eyo_cat_map (excel_key, category_id, matched_name)
    select v_excel_key, c.id, c.name
    from public.categories c
    where c.is_active = true
      and c.parent_id is null
      and lower(translate(trim(c.name), 'àâäáãåāăąèéêëēĕėęěìíîïĩīĭįıòóôöõøōŏőùúûüũūŭůűųýÿŷçćčñńņňÀÂÄÁÃÅĀĂĄÈÉÊËĒĔĖĘĚÌÍÎÏĨĪĬĮİÒÓÔÖÕØŌŎŐÙÚÛÜŨŪŬŮŰŲÝŸŶÇĆČÑŃŅŇ', 'aaaaaaaaaeeeeeeeeeeeiiiiiiiiiooooooooouuuuuuuuuuyyycsccnnnAAAAAAAAAEEEEEEEEEEEIIIIIIIIIOOOOOOOOOUUUUUUUUUUYYYCSCCNNN')) like '%' || v_stem || '%'
    order by length(c.name), c.created_at
    limit 1
    on conflict (excel_key) do nothing;
  end loop;

  select string_agg(excel_key, ', ' order by excel_key) into v_missing
  from (
    select distinct excel_key from eyo_cat_alias
    except
    select excel_key from eyo_cat_map
  ) miss;

  if v_missing is not null then
    select string_agg(name, ', ' order by name) into v_available
    from public.categories
    where is_active = true and parent_id is null;
    raise exception
      'EYO seed: missing admin categories for Excel labels: %. Available root categories: %. Create/rename them in Admin → Categories to match (Menuserie, Electricite, Clefs, Outils, Plomberie, …), then re-run.',
      v_missing, coalesce(v_available, '(none)');
  end if;

  raise notice 'EYO category map: %',
    (select string_agg(excel_key || '→' || matched_name, ', ' order by excel_key) from eyo_cat_map);

  -- JK-1: pumelle a souder 80*2.8mm
  -- stock 30 CTN x 20 paquet x 12 pcs = 7200 pieces
  v_product_id := '59e66c1c-b70b-46ab-8ac2-940405f333af'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 240;
  v_stock := 7200;
  v_entry_id := '572cfea7-91dd-48c9-89f4-8c3fdc4c2ba6'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle a souder 80*2.8mm', '/products/eyo/JK-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'JK-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'JK-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'JK-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    30, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'JK-1', 'excel_row', 4)
    );
  end if;

  -- JK-2: pumelle a souder 100*2.8mm
  -- stock 15 CTN x 20 paquet x 12 pcs = 3600 pieces
  v_product_id := 'bcdb99d2-66fb-48e9-a221-cf97fc649e8b'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 240;
  v_stock := 3600;
  v_entry_id := '97584f0f-425a-4d6f-9630-3fc41b196645'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle a souder 100*2.8mm', '/products/eyo/JK-2.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'JK-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'JK-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'JK-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'JK-2', 'excel_row', 5)
    );
  end if;

  -- 57-3: clef 720-100 RO
  -- stock 70 CTN x 24 paquet x 1 pcs = 1680 pieces
  v_product_id := '95aec582-a468-4091-a986-1db4a1e2a762'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 1680;
  v_entry_id := '19ae9681-f0cd-4b22-9b3f-1facccd2475a'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef 720-100 RO', '/products/eyo/57-3.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '57-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '57-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '57-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    70, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '57-3', 'excel_row', 6)
    );
  end if;

  -- 10-35: clef 3 coup 101
  -- stock 600 CTN x 24 paquet x 1 pcs = 14400 pieces
  v_product_id := '974ff639-2b65-4502-9895-59d0f4afb044'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 14400;
  v_entry_id := 'f5b7a28a-9e8a-478a-b654-c94cc97852fa'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef 3 coup 101', '/products/eyo/10-35.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-35-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-35-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-35-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    600, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-35', 'excel_row', 7)
    );
  end if;

  -- RW-100: clef rond noir LT1024
  -- stock 15 CTN x 12 paquet x 1 pcs = 180 pieces
  v_product_id := '710663c9-cc07-46c5-a05c-25949cd632c9'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 180;
  v_entry_id := '3b9c55b8-717a-4f37-8c8c-a4dafd1a63ef'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef rond noir LT1024', '/products/eyo/RW-100.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RW-100-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RW-100-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RW-100-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RW-100', 'excel_row', 8)
    );
  end if;

  -- RW-101: clef rond LT1024 ALUMINUM
  -- stock 15 CTN x 12 paquet x 1 pcs = 180 pieces
  v_product_id := 'c7c5f77a-96c5-4ff9-9940-2c64b73497aa'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 180;
  v_entry_id := '2164ec05-97c7-421f-84fe-08bf9deb027d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef rond LT1024 ALUMINUM', '/products/eyo/RW-101.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RW-101-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RW-101-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RW-101-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RW-101', 'excel_row', 9)
    );
  end if;

  -- RW-102: clef rond 5951+8945A
  -- stock 10 CTN x 20 paquet x 1 pcs = 200 pieces
  v_product_id := 'a8f9d93b-d411-4681-b3ad-b39e3d6259c8'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 200;
  v_entry_id := '967f774f-0f99-4f92-b441-02f796bc7ded'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef rond 5951+8945A', '/products/eyo/RW-102.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RW-102-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RW-102-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RW-102-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RW-102', 'excel_row', 10)
    );
  end if;

  -- 10-10: aiman grand 99023
  -- stock 25 CTN x 16 paquet x 40 pcs = 16000 pieces
  v_product_id := 'abcac20d-f348-4a54-90ac-f1fea20d6ce4'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 40;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 640;
  v_stock := 16000;
  v_entry_id := '8fa55f43-ffb4-4d07-a274-6bc349334db3'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'aiman grand 99023', '/products/eyo/10-10.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-10-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-10-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-10-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-10', 'excel_row', 11)
    );
  end if;

  -- 45-1: point lombrie 1''x12 1KG/box 700g (excel row 12)
  -- stock 25 CTN x 25 paquet x 1 pcs = 625 pieces
  v_product_id := 'ad5f3af3-d8d9-40a7-b8cd-ec5de12b8c4c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 25;
  v_pcs_per_ctn := 25;
  v_stock := 625;
  v_entry_id := '91833730-1ace-45ac-8b05-da1856e6e727'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'point lombrie 1''''x12 1KG/box 700g', '/products/eyo/45-1-R12.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '45-1-R12-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '45-1-R12-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '45-1-R12-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '45-1', 'excel_row', 12)
    );
  end if;

  -- 55-129: crochet clip 3 dozen / small box
  -- stock 5 CTN x 100 paquet x 12 pcs = 6000 pieces
  v_product_id := '4cf41dd5-be96-401c-b18d-e102593b38cd'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 1200;
  v_stock := 6000;
  v_entry_id := '6673468b-e99c-48dc-aea7-525c52b15ad3'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet clip 3 dozen / small box', '/products/eyo/55-129.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-129-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-129-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-129-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-129', 'excel_row', 13)
    );
  end if;

  -- 55-130: crochet clip 4 dozen / small box
  -- stock 5 CTN x 100 paquet x 12 pcs = 6000 pieces
  v_product_id := '336568d1-54cd-45bd-ad2e-963ba9f06996'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 1200;
  v_stock := 6000;
  v_entry_id := 'e652171f-ab0b-44ec-9d88-82dab8fae123'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet clip 4 dozen / small box', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-130-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-130-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-130-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-130', 'excel_row', 14)
    );
  end if;

  -- 55-131: crohet clip 5 dozen / small box
  -- stock 5 CTN x 100 paquet x 12 pcs = 6000 pieces
  v_product_id := '9826be1d-dcab-4666-a452-e087e31f273e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 1200;
  v_stock := 6000;
  v_entry_id := 'ac66cf02-f532-4488-b528-1cf0bcfb2e4c'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crohet clip 5 dozen / small box', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-131-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-131-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-131-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-131', 'excel_row', 15)
    );
  end if;

  -- 55-132: point acier 8" 800G
  -- stock 300 CTN x 25 paquet x 1 pcs = 7500 pieces
  v_product_id := '9da54f1a-ea1f-4f4a-8508-5e210a48c9c2'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 25;
  v_pcs_per_ctn := 25;
  v_stock := 7500;
  v_entry_id := 'f90981af-fc7d-40bd-a466-b55532be2008'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'point acier 8" 800G', '/products/eyo/55-132.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-132-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-132-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-132-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    300, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-132', 'excel_row', 16)
    );
  end if;

  -- 10-28: point acier 4" 800g
  -- stock 20 CTN x 25 paquet x 1 pcs = 500 pieces
  v_product_id := 'dcf984f1-c2f7-4a13-9b6b-25337b684dd9'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 25;
  v_pcs_per_ctn := 25;
  v_stock := 500;
  v_entry_id := '57861541-5356-4b2d-a398-2cfcd32d46bd'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'point acier 4" 800g', '/products/eyo/10-28.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-28-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-28-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-28-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-28', 'excel_row', 17)
    );
  end if;

  -- 10-29: point acier 5" 800g
  -- stock 60 CTN x 25 paquet x 1 pcs = 1500 pieces
  v_product_id := '458b6e81-c7d1-48a0-b47c-514e1465cc14'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 25;
  v_pcs_per_ctn := 25;
  v_stock := 1500;
  v_entry_id := '777d4029-7fda-43af-adbb-719469cab8be'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'point acier 5" 800g', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-29-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-29-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-29-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    60, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-29', 'excel_row', 18)
    );
  end if;

  -- 10-30: point acier 6" 800g
  -- stock 50 CTN x 25 paquet x 1 pcs = 1250 pieces
  v_product_id := 'b7302f2e-1a5b-4c5c-99f2-b9c047a886e5'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 25;
  v_pcs_per_ctn := 25;
  v_stock := 1250;
  v_entry_id := 'd79dcc67-9c9f-4499-b7a1-5d1c2825f8ba'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'point acier 6" 800g', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-30-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-30-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-30-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    50, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-30', 'excel_row', 19)
    );
  end if;

  -- 10-31: point acier 7" 800g
  -- stock 40 CTN x 25 paquet x 1 pcs = 1000 pieces
  v_product_id := '4c40f2cc-47c3-4702-88b8-40682fdbc034'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 25;
  v_pcs_per_ctn := 25;
  v_stock := 1000;
  v_entry_id := 'aa8e6fe0-293a-4f75-b189-cf3cb0841ba0'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'point acier 7" 800g', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-31-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-31-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-31-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    40, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-31', 'excel_row', 20)
    );
  end if;

  -- 10-33: point acier 9" 800g
  -- stock 40 CTN x 25 paquet x 1 pcs = 1000 pieces
  v_product_id := 'fbd02cb4-a8f1-47a5-89b9-254e7696146f'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 25;
  v_pcs_per_ctn := 25;
  v_stock := 1000;
  v_entry_id := '04833a37-6d47-45d5-8b6b-25503c5cb505'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'point acier 9" 800g', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-33-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-33-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-33-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    40, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-33', 'excel_row', 21)
    );
  end if;

  -- 10-34: point acier 10" 800g
  -- stock 50 CTN x 25 paquet x 1 pcs = 1250 pieces
  v_product_id := '23a8284c-e6b6-4468-a9ee-08efd87fea2e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 25;
  v_pcs_per_ctn := 25;
  v_stock := 1250;
  v_entry_id := '354f69b9-e1d3-48c1-9a75-6ceb1c3388ec'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'point acier 10" 800g', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-34-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-34-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-34-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    50, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-34', 'excel_row', 22)
    );
  end if;

  -- 48-1: vise francais 3*25 170pcs/box
  -- stock 10 CTN x 100 paquet x 1 pcs = 1000 pieces
  v_product_id := '0693f7b7-a7cb-44a4-9c5a-b3bc009e4124'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 1000;
  v_entry_id := 'f995ddb0-f802-47b3-9c3b-5b80066872b2'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise francais 3*25 170pcs/box', '/products/eyo/48-1.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '48-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '48-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '48-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '48-1', 'excel_row', 23)
    );
  end if;

  -- 48-2: vise francais 4*20 170pcs/box
  -- stock 10 CTN x 100 paquet x 1 pcs = 1000 pieces
  v_product_id := 'c1fa0bcc-fda1-44ac-b7e4-7baa19239e88'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 1000;
  v_entry_id := 'c847c3e2-1930-4484-8e1d-41b37f446fff'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise francais 4*20 170pcs/box', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '48-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '48-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '48-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '48-2', 'excel_row', 24)
    );
  end if;

  -- 48-3: vise francais 4*25 170pcs/box
  -- stock 35 CTN x 100 paquet x 1 pcs = 3500 pieces
  v_product_id := '2827c16f-e0fa-4e28-85ea-97000e028ef9'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 3500;
  v_entry_id := '2efa185e-58c0-44e6-aba5-8c2c8e5dc531'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise francais 4*25 170pcs/box', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '48-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '48-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '48-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    35, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '48-3', 'excel_row', 25)
    );
  end if;

  -- 48-4: vise francais 4*30 170pcs/box
  -- stock 60 CTN x 100 paquet x 1 pcs = 6000 pieces
  v_product_id := 'd66cfe4d-78dd-4de5-8783-d309c005cc21'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 6000;
  v_entry_id := 'ad895039-ddb5-4b43-883d-8e55984418d6'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise francais 4*30 170pcs/box', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '48-4-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '48-4-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '48-4-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    60, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '48-4', 'excel_row', 26)
    );
  end if;

  -- 48-12: crochet noir 50
  -- stock 10 CTN x 50 paquet x 12 pcs = 6000 pieces
  v_product_id := 'cfaae1c4-81b6-4533-bafe-983e7209d42a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 600;
  v_stock := 6000;
  v_entry_id := 'b69d7124-e3ce-495a-be2c-8fcdba21fc68'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet noir 50', '/products/eyo/48-12.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '48-12-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '48-12-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '48-12-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '48-12', 'excel_row', 27)
    );
  end if;

  -- 48-13: crochet d ore 50
  -- stock 5 CTN x 50 paquet x 12 pcs = 3000 pieces
  v_product_id := 'cbbadd22-d5d6-42ef-b869-df69bbb5b7ac'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 600;
  v_stock := 3000;
  v_entry_id := 'abf50c16-8cd9-45c2-a548-524639897f1c'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet d ore 50', '/products/eyo/48-13.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '48-13-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '48-13-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '48-13-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '48-13', 'excel_row', 28)
    );
  end if;

  -- 24-1: point chaussure 3/4"
  -- stock 25 CTN x 14 paquet x 4 pcs = 1400 pieces
  v_product_id := '0745caf1-feb9-4df8-aaf8-d1d90937c1e4'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 4;
  v_pkg_per_ctn := 14;
  v_pcs_per_ctn := 56;
  v_stock := 1400;
  v_entry_id := 'baa4601d-d74d-4bc1-886b-7f023a56eab2'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'point chaussure 3/4"', '/products/eyo/24-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '24-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '24-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '24-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '24-1', 'excel_row', 29)
    );
  end if;

  -- 24-2: point chaussure 5/8"
  -- stock 45 CTN x 14 paquet x 4 pcs = 2520 pieces
  v_product_id := 'b5e7abf8-0f00-4eda-8d53-264dd3793108'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 4;
  v_pkg_per_ctn := 14;
  v_pcs_per_ctn := 56;
  v_stock := 2520;
  v_entry_id := 'e7aba9fe-d0f1-4617-918b-c72976383f59'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'point chaussure 5/8"', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '24-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '24-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '24-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    45, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '24-2', 'excel_row', 30)
    );
  end if;

  -- 24-3: point chaussure 1"
  -- stock 15 CTN x 14 paquet x 4 pcs = 840 pieces
  v_product_id := '1468cbae-12a2-4242-88a7-06b8c73535e5'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 4;
  v_pkg_per_ctn := 14;
  v_pcs_per_ctn := 56;
  v_stock := 840;
  v_entry_id := '88bdf2de-b71e-4ab4-aca5-6a1b2b0bae2d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'point chaussure 1"', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '24-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '24-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '24-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '24-3', 'excel_row', 31)
    );
  end if;

  -- 10-1: clef 103 ROBIWANG
  -- stock 20 CTN x 12 paquet x 1 pcs = 240 pieces
  v_product_id := 'bf38cb6f-90e4-4eff-9e11-9707c488ff44'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 240;
  v_entry_id := '91a5d437-2f48-4837-bb9f-38eaaeea5888'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef 103 ROBIWANG', '/products/eyo/10-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-1', 'excel_row', 32)
    );
  end if;

  -- 10-7: clef placar elephant 2 coup 138-32
  -- stock 7 CTN x 20 paquet x 12 pcs = 1680 pieces
  v_product_id := '0a7c381e-00cb-42c5-8731-91b57cf00328'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 240;
  v_stock := 1680;
  v_entry_id := '8c0166e3-2326-4378-bb18-8d8e31f9ca9a'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef placar elephant 2 coup 138-32', '/products/eyo/10-7.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-7-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-7-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-7-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    7, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-7', 'excel_row', 33)
    );
  end if;

  -- 10-8: clef placar elephant 1 coup 139-22
  -- stock 3 CTN x 20 paquet x 12 pcs = 720 pieces
  v_product_id := '65fd41c3-02c6-4bf0-a7e1-a2b6f5f99ccc'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 240;
  v_stock := 720;
  v_entry_id := '9065e883-1707-4a87-bddb-b20930e96d63'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef placar elephant 1 coup 139-22', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-8-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-8-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-8-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-8', 'excel_row', 34)
    );
  end if;

  -- 10-18: nako pvc 4"
  -- stock 50 CTN x 10 paquet x 1 pcs = 500 pieces
  v_product_id := '1ef03132-39ea-47a9-9266-788c23a1c672'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 10;
  v_stock := 500;
  v_entry_id := 'ee3f249e-2395-4801-ab78-c8174c6a890d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'nako pvc 4"', '/products/eyo/10-18.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-18-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-18-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-18-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    50, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-18', 'excel_row', 35)
    );
  end if;

  -- 10-19: nako pvc 5"
  -- stock 150 CTN x 10 paquet x 1 pcs = 1500 pieces
  v_product_id := '342a256b-399d-4fe2-9e0c-b9d39e56c828'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 10;
  v_stock := 1500;
  v_entry_id := '66fca91e-7df0-44dc-ae2c-8d0f459d6e0d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'nako pvc 5"', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-19-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-19-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-19-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    150, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-19', 'excel_row', 36)
    );
  end if;

  -- 10-20: nako pvc 6"
  -- stock 50 CTN x 10 paquet x 1 pcs = 500 pieces
  v_product_id := 'e21e1c34-233a-45df-bb37-806e28cca3ea'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 10;
  v_stock := 500;
  v_entry_id := '0aebee46-a9c5-4680-9e59-3e0993134e26'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'nako pvc 6"', '/products/eyo/10-20.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '10-20-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '10-20-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '10-20-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    50, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '10-20', 'excel_row', 37)
    );
  end if;

  -- 55-80: clef lincy noir V8502-A7 BK
  -- stock 20 CTN x 24 paquet x 1 pcs = 480 pieces
  v_product_id := 'ab7bf2fc-9c79-429e-859f-c14932a5869b'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 480;
  v_entry_id := '2fd4ebc1-cfbc-45c9-a1e9-175e17776d74'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy noir V8502-A7 BK', '/products/eyo/55-80.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-80-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-80-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-80-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-80', 'excel_row', 38)
    );
  end if;

  -- 55-81: clef lincy noir V8502-A10 BK
  -- stock 20 CTN x 24 paquet x 1 pcs = 480 pieces
  v_product_id := 'd32d788e-7520-4212-b91a-30e893450ec9'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 480;
  v_entry_id := '54c87378-599b-4a97-9f93-1fa2a90286ab'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy noir V8502-A10 BK', '/products/eyo/55-81.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-81-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-81-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-81-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-81', 'excel_row', 39)
    );
  end if;

  -- 55-82: clef lincy V8502-A13 CF
  -- stock 20 CTN x 24 paquet x 1 pcs = 480 pieces
  v_product_id := 'c519aea4-9f5f-4b83-bdcd-1c566acfff75'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 480;
  v_entry_id := '3c4e1f0d-a26b-457f-a172-4123dc2b11d4'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy V8502-A13 CF', '/products/eyo/55-82.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-82-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-82-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-82-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-82', 'excel_row', 40)
    );
  end if;

  -- 55-83: clef lincy M821-B22 MCF
  -- stock 20 CTN x 24 paquet x 1 pcs = 480 pieces
  v_product_id := 'b745d99b-d10b-4ac1-9d3c-8eee673e310c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 480;
  v_entry_id := '89fbfafd-14ec-4253-a18b-4351205ab4d5'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy M821-B22 MCF', '/products/eyo/55-83.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-83-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-83-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-83-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-83', 'excel_row', 41)
    );
  end if;

  -- 55-84: clef lincy M831-B19 SN/B
  -- stock 20 CTN x 24 paquet x 1 pcs = 480 pieces
  v_product_id := '8fbb7612-e8df-4025-9409-052d9d6d078f'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 480;
  v_entry_id := '0bf97d89-4ffb-4a8c-8ec7-edab69244ef3'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy M831-B19 SN/B', '/products/eyo/55-84.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-84-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-84-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-84-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-84', 'excel_row', 42)
    );
  end if;

  -- 55-85: clef lincy M899-B103 MCF
  -- stock 20 CTN x 24 paquet x 1 pcs = 480 pieces
  v_product_id := '12bc38ef-33b3-4e33-bb54-f9dcc7497060'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 480;
  v_entry_id := 'c618ef86-8513-43f0-b0b3-be5fbdcb062c'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy M899-B103 MCF', '/products/eyo/55-85.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-85-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-85-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-85-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-85', 'excel_row', 43)
    );
  end if;

  -- 55-86: clef lincy M821-B5 SN/B
  -- stock 20 CTN x 24 paquet x 1 pcs = 480 pieces
  v_product_id := '58e2978c-6bd3-48bc-8cd3-dba603216659'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 480;
  v_entry_id := 'eaf824b5-f841-40f8-9f89-e34304400e3e'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy M821-B5 SN/B', '/products/eyo/55-86.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-86-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-86-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-86-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-86', 'excel_row', 44)
    );
  end if;

  -- 55-87: clef lincy M83-B17 SN/B
  -- stock 20 CTN x 24 paquet x 1 pcs = 480 pieces
  v_product_id := 'eba2cda3-7dde-4a65-9f67-ddf50bedb5dc'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 480;
  v_entry_id := 'a0b1712d-550a-4942-b3cb-b604804424c3'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy M83-B17 SN/B', '/products/eyo/55-87.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-87-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-87-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-87-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-87', 'excel_row', 45)
    );
  end if;

  -- 55-88: clef lincy M899-B103 SN/B
  -- stock 20 CTN x 24 paquet x 1 pcs = 480 pieces
  v_product_id := '278c2473-3422-4a1e-b993-58d56a9b1247'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 480;
  v_entry_id := '5a151fb0-a852-4ff6-a51c-071bb337be09'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy M899-B103 SN/B', '/products/eyo/55-88.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-88-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-88-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-88-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-88', 'excel_row', 46)
    );
  end if;

  -- 55-89: clef lincy M81-B13 CF
  -- stock 20 CTN x 24 paquet x 1 pcs = 480 pieces
  v_product_id := '3f43ff1e-48b6-429d-891b-4655d591ca97'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 480;
  v_entry_id := '0e8a9ade-b71f-45fe-bea9-14b698231a4b'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy M81-B13 CF', '/products/eyo/55-89.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-89-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-89-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-89-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-89', 'excel_row', 47)
    );
  end if;

  -- 55-90: clef lincy orange V8905-L09 SN/B
  -- stock 25 CTN x 16 paquet x 1 pcs = 400 pieces
  v_product_id := 'f754f965-fce6-4058-a833-34eb29302e34'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 400;
  v_entry_id := '86e36a33-9702-42e3-80cc-7100e3c48492'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy orange V8905-L09 SN/B', '/products/eyo/55-90.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-90-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-90-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-90-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-90', 'excel_row', 48)
    );
  end if;

  -- 55-91: clef lincy orange V85988-L72 SN/B
  -- stock 25 CTN x 16 paquet x 1 pcs = 400 pieces
  v_product_id := 'de0dd123-4aad-4b02-97c3-c4c196c0e7a0'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 400;
  v_entry_id := '62d6994f-339d-46a0-8aae-c797da40daa5'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy orange V85988-L72 SN/B', '/products/eyo/55-91.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-91-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-91-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-91-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-91', 'excel_row', 49)
    );
  end if;

  -- 55-92: clef lincy orange V8905-L61 SN/B
  -- stock 25 CTN x 16 paquet x 1 pcs = 400 pieces
  v_product_id := 'c68c7430-a220-48e0-90fb-f1a19bfb67fd'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 400;
  v_entry_id := '0336e635-3ed6-4783-b2b0-f3b8ce1369a0'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy orange V8905-L61 SN/B', '/products/eyo/55-92.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-92-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-92-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-92-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-92', 'excel_row', 50)
    );
  end if;

  -- 55-93: clef lincy orange V8502-L97 SN/B
  -- stock 25 CTN x 16 paquet x 1 pcs = 400 pieces
  v_product_id := 'a9b4d805-0cbb-4a4f-a156-f10b72ed964d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 400;
  v_entry_id := '44f89015-896d-483c-8336-e526608dcfde'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy orange V8502-L97 SN/B', '/products/eyo/55-93.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-93-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-93-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-93-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-93', 'excel_row', 51)
    );
  end if;

  -- 55-94: clef lincy orange V8502-L16 AB
  -- stock 25 CTN x 16 paquet x 1 pcs = 400 pieces
  v_product_id := '6df90407-55be-4b08-96e5-e12c56835d7d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 400;
  v_entry_id := '96432826-6b2b-48be-93d1-4928e7838bf8'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy orange V8502-L16 AB', '/products/eyo/55-94.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-94-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-94-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-94-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-94', 'excel_row', 52)
    );
  end if;

  -- 55-95: clef lincy orange V8942-LK2 SN/B
  -- stock 25 CTN x 16 paquet x 1 pcs = 400 pieces
  v_product_id := '5a522d84-2d48-4f66-b8fc-dba0dd6bb4d9'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 400;
  v_entry_id := '81809ef4-7607-448b-b774-6630a2e5a7c3'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy orange V8942-LK2 SN/B', '/products/eyo/55-95.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-95-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-95-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-95-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-95', 'excel_row', 53)
    );
  end if;

  -- 55-96: clef lincy orange V8896-L521 CF
  -- stock 25 CTN x 16 paquet x 1 pcs = 400 pieces
  v_product_id := '30ff4221-a048-4d2d-bae8-5337e917b14f'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 400;
  v_entry_id := 'c2250eee-0f5a-462e-b47e-379c0573a20f'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy orange V8896-L521 CF', '/products/eyo/55-96.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-96-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-96-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-96-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-96', 'excel_row', 54)
    );
  end if;

  -- 55-97: clef lincy orange V8705-L118 CF
  -- stock 25 CTN x 16 paquet x 1 pcs = 400 pieces
  v_product_id := 'aca614ef-7373-4405-ac23-a33a15c664a6'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 400;
  v_entry_id := '0bc5d848-dd8c-4c7b-93de-c96b92f25f8f'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy orange V8705-L118 CF', '/products/eyo/55-97.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-97-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-97-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-97-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-97', 'excel_row', 55)
    );
  end if;

  -- 55-98: DOOR HANDLE V8550-L66 CF
  -- stock 25 CTN x 16 paquet x 1 pcs = 400 pieces
  v_product_id := '778f46d7-de88-4869-aca6-4c58c25f9f48'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 400;
  v_entry_id := '9a9df47f-8e5d-4c1b-bf67-5873c1da4636'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'DOOR HANDLE V8550-L66 CF', '/products/eyo/55-98.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-98-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-98-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-98-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-98', 'excel_row', 56)
    );
  end if;

  -- 55-99: cle lincy orange V85455-LK3 CF
  -- stock 25 CTN x 16 paquet x 1 pcs = 400 pieces
  v_product_id := '44b8b45e-7882-47c5-9107-198f4512439c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 400;
  v_entry_id := 'ed17b277-1f65-4c46-8700-aa39e1ac1e41'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cle lincy orange V85455-LK3 CF', '/products/eyo/55-99.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-99-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-99-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-99-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-99', 'excel_row', 57)
    );
  end if;

  -- 55-100: clef lincy noir V8502-T012 BK
  -- stock 15 CTN x 24 paquet x 1 pcs = 360 pieces
  v_product_id := '139a259d-5348-4f9c-a9b0-fdf448100ab5'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 360;
  v_entry_id := '2bfce8e0-7100-4426-bcb5-3e5f20e56e70'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy noir V8502-T012 BK', '/products/eyo/55-100.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-100-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-100-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-100-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-100', 'excel_row', 58)
    );
  end if;

  -- 55-101: clef lincy noir V8502-T014 BK
  -- stock 15 CTN x 24 paquet x 1 pcs = 360 pieces
  v_product_id := '6aa5f609-4156-4538-99d0-88881b3c643d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 360;
  v_entry_id := 'd6a2184a-335c-4235-9d1e-2f3fbe80ce3d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy noir V8502-T014 BK', '/products/eyo/55-101.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-101-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-101-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-101-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-101', 'excel_row', 59)
    );
  end if;

  -- 55-102: clef lincy noir V8502-T022 BK
  -- stock 15 CTN x 24 paquet x 1 pcs = 360 pieces
  v_product_id := 'e46705d0-277a-4e12-aad7-afa6a8a01eca'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 360;
  v_entry_id := '559ac9f6-c7c7-491f-8499-bda405afb99f'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy noir V8502-T022 BK', '/products/eyo/55-102.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-102-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-102-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-102-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-102', 'excel_row', 60)
    );
  end if;

  -- 55-103: clef lincy V926-T21 SN/B
  -- stock 10 CTN x 24 paquet x 1 pcs = 240 pieces
  v_product_id := '77535028-a471-4084-8b15-7e7ac59c19d6'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 240;
  v_entry_id := 'c0759ba8-4891-449b-8b89-8e6bc366dde7'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy V926-T21 SN/B', '/products/eyo/55-103.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-103-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-103-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-103-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-103', 'excel_row', 61)
    );
  end if;

  -- 55-104: clef lincy V913-T09 SN/B
  -- stock 10 CTN x 24 paquet x 1 pcs = 240 pieces
  v_product_id := '67a8394f-3f2c-42b4-9bc5-07058b0517ba'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 240;
  v_entry_id := '55774b90-5e62-49de-8069-7292d12b34ea'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy V913-T09 SN/B', '/products/eyo/55-104.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-104-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-104-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-104-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-104', 'excel_row', 62)
    );
  end if;

  -- 55-105: clef lincy V925-T19 CF
  -- stock 10 CTN x 24 paquet x 1 pcs = 240 pieces
  v_product_id := '7cee1af5-684c-4369-bb59-23eb9747fe89'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 240;
  v_entry_id := '5c11f806-475f-40bd-bbf9-2c19a9a0cb8a'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy V925-T19 CF', '/products/eyo/55-105.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-105-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-105-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-105-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-105', 'excel_row', 63)
    );
  end if;

  -- 55-106: clef lincy V919-T15 CF
  -- stock 10 CTN x 24 paquet x 1 pcs = 240 pieces
  v_product_id := 'aba8b5b4-fa3c-4460-84d6-342fc8577018'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 240;
  v_entry_id := '7760dd86-104e-4f96-8f23-c333dabc3a9d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy V919-T15 CF', '/products/eyo/55-106.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-106-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-106-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-106-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-106', 'excel_row', 64)
    );
  end if;

  -- 55-107: canon d ore 70mm 5 clef
  -- stock 15 CTN x 10 paquet x 12 pcs = 1800 pieces
  v_product_id := '38ea642f-8bc4-4f80-b262-6967d231c650'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 120;
  v_stock := 1800;
  v_entry_id := '0d55bfbc-2dbf-4a12-a78f-a28b0919c0fd'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'canon d ore 70mm 5 clef', '/products/eyo/55-107.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-107-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-107-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-107-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-107', 'excel_row', 65)
    );
  end if;

  -- 55-108: cannon 70 sur plakette
  -- stock 15 CTN x 10 paquet x 12 pcs = 1800 pieces
  v_product_id := '015e9ebd-d723-4264-8751-5c18edc853ea'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 120;
  v_stock := 1800;
  v_entry_id := '78429ece-85ab-45f2-8102-8b30ade0a09e'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cannon 70 sur plakette', '/products/eyo/55-108.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-108-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-108-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-108-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-108', 'excel_row', 66)
    );
  end if;

  -- 55-109: clef lincy F124 WC SN
  -- stock 100 CTN x 12 paquet x 1 pcs = 1200 pieces
  v_product_id := 'aedaacdf-baef-4a8f-8431-b1bfe2d39de1'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 1200;
  v_entry_id := '60c403d5-c5a5-48e5-8f6b-7f6a5f0de55a'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy F124 WC SN', '/products/eyo/55-109.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-109-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-109-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-109-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    100, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-109', 'excel_row', 67)
    );
  end if;

  -- 55-110: clef lincy F124 WC SN
  -- stock 100 CTN x 12 paquet x 1 pcs = 1200 pieces
  v_product_id := '54d02ade-8ee2-43cb-a1e2-33b25d550a4d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 1200;
  v_entry_id := 'db3b4dbe-4b0c-41a5-a879-17b19f869fad'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy F124 WC SN', '/products/eyo/55-110.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-110-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-110-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-110-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    100, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-110', 'excel_row', 68)
    );
  end if;

  -- 55-111: clef lincy 129 WC SN
  -- stock 30 CTN x 12 paquet x 1 pcs = 360 pieces
  v_product_id := '1705728b-a402-4e2c-971e-107335bc67bc'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 360;
  v_entry_id := 'a266d8c7-4925-46d0-95e6-cebf51be6624'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy 129 WC SN', '/products/eyo/55-111.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-111-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-111-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-111-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    30, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-111', 'excel_row', 69)
    );
  end if;

  -- 55-112: clef lincy 129 WC SN
  -- stock 30 CTN x 12 paquet x 1 pcs = 360 pieces
  v_product_id := '25717f98-43ee-4b9d-be20-44881557e5bd'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 360;
  v_entry_id := '1e15367a-87f3-4638-ad81-b81fe7b94eb7'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy 129 WC SN', '/products/eyo/55-112.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-112-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-112-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-112-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    30, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-112', 'excel_row', 70)
    );
  end if;

  -- 55-113: clef lincy F137 WC SN
  -- stock 20 CTN x 12 paquet x 1 pcs = 240 pieces
  v_product_id := 'd19de525-b93a-46e9-a96f-939643b1dec7'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 240;
  v_entry_id := 'd9aad534-3238-4a8f-8693-211be92326d0'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy F137 WC SN', '/products/eyo/55-113.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-113-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-113-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-113-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-113', 'excel_row', 71)
    );
  end if;

  -- 55-114: clef lincy F137 WC SN
  -- stock 15 CTN x 12 paquet x 1 pcs = 180 pieces
  v_product_id := '40d837d4-c5ec-43fe-b379-55ef960f2ea2'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 180;
  v_entry_id := '0f88bde2-4c21-484a-9954-ef87708e0b6c'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy F137 WC SN', '/products/eyo/55-114.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-114-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-114-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-114-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-114', 'excel_row', 72)
    );
  end if;

  -- 55-115: clef lincy L109 WC SN
  -- stock 20 CTN x 12 paquet x 1 pcs = 240 pieces
  v_product_id := '76ff8627-9f27-4a72-ad50-5f57004b38d3'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 240;
  v_entry_id := 'df58f6af-d354-4923-97e8-0476cfa5a5dd'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy L109 WC SN', '/products/eyo/55-115.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-115-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-115-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-115-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-115', 'excel_row', 73)
    );
  end if;

  -- 55-116: clef lincy L109 WC SN
  -- stock 20 CTN x 12 paquet x 1 pcs = 240 pieces
  v_product_id := 'fe568f7a-1d84-4602-b269-c7fe0d6cbb34'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 240;
  v_entry_id := 'cd9f8e6e-708a-4e5f-87af-ac652ecc9b77'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef lincy L109 WC SN', '/products/eyo/55-116.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-116-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-116-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-116-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-116', 'excel_row', 74)
    );
  end if;

  -- FHM-40: scotch papier 48mm 40m
  -- stock 300 CTN x 12 paquet x 6 pcs = 21600 pieces
  v_product_id := 'f4c80003-df1f-43cb-9ce6-dda8d82028ee'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 6;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 72;
  v_stock := 21600;
  v_entry_id := '970ab35e-771d-46b1-ac4f-1d4ca7b049d6'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'scotch papier 48mm 40m', '/products/eyo/FHM-40.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'FHM-40-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'FHM-40-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'FHM-40-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    300, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'FHM-40', 'excel_row', 75)
    );
  end if;

  -- FHM-19: scotch papier 19mm 30M
  -- stock 132 CTN x 12 paquet x 16 pcs = 25344 pieces
  v_product_id := '8755180d-af7b-4cc5-a73f-5067d476c01a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 16;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 192;
  v_stock := 25344;
  v_entry_id := '63e75a68-6710-405c-9422-022144137fed'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'scotch papier 19mm 30M', '/products/eyo/FHM-19.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'FHM-19-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'FHM-19-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'FHM-19-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    132, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'FHM-19', 'excel_row', 76)
    );
  end if;

  -- 5-2: sie a bois 3721 16‘’ 1mm
  -- stock 5 CTN x 60 paquet x 1 pcs = 300 pieces
  v_product_id := '0e055dbc-214e-41fa-b5b0-3a3744b2ca6f'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 300;
  v_entry_id := '4df178e9-8d18-4aec-aa3a-e9c03b3fc0a1'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'sie a bois 3721 16‘’ 1mm', '/products/eyo/5-2.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-2', 'excel_row', 77)
    );
  end if;

  -- 5-3: sie a bois 3721 18‘’ 1mm
  -- stock 5 CTN x 60 paquet x 1 pcs = 300 pieces
  v_product_id := 'ac02bcc0-59a9-4aa7-85ef-f8c9745e4ce4'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 300;
  v_entry_id := 'a7ad88a5-56fb-4242-a97a-02b8cafd03fe'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'sie a bois 3721 18‘’ 1mm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-3', 'excel_row', 78)
    );
  end if;

  -- 5-4: sie a bois 3721 20‘’ 1mm (excel row 79)
  -- stock 3 CTN x 60 paquet x 1 pcs = 180 pieces
  v_product_id := 'e4b7b3d7-05ec-4a22-bd1b-95e38c616912'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 180;
  v_entry_id := '96adec13-f332-43a9-88f4-e417336b0415'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'sie a bois 3721 20‘’ 1mm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-4-R79-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-4-R79-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-4-R79-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-4', 'excel_row', 79)
    );
  end if;

  -- 5-5: sie a bois 3721 22‘’ 1mm
  -- stock 3 CTN x 60 paquet x 1 pcs = 180 pieces
  v_product_id := '66ae8dbb-cc3a-49ab-9392-a520e12e8c47'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 180;
  v_entry_id := 'bb99ceeb-7da6-4cfd-b2f8-74c3b1c4dbbb'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'sie a bois 3721 22‘’ 1mm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-5-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-5-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-5-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-5', 'excel_row', 80)
    );
  end if;

  -- 5-6: sie a bois 3721 24‘’ 1mm
  -- stock 3 CTN x 60 paquet x 1 pcs = 180 pieces
  v_product_id := '125343f4-03d3-4db3-9796-92e713c9b0de'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 180;
  v_entry_id := '95a6c5a6-8acc-4208-970d-86f8a1d8c6b1'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'sie a bois 3721 24‘’ 1mm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-6-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-6-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-6-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-6', 'excel_row', 81)
    );
  end if;

  -- 5-7: couteau evia (excel row 82)
  -- stock 10 CTN x 10 paquet x 12 pcs = 1200 pieces
  v_product_id := 'd27cf1ce-1f67-4104-a798-abf1f5c64791'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 120;
  v_stock := 1200;
  v_entry_id := 'e9ca3c21-2d9f-4b2c-898c-256fa44e5c33'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'couteau evia', '/products/eyo/5-7-R82.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-7-R82-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-7-R82-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-7-R82-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-7', 'excel_row', 82)
    );
  end if;

  -- 53-1: brosse de terre HZ-9003 (excel row 83)
  -- stock 20 CTN x 50 paquet x 1 pcs = 1000 pieces
  v_product_id := '210a253d-cf9a-4066-bc25-3d987b9391dd'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 50;
  v_stock := 1000;
  v_entry_id := 'b8df09fb-8c45-4d2a-a8bc-fcae36d604b9'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'brosse de terre HZ-9003', '/products/eyo/53-1-R83.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '53-1-R83-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '53-1-R83-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '53-1-R83-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '53-1', 'excel_row', 83)
    );
  end if;

  -- 53-2: balie HZ-008
  -- stock 50 CTN x 50 paquet x 1 pcs = 2500 pieces
  v_product_id := '9ce17365-b15b-44a4-be02-65fa63bcd8ed'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 50;
  v_stock := 2500;
  v_entry_id := 'ce6590ba-3b8c-4f62-8bcb-185468cdbdb3'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'balie HZ-008', '/products/eyo/53-2.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '53-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '53-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '53-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    50, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '53-2', 'excel_row', 84)
    );
  end if;

  -- 53-3: rateaux plastique HZ-1-22 RED-YELLO-BLUE-GREEN
  -- stock 10 CTN x 60 paquet x 1 pcs = 600 pieces
  v_product_id := '448c563e-5cbe-4b1a-92df-4934c979675c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 600;
  v_entry_id := '39f9099f-b978-4747-af68-3a3503c32f60'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'rateaux plastique HZ-1-22 RED-YELLO-BLUE-GREEN', '/products/eyo/53-3.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '53-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '53-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '53-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '53-3', 'excel_row', 85)
    );
  end if;

  -- 53-4: raklette plastique pt HZ-8072-33
  -- stock 20 CTN x 50 paquet x 1 pcs = 1000 pieces
  v_product_id := '2bd52136-c6e0-4013-8953-44fb5c13853a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 50;
  v_stock := 1000;
  v_entry_id := '1abce598-81e3-4043-a4a8-f81b8d0fa2ab'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'raklette plastique pt HZ-8072-33', '/products/eyo/53-4.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '53-4-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '53-4-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '53-4-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '53-4', 'excel_row', 86)
    );
  end if;

  -- 53-6: raklette en fer pt HZ-8509-35
  -- stock 5 CTN x 50 paquet x 1 pcs = 250 pieces
  v_product_id := 'f1df2fda-49ef-4795-85f7-326c71c0b22b'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 50;
  v_stock := 250;
  v_entry_id := '06d0dc71-4e3d-4f09-827f-597c15bb91fe'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'raklette en fer pt HZ-8509-35', '/products/eyo/53-6.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '53-6-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '53-6-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '53-6-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '53-6', 'excel_row', 87)
    );
  end if;

  -- 53-7: raklette en fer gr HZ-8509-45
  -- stock 5 CTN x 50 paquet x 1 pcs = 250 pieces
  v_product_id := 'c19f1b4d-e368-411f-9f79-8fe7fb5f19c8'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 50;
  v_stock := 250;
  v_entry_id := 'b9f6d471-e4c1-446f-a764-311b8d998ec5'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'raklette en fer gr HZ-8509-45', '/products/eyo/53-7.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '53-7-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '53-7-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '53-7-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '53-7', 'excel_row', 88)
    );
  end if;

  -- 53-6-1: bois HZ-1.2M
  -- stock 112 CTN x 50 paquet x 1 pcs = 5600 pieces
  v_product_id := 'ee594f23-6e90-48ba-af79-4b7fe82e1417'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 50;
  v_stock := 5600;
  v_entry_id := '3182ead7-fa40-4048-8bf4-90132f788e14'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'bois HZ-1.2M', '/products/eyo/53-6-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '53-6-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '53-6-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '53-6-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    112, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '53-6-1', 'excel_row', 89)
    );
  end if;

  -- 53-1: bosse de terre HZ-9003 (excel row 90)
  -- stock 10 CTN x 50 paquet x 1 pcs = 500 pieces
  v_product_id := 'ea9ce7ba-f0a0-4af9-98a5-9f5f5af2e52f'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 50;
  v_stock := 500;
  v_entry_id := 'a5bba40b-d97c-4ab7-9498-ee922f58880b'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'bosse de terre HZ-9003', '/products/eyo/53-1-R90.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '53-1-R90-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '53-1-R90-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '53-1-R90-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '53-1', 'excel_row', 90)
    );
  end if;

  -- 30-1: brosse wc HZ-8083
  -- stock 5 CTN x 120 paquet x 1 pcs = 600 pieces
  v_product_id := 'c78069eb-cb79-430d-a167-96c5f3d12535'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 600;
  v_entry_id := '9185d156-a0da-44f7-b3a5-64e273f2b5c3'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'brosse wc HZ-8083', '/products/eyo/30-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '30-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '30-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '30-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '30-1', 'excel_row', 91)
    );
  end if;

  -- 30-2: brosse wc HZ-8075
  -- stock 5 CTN x 120 paquet x 1 pcs = 600 pieces
  v_product_id := '2f809ac2-518c-459e-a49f-b2b9c54b1ae0'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 600;
  v_entry_id := '7d7d67ca-d013-426c-9eff-b3950032b075'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'brosse wc HZ-8075', '/products/eyo/30-2.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '30-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '30-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '30-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '30-2', 'excel_row', 92)
    );
  end if;

  -- G-3: bosse wc HZ-6018
  -- stock 5 CTN x 120 paquet x 1 pcs = 600 pieces
  v_product_id := '82a0190e-e736-450f-865e-7cb7e72c8deb'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 600;
  v_entry_id := '5fa16457-eef0-4f7a-83c3-aa7de48f75a8'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'bosse wc HZ-6018', '/products/eyo/G-3.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'G-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'G-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'G-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'G-3', 'excel_row', 93)
    );
  end if;

  -- 30-4: brosse wc HZ-6015
  -- stock 5 CTN x 120 paquet x 1 pcs = 600 pieces
  v_product_id := '92f4f908-dc2f-4b21-8b84-e3933bbc0593'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 600;
  v_entry_id := '90fef198-2c61-4c4f-9ff3-55c0d799c89f'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'brosse wc HZ-6015', '/products/eyo/30-4.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '30-4-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '30-4-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '30-4-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '30-4', 'excel_row', 94)
    );
  end if;

  -- 30-6: brosse wc HZ-888
  -- stock 5 CTN x 120 paquet x 1 pcs = 600 pieces
  v_product_id := '76c252f8-d497-402f-b895-85638f299da5'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 600;
  v_entry_id := '94ce0d42-86d5-4a67-9cef-c297a92d34ab'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'brosse wc HZ-888', '/products/eyo/30-6.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '30-6-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '30-6-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '30-6-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '30-6', 'excel_row', 95)
    );
  end if;

  -- 30-7: brosse wc HZ-8081
  -- stock 5 CTN x 120 paquet x 1 pcs = 600 pieces
  v_product_id := '25b0cf9e-7eb5-40b7-ba78-dccf66f23699'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 600;
  v_entry_id := '8e9a1e1a-245f-4409-82e8-31186c2b93af'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'brosse wc HZ-8081', '/products/eyo/30-7.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '30-7-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '30-7-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '30-7-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '30-7', 'excel_row', 96)
    );
  end if;

  -- 30-8: balai de tol HZ-7006
  -- stock 5 CTN x 100 paquet x 1 pcs = 500 pieces
  v_product_id := 'e16e02a1-4ab9-4e54-b453-e9211b6c0c22'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 500;
  v_entry_id := 'f12e21a9-9a6e-479b-bbd3-ecd24fca4d47'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'balai de tol HZ-7006', '/products/eyo/30-8.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '30-8-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '30-8-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '30-8-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '30-8', 'excel_row', 97)
    );
  end if;

  -- 37-2: teflon gr 19mm*15m* 0.20mm 25g
  -- stock 20 CTN x 50 paquet x 10 pcs = 10000 pieces
  v_product_id := '42f5bb28-c564-453a-8219-9f7cbbd9b377'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 10;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 500;
  v_stock := 10000;
  v_entry_id := '286216d3-5ca1-450e-9dc2-b640caed31d5'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'teflon gr 19mm*15m* 0.20mm 25g', '/products/eyo/37-2.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '37-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '37-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '37-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '37-2', 'excel_row', 98)
    );
  end if;

  -- 202: clef 2 coup 202
  -- stock 600 CTN x 24 paquet x 1 pcs = 14400 pieces
  v_product_id := '2d8a8413-c4e8-4909-9744-7dacce278f7f'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 14400;
  v_entry_id := '513e173b-edd5-4066-ac0e-a0d447862b39'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef 2 coup 202', '/products/eyo/202.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '202-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '202-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '202-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    600, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '202', 'excel_row', 99)
    );
  end if;

  -- 21-1: crochet XX-8
  -- stock 300 CTN x 20 paquet x 12 pcs = 72000 pieces
  v_product_id := 'a6873e5d-9dad-4e7a-8e00-8f5c1ef26933'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 240;
  v_stock := 72000;
  v_entry_id := '792a8d5e-56d4-4b09-b5ba-55731e1578d1'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet XX-8', '/products/eyo/21-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '21-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '21-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '21-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    300, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '21-1', 'excel_row', 100)
    );
  end if;

  -- 21-2: crochet XX-10
  -- stock 120 CTN x 20 paquet x 12 pcs = 28800 pieces
  v_product_id := '14ae06a1-7994-479c-8c9f-b285df9446ff'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 240;
  v_stock := 28800;
  v_entry_id := 'a679e216-68ef-490b-9472-f12c577d4ae4'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet XX-10', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '21-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '21-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '21-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    120, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '21-2', 'excel_row', 101)
    );
  end if;

  -- 21-3: crochet XX-12
  -- stock 175 CTN x 10 paquet x 12 pcs = 21000 pieces
  v_product_id := '7b29109b-51a9-40fc-9b3a-ae91a6641e7b'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 120;
  v_stock := 21000;
  v_entry_id := '249adbfe-c9fd-4de9-9349-281a0cff3952'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet XX-12', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '21-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '21-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '21-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    175, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '21-3', 'excel_row', 102)
    );
  end if;

  -- 21-4: crochet XX-14
  -- stock 120 CTN x 10 paquet x 12 pcs = 14400 pieces
  v_product_id := 'e96f8bab-d368-446e-89cb-d8afad986628'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 120;
  v_stock := 14400;
  v_entry_id := '3aa3432a-886c-4413-b70d-cb9364322cda'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet XX-14', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '21-4-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '21-4-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '21-4-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    120, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '21-4', 'excel_row', 103)
    );
  end if;

  -- 21-5: crochet XX-16
  -- stock 60 CTN x 8 paquet x 12 pcs = 5760 pieces
  v_product_id := 'c62c1432-be17-4537-af17-8aa808fa80a3'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 8;
  v_pcs_per_ctn := 96;
  v_stock := 5760;
  v_entry_id := 'be2a86c9-53f3-476d-8f13-47859f751a26'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet XX-16', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '21-5-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '21-5-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '21-5-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    60, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '21-5', 'excel_row', 104)
    );
  end if;

  -- 21-7: crochet vert 3''
  -- stock 5 CTN x 20 paquet x 12 pcs = 1200 pieces
  v_product_id := '8c093303-133b-4f19-b6e5-e50fb6233064'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 240;
  v_stock := 1200;
  v_entry_id := '2be86797-aa21-43aa-8bee-74dab3ddbd22'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet vert 3''''', '/products/eyo/21-7.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '21-7-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '21-7-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '21-7-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '21-7', 'excel_row', 105)
    );
  end if;

  -- 21-17: poignet 6''
  -- stock 5 CTN x 50 paquet x 12 pcs = 3000 pieces
  v_product_id := '82b2e6cb-7d42-4c7b-9de4-16964a21c5e6'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 600;
  v_stock := 3000;
  v_entry_id := '78562ae3-66c6-43ba-8527-f60580c0d51d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'poignet 6''''', '/products/eyo/21-17.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '21-17-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '21-17-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '21-17-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '21-17', 'excel_row', 106)
    );
  end if;

  -- CB-1: crochet WX12
  -- stock 5 CTN x 12 paquet x 12 pcs = 720 pieces
  v_product_id := 'b8383343-d24d-419c-a0b8-707a6db673df'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 144;
  v_stock := 720;
  v_entry_id := '6d0c6de7-c195-45be-a9a6-e06d6cf361f3'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet WX12', '/products/eyo/CB-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'CB-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'CB-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'CB-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'CB-1', 'excel_row', 107)
    );
  end if;

  -- CB-2: crochet WX14
  -- stock 5 CTN x 8 paquet x 12 pcs = 480 pieces
  v_product_id := 'e092178c-9cfe-41f7-abca-2be7c247fc3d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 8;
  v_pcs_per_ctn := 96;
  v_stock := 480;
  v_entry_id := 'e2eaacc0-b49a-444f-a550-ff54498e9232'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet WX14', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'CB-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'CB-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'CB-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'CB-2', 'excel_row', 108)
    );
  end if;

  -- CB-3: crochet WX16
  -- stock 5 CTN x 6 paquet x 12 pcs = 360 pieces
  v_product_id := '5045723d-348a-4d93-998f-92f8d071b72e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 6;
  v_pcs_per_ctn := 72;
  v_stock := 360;
  v_entry_id := '25bd1261-3efe-429f-bdc2-baa308a2f605'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'crochet WX16', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'CB-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'CB-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'CB-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'CB-3', 'excel_row', 109)
    );
  end if;

  -- 55-128: ventilateur frigo 5W
  -- stock 500 CTN x 20 paquet x 1 pcs = 10000 pieces
  v_product_id := 'c91819b2-37c1-49ac-8ec6-b808eb167587'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 10000;
  v_entry_id := 'f3d552bb-3f28-46ad-a1c3-4c6c91285e5d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'ventilateur frigo 5W', '/products/eyo/55-128.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-128-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-128-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-128-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    500, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-128', 'excel_row', 110)
    );
  end if;

  -- 40-1: pneu de brouette vide 25cm 14x4
  -- stock 200 CTN x 5 paquet x 1 pcs = 1000 pieces
  v_product_id := '2a17cb8f-f4c1-41dc-8935-68232f635713'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 5;
  v_pcs_per_ctn := 5;
  v_stock := 1000;
  v_entry_id := 'cedad61b-6787-4779-aa8c-45433390dfc4'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pneu de brouette vide 25cm 14x4', '/products/eyo/40-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '40-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '40-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '40-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    200, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '40-1', 'excel_row', 112)
    );
  end if;

  -- 40-2: pneu de brouette plein 25cm 14x4 (excel row 113)
  -- stock 100 CTN x 5 paquet x 1 pcs = 500 pieces
  v_product_id := '693d7225-9bb2-4bfd-9ffe-02d12854f1e4'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 5;
  v_pcs_per_ctn := 5;
  v_stock := 500;
  v_entry_id := '4c825462-4a6f-4f44-a702-dee008a2bfce'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pneu de brouette plein 25cm 14x4', '/products/eyo/40-2-R113.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '40-2-R113-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '40-2-R113-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '40-2-R113-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    100, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '40-2', 'excel_row', 113)
    );
  end if;

  -- 40-2: pneu de brouette plein 25cm 14x4 ORANGE COLOR (excel row 114)
  -- stock 100 CTN x 5 paquet x 1 pcs = 500 pieces
  v_product_id := '2077d0b5-b2e8-4050-9a1f-f398ddc3100d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 5;
  v_pcs_per_ctn := 5;
  v_stock := 500;
  v_entry_id := '5f6844db-2e54-4b0e-9c54-fbd913e50e8d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pneu de brouette plein 25cm 14x4 ORANGE COLOR', '/products/eyo/40-2-R114.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '40-2-R114-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '40-2-R114-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '40-2-R114-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    100, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '40-2', 'excel_row', 114)
    );
  end if;

  -- 40-30: roulette sur plakette 50MM 2w+2c
  -- stock 5 CTN x 120 paquet x 1 pcs = 600 pieces
  v_product_id := '4586e622-7681-4a1f-bc72-ea4a68251729'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 600;
  v_entry_id := '29b9c00a-bc1c-4d53-aeee-bd505c67939f'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'roulette sur plakette 50MM 2w+2c', '/products/eyo/40-30.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '40-30-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '40-30-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '40-30-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '40-30', 'excel_row', 115)
    );
  end if;

  -- 40-5: roulette orange 63.5mm-3"
  -- stock 15 CTN x 60 paquet x 1 pcs = 900 pieces
  v_product_id := '5c316f8d-1c27-4151-822e-ee4de584cbef'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 900;
  v_entry_id := '4123cf0b-a7af-4526-89ce-047b1018ebbb'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'roulette orange 63.5mm-3"', '/products/eyo/40-5.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '40-5-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '40-5-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '40-5-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '40-5', 'excel_row', 116)
    );
  end if;

  -- 40-6: roulette orange 75mm- 3"
  -- stock 10 CTN x 50 paquet x 1 pcs = 500 pieces
  v_product_id := 'c2f3610e-f871-4bb9-8ab0-cede8983b72d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 50;
  v_stock := 500;
  v_entry_id := '8db37980-b241-4553-85dd-c69ac5459681'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'roulette orange 75mm- 3"', '/products/eyo/40-6.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '40-6-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '40-6-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '40-6-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '40-6', 'excel_row', 117)
    );
  end if;

  -- 55-1: vise americain 3*20 YZP 200pcs/box
  -- stock 5 CTN x 120 paquet x 1 pcs = 600 pieces
  v_product_id := '110cca95-bcf6-4d05-a740-39ac040b016e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 600;
  v_entry_id := '340a0d97-c601-4348-a81c-313e01815ea4'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise americain 3*20 YZP 200pcs/box', '/products/eyo/55-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-1', 'excel_row', 118)
    );
  end if;

  -- 55-2: vise americain 3*25 YZP
  -- stock 10 CTN x 120 paquet x 1 pcs = 1200 pieces
  v_product_id := 'd2453112-97a5-4e8f-914a-8e592eeb3232'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 1200;
  v_entry_id := '9de7f72d-2d28-4b6c-b642-487eead12e95'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise americain 3*25 YZP', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-2', 'excel_row', 119)
    );
  end if;

  -- 55-3: vise americain 4*20 YZP
  -- stock 20 CTN x 72 paquet x 1 pcs = 1440 pieces
  v_product_id := 'f8796509-78ba-4017-a3ee-c94010b9a679'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 72;
  v_pcs_per_ctn := 72;
  v_stock := 1440;
  v_entry_id := '30ed7b8c-1ac4-4a91-9a4c-bfdb3d96a1ed'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise americain 4*20 YZP', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-3', 'excel_row', 120)
    );
  end if;

  -- 55-4: vise americain 4*25 YZP
  -- stock 25 CTN x 72 paquet x 1 pcs = 1800 pieces
  v_product_id := 'dade1c7d-3f0d-4082-8bd1-b70baff16f56'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 72;
  v_pcs_per_ctn := 72;
  v_stock := 1800;
  v_entry_id := 'c4b00917-c3fd-4026-b440-18e774f913ce'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise americain 4*25 YZP', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-4-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-4-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-4-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-4', 'excel_row', 121)
    );
  end if;

  -- 55-5: vise americain 4*30 YZP
  -- stock 35 CTN x 48 paquet x 1 pcs = 1680 pieces
  v_product_id := '05c6b7a1-c078-4abe-bef0-0650f6c084b8'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 1680;
  v_entry_id := '9ed8e284-28cb-4605-a960-bfbb3901b4db'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise americain 4*30 YZP', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-5-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-5-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-5-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    35, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-5', 'excel_row', 122)
    );
  end if;

  -- 55-6: vise americain 4*40 YZP
  -- stock 10 CTN x 30 paquet x 1 pcs = 300 pieces
  v_product_id := '95df5049-0c8f-456f-ba9c-99716700880d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 30;
  v_pcs_per_ctn := 30;
  v_stock := 300;
  v_entry_id := '73c24833-e085-4017-925f-cf63e39bae35'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise americain 4*40 YZP', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-6-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-6-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-6-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-6', 'excel_row', 123)
    );
  end if;

  -- 55-7: vise americain 4*50 YZP
  -- stock 10 CTN x 30 paquet x 1 pcs = 300 pieces
  v_product_id := '123f94df-40f4-42de-b120-6ab341e3b127'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 30;
  v_pcs_per_ctn := 30;
  v_stock := 300;
  v_entry_id := 'b4d131f4-3d35-481c-954d-24c6cf4f67a2'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise americain 4*50 YZP', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-7-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-7-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-7-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-7', 'excel_row', 124)
    );
  end if;

  -- 55-8: vise americain 4*60 YZP
  -- stock 10 CTN x 24 paquet x 1 pcs = 240 pieces
  v_product_id := '2df2a37a-4981-4a75-abda-9a5c56553156'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 240;
  v_entry_id := '259b74d7-8835-4b48-8501-f3d5753c2091'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise americain 4*60 YZP', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-8-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-8-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-8-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-8', 'excel_row', 125)
    );
  end if;

  -- 55-15: vise rappel gros grain lourd 12 box/ctn 50pcs/ctn
  -- stock 10 CTN x 12 paquet x 50 pcs = 6000 pieces
  v_product_id := 'fca2424c-13d2-4672-af18-81a05ee0a8b8'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 50;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 600;
  v_stock := 6000;
  v_entry_id := '56dade83-38d2-473c-abd5-db4b7fe22060'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise rappel gros grain lourd 12 box/ctn 50pcs/ctn', '/products/eyo/55-15.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-15-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-15-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-15-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-15', 'excel_row', 126)
    );
  end if;

  -- 55-133: vise 3.9*25 200 pcs/ small box
  -- stock 10 CTN x 72 paquet x 1 pcs = 720 pieces
  v_product_id := '51abaaea-6ada-4f08-b747-9ff2469d2876'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 72;
  v_pcs_per_ctn := 72;
  v_stock := 720;
  v_entry_id := '4419d913-0ada-4585-9fca-1995bc1f1bc7'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise 3.9*25 200 pcs/ small box', '/products/eyo/55-133.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-133-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-133-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-133-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-133', 'excel_row', 127)
    );
  end if;

  -- 55-134: vise 3.9*30 200pcs/ small box
  -- stock 10 CTN x 48 paquet x 1 pcs = 480 pieces
  v_product_id := '8564ff42-9023-46c4-992b-00f06c6e3910'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 480;
  v_entry_id := '41692010-9ce5-421b-8ef4-5273ac328fea'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise 3.9*30 200pcs/ small box', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-134-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-134-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-134-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-134', 'excel_row', 128)
    );
  end if;

  -- 55-135: vise 3.9*35 200pcs/small box
  -- stock 10 CTN x 48 paquet x 1 pcs = 480 pieces
  v_product_id := '7640a88d-79d0-4819-94ba-996983b39076'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 480;
  v_entry_id := '308f39c3-5453-459c-87c4-6e86abfa6664'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'vise 3.9*35 200pcs/small box', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-135-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-135-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-135-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-135', 'excel_row', 129)
    );
  end if;

  -- 45-1: sesail 24" (excel row 130)
  -- stock 10 CTN x 10 paquet x 1 pcs = 100 pieces
  v_product_id := 'e96935ec-5128-49c3-9f3b-7c2e3d2e13c7'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 10;
  v_stock := 100;
  v_entry_id := '939d14c8-cbdb-4617-bd37-4caf3b4914bb'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'sesail 24"', '/products/eyo/45-1-R130.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '45-1-R130-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '45-1-R130-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '45-1-R130-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '45-1', 'excel_row', 130)
    );
  end if;

  -- 45-2: sesail 30"
  -- stock 15 CTN x 5 paquet x 1 pcs = 75 pieces
  v_product_id := '936e8884-9e19-4cf3-b4fb-4d1b511dbacf'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 5;
  v_pcs_per_ctn := 5;
  v_stock := 75;
  v_entry_id := '0e794cc6-0388-4dd2-bab2-dbe99198d60f'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'sesail 30"', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '45-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '45-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '45-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '45-2', 'excel_row', 131)
    );
  end if;

  -- 45-3: sesail 36"
  -- stock 15 CTN x 5 paquet x 1 pcs = 75 pieces
  v_product_id := 'a08fa71f-e0f8-44e4-9828-8628e5f444b5'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 5;
  v_pcs_per_ctn := 5;
  v_stock := 75;
  v_entry_id := 'e77d58eb-40fd-4933-96b3-7fd485f5eb9b'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'sesail 36"', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '45-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '45-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '45-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '45-3', 'excel_row', 132)
    );
  end if;

  -- 47-1: pinse 290g 8"
  -- stock 10 CTN x 60 paquet x 1 pcs = 600 pieces
  v_product_id := '764f655a-c103-467d-8718-e3ee65205621'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 600;
  v_entry_id := '5ff09363-4625-40d0-9b44-64a46c542e03'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pinse 290g 8"', '/products/eyo/47-1.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-1', 'excel_row', 133)
    );
  end if;

  -- 47-12: akrafeuse 20259
  -- stock 5 CTN x 48 paquet x 1 pcs = 240 pieces
  v_product_id := '2093c59c-1452-45f0-8c6c-5b6f71bb1a40'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 240;
  v_entry_id := 'e6c40e63-fe83-4b37-8914-2dfeb75deb76'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'akrafeuse 20259', '/products/eyo/47-12.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-12-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-12-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-12-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-12', 'excel_row', 134)
    );
  end if;

  -- 47-14: cutter, 18 mm
  -- stock 3 CTN x 240 paquet x 1 pcs = 720 pieces
  v_product_id := '712d4121-7317-4bca-91e5-347e781f70aa'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 240;
  v_pcs_per_ctn := 240;
  v_stock := 720;
  v_entry_id := '1f214111-fe4b-41f6-be48-0c116f50867f'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cutter, 18 mm', '/products/eyo/47-14.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-14-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-14-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-14-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-14', 'excel_row', 135)
    );
  end if;

  -- 47-18: siseaux minusier plakette 4pcs
  -- stock 5 CTN x 48 paquet x 1 pcs = 240 pieces
  v_product_id := '2ff3cfb5-006b-407e-8c74-1b38c23fe129'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 240;
  v_entry_id := 'd36a81e4-3a84-4d12-be7c-2f57f58bf04d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'siseaux minusier plakette 4pcs', '/products/eyo/47-18.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-18-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-18-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-18-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-18', 'excel_row', 136)
    );
  end if;

  -- 47-19: truelle 7"
  -- stock 3 CTN x 120 paquet x 1 pcs = 360 pieces
  v_product_id := '3d8c772b-aaf5-4e8f-9ed8-d8fc1a6b6f7e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 360;
  v_entry_id := '5c552a60-678b-495c-8d53-8232f7185b1a'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'truelle 7"', '/products/eyo/47-19.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-19-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-19-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-19-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-19', 'excel_row', 137)
    );
  end if;

  -- 47-20: truelle 8"
  -- stock 5 CTN x 120 paquet x 1 pcs = 600 pieces
  v_product_id := 'cdb34ced-8c5d-4c56-a62c-8733aa271de9'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 600;
  v_entry_id := '1b70644d-984b-4203-96cc-f845dd37f130'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'truelle 8"', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-20-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-20-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-20-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-20', 'excel_row', 138)
    );
  end if;

  -- 47-21: truelle 9"
  -- stock 5 CTN x 120 paquet x 1 pcs = 600 pieces
  v_product_id := 'd847e607-a514-4d3f-aec2-9383ca9efc19'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 600;
  v_entry_id := 'e4d9bcb5-d8f0-493b-ae38-fe0c204adb3e'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'truelle 9"', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-21-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-21-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-21-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-21', 'excel_row', 139)
    );
  end if;

  -- 47-22: tournevisse plakette couleur 6pcs
  -- stock 5 CTN x 48 paquet x 1 pcs = 240 pieces
  v_product_id := 'd05d82ff-f701-462e-b029-e77c580ebcd0'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 240;
  v_entry_id := 'ae976459-b04b-4eed-9c94-a7abdce85ca8'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'tournevisse plakette couleur 6pcs', '/products/eyo/47-22.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-22-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-22-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-22-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-22', 'excel_row', 140)
    );
  end if;

  -- 3-23: polie 140
  -- stock 5 CTN x 20 paquet x 1 pcs = 100 pieces
  v_product_id := '85f198fc-e381-4edc-8e89-4ae2f4ce582a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 100;
  v_entry_id := '3d01bed3-0b4e-44c3-80b3-b1ed9faaa6d8'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'polie 140', '/products/eyo/3-23.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '3-23-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '3-23-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '3-23-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '3-23', 'excel_row', 141)
    );
  end if;

  -- 3-24: polie 160
  -- stock 5 CTN x 16 paquet x 1 pcs = 80 pieces
  v_product_id := '24667bcb-934e-42d8-863f-6e52eb9acc8c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 80;
  v_entry_id := '0fdc2075-cc35-4c93-9b7c-f03c66972b4b'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'polie 160', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '3-24-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '3-24-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '3-24-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '3-24', 'excel_row', 142)
    );
  end if;

  -- 3-25: polie 180
  -- stock 5 CTN x 16 paquet x 1 pcs = 80 pieces
  v_product_id := '04a40d14-4210-40ac-af0c-72a462c1972c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 16;
  v_pcs_per_ctn := 16;
  v_stock := 80;
  v_entry_id := 'b28002bb-a272-499b-8e07-9c4c87c639ca'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'polie 180', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '3-25-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '3-25-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '3-25-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '3-25', 'excel_row', 143)
    );
  end if;

  -- 3-26: polie 200
  -- stock 5 CTN x 12 paquet x 1 pcs = 60 pieces
  v_product_id := '4b86b9e9-1c63-41de-b993-cf1f9dce7aff'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 60;
  v_entry_id := '6c8e238d-74f5-48b8-b6d3-f823b0a0948a'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'polie 200', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '3-26-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '3-26-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '3-26-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '3-26', 'excel_row', 144)
    );
  end if;

  -- 47-2: tenail 9"
  -- stock 20 CTN x 10 paquet x 6 pcs = 1200 pieces
  v_product_id := 'df323425-c92a-4d01-9637-d2a906ee26e3'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 6;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 60;
  v_stock := 1200;
  v_entry_id := 'f77383e1-f0de-4320-8e1d-13a7cc481e5f'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'tenail 9"', '/products/eyo/47-2.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-2', 'excel_row', 145)
    );
  end if;

  -- 47-3: tournevisse plakette vert 6pcs
  -- stock 5 CTN x 48 paquet x 1 pcs = 240 pieces
  v_product_id := '72f3a3ad-3340-4164-b81f-757db11729fe'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 240;
  v_entry_id := '6c400483-cb63-4199-b933-2c1ee746b917'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'tournevisse plakette vert 6pcs', '/products/eyo/47-3.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-3', 'excel_row', 146)
    );
  end if;

  -- 47-5: Double- tournevisse 4"
  -- stock 5 CTN x 240 paquet x 1 pcs = 1200 pieces
  v_product_id := '01fa0d82-f905-4f7a-ab85-771e25f7d103'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 240;
  v_pcs_per_ctn := 240;
  v_stock := 1200;
  v_entry_id := 'f72b47c5-3b1c-4592-8a5e-c46aa3601a11'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'Double- tournevisse 4"', '/products/eyo/47-5.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-5-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-5-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-5-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-5', 'excel_row', 147)
    );
  end if;

  -- 47-6: siseau fleur vert 10"
  -- stock 10 CTN x 48 paquet x 1 pcs = 480 pieces
  v_product_id := '5221b915-88fb-4620-b974-beee4874d24d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 480;
  v_entry_id := 'f9f05bfe-2b77-4d7e-bcfe-8f1d449c178c'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'siseau fleur vert 10"', '/products/eyo/47-6.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-6-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-6-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-6-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-6', 'excel_row', 148)
    );
  end if;

  -- 47-7: siseau fleur vert 12"
  -- stock 5 CTN x 36 paquet x 1 pcs = 180 pieces
  v_product_id := '6cbf6bb0-cfad-4de8-bd76-c850afa6721e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 36;
  v_pcs_per_ctn := 36;
  v_stock := 180;
  v_entry_id := '86e29b6a-ea6c-4686-a899-8f1a603dd701'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'siseau fleur vert 12"', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-7-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-7-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-7-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-7', 'excel_row', 149)
    );
  end if;

  -- 47-11: plakette tournvisse 6mm*100mm 6mm*125mm 6mm*150mm 6mm*200mm
  -- stock 5 CTN x 48 paquet x 1 pcs = 240 pieces
  v_product_id := '87c53433-cb9b-4940-8ced-5eb1cf7be154'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 240;
  v_entry_id := '722f50db-59ba-42d9-8b7c-6b0b3502a099'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'plakette tournvisse 6mm*100mm 6mm*125mm 6mm*150mm 6mm*200mm', '/products/eyo/47-11.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-11-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-11-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-11-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-11', 'excel_row', 150)
    );
  end if;

  -- 47-13: plakette tournevisse rouge 6pcs
  -- stock 10 CTN x 60 paquet x 1 pcs = 600 pieces
  v_product_id := '9a5baed0-4505-4fc2-84f0-1e6edea05040'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 600;
  v_entry_id := 'a91043d2-4e1f-4339-85d2-45826b7882cf'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'plakette tournevisse rouge 6pcs', '/products/eyo/47-13.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-13-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-13-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-13-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-13', 'excel_row', 151)
    );
  end if;

  -- 47-15: testeur gr 1175 big
  -- stock 3 CTN x 25 paquet x 20 pcs = 1500 pieces
  v_product_id := '478362fe-edd4-4ed8-8e33-e320e67c1902'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 20;
  v_pkg_per_ctn := 25;
  v_pcs_per_ctn := 500;
  v_stock := 1500;
  v_entry_id := 'a8b2d88c-172a-4fed-9dda-9fd81e35ac85'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'testeur gr 1175 big', '/products/eyo/47-15.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-15-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-15-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-15-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-15', 'excel_row', 152)
    );
  end if;

  -- 47-16: testeur pt 1175 small
  -- stock 4 CTN x 25 paquet x 20 pcs = 2000 pieces
  v_product_id := '77c3c401-2d3f-4bdc-a0b2-eabb5e67c687'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 20;
  v_pkg_per_ctn := 25;
  v_pcs_per_ctn := 500;
  v_stock := 2000;
  v_entry_id := '8bf1f693-95e7-47ce-885b-10c8822ce118'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'testeur pt 1175 small', '/products/eyo/47-16.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-16-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-16-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-16-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    4, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-16', 'excel_row', 153)
    );
  end if;

  -- 50-1: marteau arrache clou americain gr 592g
  -- stock 15 CTN x 48 paquet x 1 pcs = 720 pieces
  v_product_id := '6f170931-d469-4033-9c82-1e21a1f3cb3e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 720;
  v_entry_id := '7f5592e0-4407-49a1-b4d5-d194dcc4505a'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'marteau arrache clou americain gr 592g', '/products/eyo/50-1.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '50-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '50-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '50-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '50-1', 'excel_row', 154)
    );
  end if;

  -- 50-22: marteau arrache clou americain pt 250 gr
  -- stock 5 CTN x 60 paquet x 1 pcs = 300 pieces
  v_product_id := 'cf521ae3-53aa-47d1-b622-b51b6dbb33f0'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 300;
  v_entry_id := '370978e2-5238-4174-b773-a1bed17a4de6'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'marteau arrache clou americain pt 250 gr', '/products/eyo/50-22.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '50-22-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '50-22-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '50-22-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '50-22', 'excel_row', 155)
    );
  end if;

  -- 50-23: marteau arrache clou bleu 592gr grand
  -- stock 10 CTN x 48 paquet x 1 pcs = 480 pieces
  v_product_id := 'c3c93264-0eae-4286-8938-a95c5692030c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 480;
  v_entry_id := '93ee9540-ce22-4527-a6e1-4ddb6c8469da'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'marteau arrache clou bleu 592gr grand', '/products/eyo/50-23.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '50-23-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '50-23-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '50-23-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '50-23', 'excel_row', 156)
    );
  end if;

  -- B-14: marteau arrache clou bleu pt 250G
  -- stock 10 CTN x 60 paquet x 1 pcs = 600 pieces
  v_product_id := '2be207b0-5966-401a-b73c-1e6f324f4777'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 600;
  v_entry_id := '8f61f62b-85a0-4738-bae3-8a3f44cea579'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'marteau arrache clou bleu pt 250G', '/products/eyo/B-14.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'B-14-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'B-14-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'B-14-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'B-14', 'excel_row', 157)
    );
  end if;

  -- 3-4: decameter 30
  -- stock 5 CTN x 48 paquet x 1 pcs = 240 pieces
  v_product_id := '453a1cb7-c5f3-4876-9e54-8dc16cd10e2e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 240;
  v_entry_id := '30a28f84-dbc9-4aff-8850-a3af02aba7f0'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'decameter 30', '/products/eyo/3-4.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '3-4-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '3-4-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '3-4-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '3-4', 'excel_row', 158)
    );
  end if;

  -- 3-5: decameter 50
  -- stock 15 CTN x 48 paquet x 1 pcs = 720 pieces
  v_product_id := 'a7fe03e6-35c1-48e4-b2a8-95870c370b5d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 720;
  v_entry_id := 'cfd8d8a9-1837-46fa-b3a1-c53c24bc02ce'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'decameter 50', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '3-5-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '3-5-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '3-5-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '3-5', 'excel_row', 159)
    );
  end if;

  -- 3-6: decameter 100
  -- stock 10 CTN x 24 paquet x 1 pcs = 240 pieces
  v_product_id := '2150761f-1bda-4248-9cf0-eb882993760a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 240;
  v_entry_id := '09ae207c-e041-4c81-9a13-e232cd343a36'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'decameter 100', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '3-6-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '3-6-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '3-6-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '3-6', 'excel_row', 160)
    );
  end if;

  -- 47-17: pinse a gaz
  -- stock 5 CTN x 10 paquet x 6 pcs = 300 pieces
  v_product_id := '01885888-0067-4e03-9576-fa97005d150d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 6;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 60;
  v_stock := 300;
  v_entry_id := 'c59c07b5-3d53-4f21-8000-981dff06cdab'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pinse a gaz', '/products/eyo/47-17.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-17-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-17-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-17-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-17', 'excel_row', 161)
    );
  end if;

  -- 47-23: tenail 9 blanc
  -- stock 10 CTN x 10 paquet x 6 pcs = 600 pieces
  v_product_id := '26d74ab2-8764-48f5-ad2a-4300c5301c13'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 6;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 60;
  v_stock := 600;
  v_entry_id := 'a5aa94a4-9267-4c2c-89a9-78585d06c18e'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'tenail 9 blanc', '/products/eyo/47-23.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-23-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-23-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-23-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-23', 'excel_row', 162)
    );
  end if;

  -- 55-136: pinse org
  -- stock 5 CTN x 10 paquet x 6 pcs = 300 pieces
  v_product_id := '16b51d47-d8a5-4b23-ab6d-befb016ab8ed'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 6;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 60;
  v_stock := 300;
  v_entry_id := '13d3da3c-15c3-4a4f-a4a8-2ab3ff31eecb'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pinse org', '/products/eyo/55-136.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-136-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-136-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-136-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-136', 'excel_row', 163)
    );
  end if;

  -- 55-137: Mini wire stripper
  -- stock 2 CTN x 10 paquet x 6 pcs = 120 pieces
  v_product_id := '18f55351-3eca-4fa5-a447-7d9ee12aa10a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 6;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 60;
  v_stock := 120;
  v_entry_id := 'ea664efa-03b1-4d23-9522-1e38df8136c4'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'Mini wire stripper', '/products/eyo/55-137.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-137-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-137-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-137-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    2, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-137', 'excel_row', 164)
    );
  end if;

  -- 55-139: siseau fleur rouge
  -- stock 10 CTN x 10 paquet x 6 pcs = 600 pieces
  v_product_id := '8a82e450-bf39-4d37-82b3-98eb89a540e3'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 6;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 60;
  v_stock := 600;
  v_entry_id := 'aefca822-6832-443e-936e-1c7174510357'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'siseau fleur rouge', '/products/eyo/55-139.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-139-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-139-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-139-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-139', 'excel_row', 165)
    );
  end if;

  -- 55-140-1: siseau minusier N12
  -- stock 3 CTN x 120 paquet x 1 pcs = 360 pieces
  v_product_id := 'de304bb5-9706-4fb4-a0dc-846ee544b651'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 360;
  v_entry_id := '6fcea38c-98e6-40c2-bb41-c0886142187f'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'siseau minusier N12', '/products/eyo/55-140-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-140-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-140-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-140-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-140-1', 'excel_row', 166)
    );
  end if;

  -- 55-140-2: siseau minusier N14
  -- stock 3 CTN x 120 paquet x 1 pcs = 360 pieces
  v_product_id := 'e15fa045-e710-402c-b442-5d168c2f6d67'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 360;
  v_entry_id := '5dcaa272-69bc-486f-a9f1-ea41643681e4'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'siseau minusier N14', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-140-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-140-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-140-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-140-2', 'excel_row', 167)
    );
  end if;

  -- 55-140-3: siseau minusier N15
  -- stock 6 CTN x 120 paquet x 1 pcs = 720 pieces
  v_product_id := 'e890cc2c-389a-43e8-a198-a11df45b5447'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 720;
  v_entry_id := 'cba2a039-cb35-4e1d-9a68-09b3cc5853b8'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'siseau minusier N15', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-140-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-140-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-140-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    6, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-140-3', 'excel_row', 168)
    );
  end if;

  -- 55-140-4: siseau minusier N16
  -- stock 3 CTN x 120 paquet x 1 pcs = 360 pieces
  v_product_id := '95b4656e-394a-4f24-a38c-63dedc44af2e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 360;
  v_entry_id := '9e0656dd-5a2a-425d-9951-1de4366747f4'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'siseau minusier N16', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-140-4-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-140-4-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-140-4-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-140-4', 'excel_row', 169)
    );
  end if;

  -- 55-140-5: siseau minusier N18
  -- stock 3 CTN x 120 paquet x 1 pcs = 360 pieces
  v_product_id := 'd1a4042d-91ac-4941-9e02-3c7f7db0dc9a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 360;
  v_entry_id := 'f0f2541f-ff8a-481d-8cc1-b2568dec6e12'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'siseau minusier N18', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-140-5-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-140-5-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-140-5-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-140-5', 'excel_row', 170)
    );
  end if;

  -- 55-145: clef alain SMALL SIZE
  -- stock 3 CTN x 72 paquet x 1 pcs = 216 pieces
  v_product_id := 'ce4f7214-ff28-4392-9354-9b527d7f85c5'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 72;
  v_pcs_per_ctn := 72;
  v_stock := 216;
  v_entry_id := '7afb0bff-0699-4ef7-99f1-d65f31bf5624'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef alain SMALL SIZE', '/products/eyo/55-145.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-145-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-145-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-145-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-145', 'excel_row', 171)
    );
  end if;

  -- 55-146: clef alain MID SIZE
  -- stock 3 CTN x 60 paquet x 1 pcs = 180 pieces
  v_product_id := '2f07f79e-ef8b-484e-9da2-b02d46e19241'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 180;
  v_entry_id := '2d6b7c51-18d4-494c-b450-05c8130acbe8'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef alain MID SIZE', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-146-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-146-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-146-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-146', 'excel_row', 172)
    );
  end if;

  -- 55-147: plakette tournevisse org 6PCS
  -- stock 3 CTN x 48 paquet x 1 pcs = 144 pieces
  v_product_id := 'bc2161e1-40ff-46d2-838a-d183d24362d7'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 144;
  v_entry_id := 'e54621ed-c01a-446c-8902-ca2c27f81f81'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'plakette tournevisse org 6PCS', '/products/eyo/55-147.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-147-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-147-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-147-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-147', 'excel_row', 173)
    );
  end if;

  -- 55-148: plakette tournevisse org 4PCS
  -- stock 5 CTN x 48 paquet x 1 pcs = 240 pieces
  v_product_id := '281a03f0-4bce-4248-b6a4-881f7349af17'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 240;
  v_entry_id := 'be44cf87-dd02-426b-9f60-aa340d9e2955'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'plakette tournevisse org 4PCS', '/products/eyo/55-148.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-148-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-148-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-148-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-148', 'excel_row', 174)
    );
  end if;

  -- 55-149-1: METER 3 m 0.88mm
  -- stock 10 CTN x 20 paquet x 12 pcs = 2400 pieces
  v_product_id := '949d7773-ef3f-4e47-a5a7-ba06bb2855d8'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 240;
  v_stock := 2400;
  v_entry_id := '37dba01f-a436-4ab1-bd5b-69bdcb67f60f'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'METER 3 m 0.88mm', '/products/eyo/55-149-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-149-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-149-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-149-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-149-1', 'excel_row', 175)
    );
  end if;

  -- 55-149-2: METER 5 m 0.88mm
  -- stock 10 CTN x 20 paquet x 12 pcs = 2400 pieces
  v_product_id := '07e96617-a205-4a70-9a5d-2e48c4b291f9'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 240;
  v_stock := 2400;
  v_entry_id := '0606495f-cfd1-44fe-a9b3-0afc9c6ca3d4'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'METER 5 m 0.88mm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-149-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-149-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-149-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-149-2', 'excel_row', 176)
    );
  end if;

  -- 47-9: niveau a visse 50cm
  -- stock 5 CTN x 60 paquet x 1 pcs = 300 pieces
  v_product_id := '0a082b78-f7ec-4ba7-a524-e1ff63ffc031'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 300;
  v_entry_id := '983dffff-2e47-400e-8a34-c78842b0ce47'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'niveau a visse 50cm', '/products/eyo/47-9.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-9-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-9-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-9-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-9', 'excel_row', 177)
    );
  end if;

  -- 47-10: niveau a visse 60cm
  -- stock 5 CTN x 60 paquet x 1 pcs = 300 pieces
  v_product_id := '479b1214-baa4-4a01-bbfb-7a5db6646a7b'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 300;
  v_entry_id := '733fcd65-d40a-4296-86dc-accdb979b0cd'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'niveau a visse 60cm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '47-10-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '47-10-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '47-10-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '47-10', 'excel_row', 178)
    );
  end if;

  -- 51-1: contacte ventilateur
  -- stock 25 CTN x 60 paquet x 1 pcs = 1500 pieces
  v_product_id := '6c522d53-e640-437d-9968-fa24c1712808'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'electrecite';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 1500;
  v_entry_id := '5a55577a-d31c-4ccf-bc90-bf785b8f99c6'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'electrecite';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'contacte ventilateur', '/products/eyo/51-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '51-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '51-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '51-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '51-1', 'excel_row', 179)
    );
  end if;

  -- 55-151: clef palacare 2 coup org 12pcs/box 20box/ctn
  -- stock 25 CTN x 20 paquet x 12 pcs = 6000 pieces
  v_product_id := 'b5d18bae-c252-4988-8a62-bc1e9905df1a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 240;
  v_stock := 6000;
  v_entry_id := '6374be56-2eb2-42b7-a60f-c9419a1b9e62'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef palacare 2 coup org 12pcs/box 20box/ctn', '/products/eyo/55-151.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-151-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-151-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-151-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-151', 'excel_row', 180)
    );
  end if;

  -- 26-70: robinnet moto 1/2" 98g
  -- stock 25 CTN x 100 paquet x 1 pcs = 2500 pieces
  v_product_id := 'ad3ed6f5-9f43-46c5-a457-9c6a6d5b21cf'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 2500;
  v_entry_id := '02736ea6-7ef1-4640-a46c-898386df4056'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'robinnet moto 1/2" 98g', '/products/eyo/26-70.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '26-70-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '26-70-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '26-70-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '26-70', 'excel_row', 181)
    );
  end if;

  -- 26-71: robinnet moto 3/4" 118g
  -- stock 5 CTN x 100 paquet x 1 pcs = 500 pieces
  v_product_id := 'ecab4680-5d84-4c25-bea1-4d9b829ef1ad'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 500;
  v_entry_id := 'a23706ab-5c78-4c11-80cb-01f9492aef28'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'robinnet moto 3/4" 118g', '/products/eyo/26-71.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '26-71-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '26-71-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '26-71-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '26-71', 'excel_row', 182)
    );
  end if;

  -- 38-1: robinnet cuisinne plastique
  -- stock 10 CTN x 100 paquet x 1 pcs = 1000 pieces
  v_product_id := 'd75e9617-7631-41e0-aad9-ae77ef98d96e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 1000;
  v_entry_id := '7c19c27e-4daf-4a65-aaeb-614ad75443b2'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'robinnet cuisinne plastique', '/products/eyo/38-1.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '38-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '38-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '38-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '38-1', 'excel_row', 183)
    );
  end if;

  -- 38-2: robinnet lavabo plastique
  -- stock 3 CTN x 120 paquet x 1 pcs = 360 pieces
  v_product_id := '82dcff2a-45c9-4699-a4c9-5875c85b6906'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 360;
  v_entry_id := 'e432b0e4-4e7f-458a-8d95-bec3763d84a5'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'robinnet lavabo plastique', '/products/eyo/38-2.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '38-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '38-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '38-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '38-2', 'excel_row', 184)
    );
  end if;

  -- 38-3: robinnet douche plastique
  -- stock 3 CTN x 250 paquet x 1 pcs = 750 pieces
  v_product_id := 'aa83a017-b29a-42f4-91fc-c541b116efd6'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 250;
  v_pcs_per_ctn := 250;
  v_stock := 750;
  v_entry_id := '8bb00d9a-008f-4d55-8ed8-b94aa97f4731'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'robinnet douche plastique', '/products/eyo/38-3.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '38-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '38-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '38-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '38-3', 'excel_row', 185)
    );
  end if;

  -- 2-1: visse+cheville N8 Grey 50pcs
  -- stock 10 CTN x 100 paquet x 1 pcs = 1000 pieces
  v_product_id := 'e444095c-bead-40b5-8462-64235ce2570c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'electrecite';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 1000;
  v_entry_id := '37969945-d43c-4bed-8230-63de82cd434b'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'electrecite';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'visse+cheville N8 Grey 50pcs', '/products/eyo/2-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '2-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '2-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '2-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '2-1', 'excel_row', 186)
    );
  end if;

  -- 2-2: visse+cheville N10 Grey 50pcs
  -- stock 5 CTN x 100 paquet x 1 pcs = 500 pieces
  v_product_id := 'adb57408-159d-494c-b557-35b3929bbdd8'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'electrecite';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 500;
  v_entry_id := '6abd3ea9-5ea2-4e07-86fa-9119f08320de'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'electrecite';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'visse+cheville N10 Grey 50pcs', '/products/eyo/2-2.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '2-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '2-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '2-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '2-2', 'excel_row', 187)
    );
  end if;

  -- 5-4: matchette M206B 18 (excel row 188)
  -- stock 50 CTN x 48 paquet x 1 pcs = 2400 pieces
  v_product_id := '2fb08a9e-fded-4935-b660-38680b2fe0e7'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 2400;
  v_entry_id := '5e26610c-2d9e-4c9e-8d66-f2e2a9c471e3'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'matchette M206B 18', '/products/eyo/5-4-R188.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-4-R188-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-4-R188-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-4-R188-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    50, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-4', 'excel_row', 188)
    );
  end if;

  -- 5-88: matchette BLADE M208 19
  -- stock 20 CTN x 48 paquet x 1 pcs = 960 pieces
  v_product_id := 'dfac89ea-618c-4031-8d2c-3510ff4b1a86'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 960;
  v_entry_id := 'f19ec17e-ab4d-40ef-a883-68d70eaa93db'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'matchette BLADE M208 19', '/products/eyo/5-88.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-88-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-88-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-88-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-88', 'excel_row', 189)
    );
  end if;

  -- 5-7: fourche 3 dent rouge 1.3KG (excel row 190)
  -- stock 5 CTN x 12 paquet x 1 pcs = 60 pieces
  v_product_id := 'f603e5f8-2d98-4af2-af77-9e7283efd763'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 60;
  v_entry_id := '917164b7-5f4e-4479-8455-6ada47270491'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'fourche 3 dent rouge 1.3KG', '/products/eyo/5-7-R190.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-7-R190-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-7-R190-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-7-R190-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-7', 'excel_row', 190)
    );
  end if;

  -- 5-8: fourche 4 dent noir 1.5KG
  -- stock 5 CTN x 12 paquet x 1 pcs = 60 pieces
  v_product_id := '15a00842-df64-4659-900d-28802242009e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 12;
  v_pcs_per_ctn := 12;
  v_stock := 60;
  v_entry_id := '9099a856-8a32-4b1c-be2d-edeb3763f7d1'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'fourche 4 dent noir 1.5KG', '/products/eyo/5-8.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-8-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-8-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-8-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-8', 'excel_row', 191)
    );
  end if;

  -- 5-9: rateaux 12t 3MM gray
  -- stock 30 CTN x 60 paquet x 1 pcs = 1800 pieces
  v_product_id := '2de81591-24f6-4f6a-afa1-8d090d40cfad'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 1800;
  v_entry_id := '37f2793c-8df0-4803-953a-33e82be4d723'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'rateaux 12t 3MM gray', '/products/eyo/5-9.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-9-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-9-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-9-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    30, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-9', 'excel_row', 192)
    );
  end if;

  -- 5-10: rateaux 14T 3MM gray
  -- stock 30 CTN x 60 paquet x 1 pcs = 1800 pieces
  v_product_id := '21b6a029-9e9b-4dae-8174-17870171206a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 1800;
  v_entry_id := 'ea71e589-fb28-4ebb-a719-1d0f43244f97'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'rateaux 14T 3MM gray', '/products/eyo/5-10.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-10-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-10-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-10-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    30, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-10', 'excel_row', 193)
    );
  end if;

  -- 5-11: rataux 12t 2.5MM
  -- stock 30 CTN x 48 paquet x 1 pcs = 1440 pieces
  v_product_id := 'c6867460-262d-478d-a628-1f034eb33c8f'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 1440;
  v_entry_id := '3dcf642d-cecb-4366-b668-c54ad1fcf0ae'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'rataux 12t 2.5MM', '/products/eyo/5-11.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-11-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-11-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-11-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    30, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-11', 'excel_row', 194)
    );
  end if;

  -- 5-12: rateaux 14T 2MM
  -- stock 30 CTN x 48 paquet x 1 pcs = 1440 pieces
  v_product_id := 'ca97f6ac-8783-49d2-bcff-eda1f94abbfc'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 1440;
  v_entry_id := 'f49fe748-2bad-48b8-9b5c-ac800f375f67'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'rateaux 14T 2MM', '/products/eyo/5-12.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '5-12-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '5-12-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '5-12-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    30, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '5-12', 'excel_row', 195)
    );
  end if;

  -- RBT-8: 1/2 robinnet a boisso
  -- stock 10 CTN x 10 paquet x 12 pcs = 1200 pieces
  v_product_id := '04335c49-ed8b-4e41-80d6-4e83b691c4d9'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 120;
  v_stock := 1200;
  v_entry_id := 'f1483de4-3c7b-43a1-8c5b-8fea7baee20a'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    '1/2 robinnet a boisso', '/products/eyo/RBT-8.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RBT-8-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RBT-8-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RBT-8-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RBT-8', 'excel_row', 196)
    );
  end if;

  -- RBT-12: 1/2 robinnet arret a bpoisso
  -- stock 2 CTN x 10 paquet x 12 pcs = 240 pieces
  v_product_id := '825ffb7c-e271-4316-9e45-1d6581a18634'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 120;
  v_stock := 240;
  v_entry_id := 'b0a057ec-5821-4103-bbe3-18d8222cb437'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    '1/2 robinnet arret a bpoisso', '/products/eyo/RBT-12.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RBT-12-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RBT-12-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RBT-12-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    2, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RBT-12', 'excel_row', 197)
    );
  end if;

  -- 9-18: mecanisme oli
  -- stock 100 CTN x 25 paquet x 1 pcs = 2500 pieces
  v_product_id := '6dd4ebbb-a00b-42bd-a4e6-82c9d9ec7aa1'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 25;
  v_pcs_per_ctn := 25;
  v_stock := 2500;
  v_entry_id := 'de02e06a-2720-4e0b-8dfb-af76f0bf51e9'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'mecanisme oli', '/products/eyo/9-18.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '9-18-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '9-18-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '9-18-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    100, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '9-18', 'excel_row', 198)
    );
  end if;

  -- RBT-80: robinnet arret pvc 20
  -- stock 3 CTN x 150 paquet x 1 pcs = 450 pieces
  v_product_id := '0c517f2b-1f9c-49db-bef4-c0d0fce36c7e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 150;
  v_pcs_per_ctn := 150;
  v_stock := 450;
  v_entry_id := '6e3c86fb-284b-46c3-815a-b784229a9617'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'robinnet arret pvc 20', '/products/eyo/RBT-80.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RBT-80-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RBT-80-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RBT-80-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RBT-80', 'excel_row', 199)
    );
  end if;

  -- RBT-81: robinnet arret pvc 25
  -- stock 3 CTN x 90 paquet x 1 pcs = 270 pieces
  v_product_id := '239374b5-1f18-4a67-a48e-9f623662efb4'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 90;
  v_pcs_per_ctn := 90;
  v_stock := 270;
  v_entry_id := '5a25d84d-5d98-4d8a-a7bd-84b604f0e634'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'robinnet arret pvc 25', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RBT-81-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RBT-81-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RBT-81-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RBT-81', 'excel_row', 200)
    );
  end if;

  -- RBT-82: robinnet arret pvc 32
  -- stock 10 CTN x 64 paquet x 1 pcs = 640 pieces
  v_product_id := '1a33e484-6267-45c5-811d-fdb713964cd5'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 64;
  v_pcs_per_ctn := 64;
  v_stock := 640;
  v_entry_id := '4a98e489-0252-435b-981d-0981efc0d97f'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'robinnet arret pvc 32', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RBT-82-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RBT-82-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RBT-82-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RBT-82', 'excel_row', 201)
    );
  end if;

  -- RBT-83: robinnet arret pvc 40
  -- stock 3 CTN x 36 paquet x 1 pcs = 108 pieces
  v_product_id := '69ca932e-23c9-40a1-97fb-9407a189878b'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 36;
  v_pcs_per_ctn := 36;
  v_stock := 108;
  v_entry_id := '61c1787f-84a5-40aa-a3ba-c5e5f83cf738'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'robinnet arret pvc 40', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RBT-83-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RBT-83-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RBT-83-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RBT-83', 'excel_row', 202)
    );
  end if;

  -- RBT-84: robinnet arret pvc 50
  -- stock 3 CTN x 30 paquet x 1 pcs = 90 pieces
  v_product_id := '1379855b-b629-4201-94a0-4b097ac9e652'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 30;
  v_pcs_per_ctn := 30;
  v_stock := 90;
  v_entry_id := '310a2896-f853-45a2-9296-fdbd05b3762c'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'robinnet arret pvc 50', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RBT-84-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RBT-84-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RBT-84-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RBT-84', 'excel_row', 203)
    );
  end if;

  -- RBT-15: 32 siphon flexible
  -- stock 5 CTN x 100 paquet x 1 pcs = 500 pieces
  v_product_id := 'a74172e9-7edd-465d-98e7-15d1e0c77f38'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 500;
  v_entry_id := '3b315e33-2b27-4f2d-a382-106ac341fe87'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    '32 siphon flexible', '/products/eyo/RBT-15.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RBT-15-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RBT-15-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RBT-15-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RBT-15', 'excel_row', 204)
    );
  end if;

  -- RBT-16: 40 siphon flexible
  -- stock 10 CTN x 100 paquet x 1 pcs = 1000 pieces
  v_product_id := '52ea7bd2-20e9-490b-8ce0-cf7055491d38'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 1000;
  v_entry_id := '8479d68d-3b2f-4614-ba0f-4fc5a5fb5204'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    '40 siphon flexible', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RBT-16-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RBT-16-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RBT-16-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RBT-16', 'excel_row', 205)
    );
  end if;

  -- 55-127: SIPHON DE solle A PIED SIZE: 10*10
  -- stock 10 CTN x 100 paquet x 1 pcs = 1000 pieces
  v_product_id := 'd1dc11fd-cad1-4c9b-a4e3-40d54c176610'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 1000;
  v_entry_id := '3fe52896-6cb7-4cbe-9130-a0dce49909bc'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'SIPHON DE solle A PIED SIZE: 10*10', '/products/eyo/55-127.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-127-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-127-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-127-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-127', 'excel_row', 206)
    );
  end if;

  -- 13-5: xardenna 70#
  -- stock 4 CTN x 72 paquet x 1 pcs = 288 pieces
  v_product_id := '173fb93a-c329-4749-b81a-c6c2479bc6b9'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 72;
  v_pcs_per_ctn := 72;
  v_stock := 288;
  v_entry_id := '85691cec-e100-441a-a1aa-e13176a14924'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'xardenna 70#', '/products/eyo/13-5.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '13-5-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '13-5-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '13-5-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    4, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '13-5', 'excel_row', 207)
    );
  end if;

  -- 13-6: cardenna 80#
  -- stock 5 CTN x 72 paquet x 1 pcs = 360 pieces
  v_product_id := '2af76fc2-d8f5-4f69-bb5d-c82ce0770b84'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 72;
  v_pcs_per_ctn := 72;
  v_stock := 360;
  v_entry_id := '74c518cc-8f71-44f5-80b8-9c41a5acdb56'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna 80#', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '13-6-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '13-6-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '13-6-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '13-6', 'excel_row', 208)
    );
  end if;

  -- 13-7: cardenna 90#
  -- stock 6 CTN x 48 paquet x 1 pcs = 288 pieces
  v_product_id := 'a8fcd932-af5c-419d-8a73-eb3f7d54248d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 288;
  v_entry_id := '80b2fafa-2020-428f-936a-9090e6abc4ec'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna 90#', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '13-7-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '13-7-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '13-7-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    6, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '13-7', 'excel_row', 209)
    );
  end if;

  -- 13-8: cardenna 100#
  -- stock 7 CTN x 48 paquet x 1 pcs = 336 pieces
  v_product_id := '8c4f42ca-992b-4c0b-afcd-9e93ff81bec8'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 336;
  v_entry_id := '2951986f-3756-4cd0-9597-e3a811a6839a'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna 100#', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '13-8-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '13-8-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '13-8-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    7, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '13-8', 'excel_row', 210)
    );
  end if;

  -- 70-1: cardenna 84MM
  -- stock 10 CTN x 24 paquet x 1 pcs = 240 pieces
  v_product_id := '7ac69f9e-f216-4b24-9ff3-513ce9a926a8'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 240;
  v_entry_id := '00dcaaf3-d561-4dd9-ade2-2437011ec93c'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna 84MM', '/products/eyo/70-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '70-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '70-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '70-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '70-1', 'excel_row', 211)
    );
  end if;

  -- 70-2: cardenna 94MM
  -- stock 10 CTN x 24 paquet x 1 pcs = 240 pieces
  v_product_id := '44e02a48-9514-4913-823c-0443c065a95b'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 24;
  v_pcs_per_ctn := 24;
  v_stock := 240;
  v_entry_id := '0cc8b4f5-6216-45fc-905d-cea51655822b'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna 94MM', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '70-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '70-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '70-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '70-2', 'excel_row', 212)
    );
  end if;

  -- 8-4: barrette de terre
  -- stock 10 CTN x 20 paquet x 5 pcs = 1000 pieces
  v_product_id := '2a4d2418-d716-4c2d-a689-dd7f43a4272c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'electrecite';
  v_pcs_per_pkg := 5;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 100;
  v_stock := 1000;
  v_entry_id := '7d597b7f-5e35-4542-8374-5380669633a4'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'electrecite';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'barrette de terre', '/products/eyo/8-4.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '8-4-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '8-4-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '8-4-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '8-4', 'excel_row', 213)
    );
  end if;

  -- 8-5: ecrou de piquet de terre
  -- stock 1 CTN x 300 paquet x 1 pcs = 300 pieces
  v_product_id := '9b7c4dca-f353-4934-8283-6509b51c416d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'electrecite';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 300;
  v_pcs_per_ctn := 300;
  v_stock := 300;
  v_entry_id := '55cc2775-c7c2-4004-8ced-e57cc4318631'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'electrecite';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'ecrou de piquet de terre', '/products/eyo/8-5.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '8-5-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '8-5-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '8-5-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    1, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '8-5', 'excel_row', 214)
    );
  end if;

  -- 20-1: pumelle rouge 80mm*2mm
  -- stock 50 CTN x 20 paquet x 24 pcs = 24000 pieces
  v_product_id := '9a4d3d25-a414-49ee-931b-c301db27323b'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 24;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 480;
  v_stock := 24000;
  v_entry_id := '5758a22c-da54-4d7e-a917-fc5cf6c8bbbe'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle rouge 80mm*2mm', '/products/eyo/20-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '20-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '20-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '20-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    50, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '20-1', 'excel_row', 215)
    );
  end if;

  -- 20-2: pumelle rouge 110mm*2.2mm
  -- stock 70 CTN x 10 paquet x 24 pcs = 16800 pieces
  v_product_id := 'edbc9e3b-7096-4ec9-86b0-463e3073e976'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 24;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 240;
  v_stock := 16800;
  v_entry_id := 'fcffd767-4212-4c5f-b014-5dac84ac33cc'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle rouge 110mm*2.2mm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '20-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '20-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '20-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    70, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '20-2', 'excel_row', 216)
    );
  end if;

  -- 20-3: pumelle rouge 140mm*2.2mm
  -- stock 150 CTN x 5 paquet x 24 pcs = 18000 pieces
  v_product_id := 'c57cc60c-2277-4940-ad76-89282f5edcfe'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 24;
  v_pkg_per_ctn := 5;
  v_pcs_per_ctn := 120;
  v_stock := 18000;
  v_entry_id := 'e4c27473-056c-4d8e-bb0b-60fb7dfa5194'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle rouge 140mm*2.2mm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '20-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '20-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '20-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    150, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '20-3', 'excel_row', 217)
    );
  end if;

  -- 20-4: pumelle d ore 80mm*2mm
  -- stock 30 CTN x 20 paquet x 24 pcs = 14400 pieces
  v_product_id := '997c9446-8292-4d3b-9c35-bbaafa2638bd'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 24;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 480;
  v_stock := 14400;
  v_entry_id := 'd5918d2f-483a-41cf-87b9-c3e0ca54ca6a'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle d ore 80mm*2mm', '/products/eyo/20-4.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '20-4-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '20-4-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '20-4-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    30, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '20-4', 'excel_row', 218)
    );
  end if;

  -- 20-5: pumelle d ore 110mm*2.2mm
  -- stock 30 CTN x 10 paquet x 24 pcs = 7200 pieces
  v_product_id := '2c33fb91-776a-4d3e-81c2-7e48861770cc'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 24;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 240;
  v_stock := 7200;
  v_entry_id := '91d4fcd2-8cd4-4933-8afe-f995a9af4925'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle d ore 110mm*2.2mm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '20-5-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '20-5-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '20-5-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    30, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '20-5', 'excel_row', 219)
    );
  end if;

  -- 20-6: pumelle d ore 140mm*2.2mm
  -- stock 70 CTN x 5 paquet x 24 pcs = 8400 pieces
  v_product_id := 'f28c6de5-1129-4801-9b2b-e9c365b6e505'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 24;
  v_pkg_per_ctn := 5;
  v_pcs_per_ctn := 120;
  v_stock := 8400;
  v_entry_id := 'dff99019-5f9b-4078-bd18-6ba80e5f150b'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle d ore 140mm*2.2mm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '20-6-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '20-6-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '20-6-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    70, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '20-6', 'excel_row', 220)
    );
  end if;

  -- FHM-41: scotch securite 5cm*100yard
  -- stock 10 CTN x 72 paquet x 1 pcs = 720 pieces
  v_product_id := 'ed2a9949-68fb-4b19-afcb-6b52d3dcf214'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 72;
  v_pcs_per_ctn := 72;
  v_stock := 720;
  v_entry_id := '5fe5623c-7e44-44ae-9e9f-1fb4d89c7961'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'scotch securite 5cm*100yard', '/products/eyo/FHM-41.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'FHM-41-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'FHM-41-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'FHM-41-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'FHM-41', 'excel_row', 221)
    );
  end if;

  -- FHM-42: scotch noir 1.7CM*10# MAX TRUST 10pcs/shrink
  -- stock 25 CTN x 50 paquet x 10 pcs = 12500 pieces
  v_product_id := 'd6b86610-1a32-4ece-8013-2d2f8e54f7af'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'electrecite';
  v_pcs_per_pkg := 10;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 500;
  v_stock := 12500;
  v_entry_id := '61e46f30-1034-421e-b431-e5b8fa2049ee'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'electrecite';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'scotch noir 1.7CM*10# MAX TRUST 10pcs/shrink', '/products/eyo/FHM-42.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'FHM-42-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'FHM-42-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'FHM-42-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'FHM-42', 'excel_row', 222)
    );
  end if;

  -- 61-1: tete de gaz rouge 9#
  -- stock 30 CTN x 200 paquet x 1 pcs = 6000 pieces
  v_product_id := 'a325521f-0544-4028-bd5f-ed9fbbb6ef46'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 200;
  v_pcs_per_ctn := 200;
  v_stock := 6000;
  v_entry_id := '19bc65d0-cf79-4f18-b03b-16a57046210e'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'tete de gaz rouge 9#', '/products/eyo/61-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '61-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '61-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '61-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    30, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '61-1', 'excel_row', 223)
    );
  end if;

  -- 61-2: 1.5M+FM-5 raccord+detendeur gaz
  -- stock 20 CTN x 50 paquet x 1 pcs = 1000 pieces
  v_product_id := '81e226f5-cf14-42d6-9e69-6f89c45bba35'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 50;
  v_pcs_per_ctn := 50;
  v_stock := 1000;
  v_entry_id := '3ed67378-1089-4a0f-860a-e3fadaa88e6b'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    '1.5M+FM-5 raccord+detendeur gaz', '/products/eyo/61-2.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '61-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '61-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '61-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '61-2', 'excel_row', 224)
    );
  end if;

  -- 52-1: T96 detendeur gaz
  -- stock 15 CTN x 100 paquet x 1 pcs = 1500 pieces
  v_product_id := 'c55a5aa3-aec7-4667-a54f-adfec9598831'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 1500;
  v_entry_id := 'd6a0678f-2372-447d-bfc3-624bdd81fab5'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'T96 detendeur gaz', '/products/eyo/52-1.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '52-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '52-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '52-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '52-1', 'excel_row', 225)
    );
  end if;

  -- 44-1: arrache clou 400*18mm
  -- stock 40 CTN x 36 paquet x 1 pcs = 1440 pieces
  v_product_id := 'b07680ee-dd7c-4647-8379-c2e4ee99dd9c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 36;
  v_pcs_per_ctn := 36;
  v_stock := 1440;
  v_entry_id := '6d86ae76-6e51-4964-81b3-dac8fa86eb40'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'arrache clou 400*18mm', '/products/eyo/44-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '44-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '44-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '44-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    40, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '44-1', 'excel_row', 226)
    );
  end if;

  -- 44-2: arrache clou 500*18mm
  -- stock 40 CTN x 30 paquet x 1 pcs = 1200 pieces
  v_product_id := 'dbcbde50-89f6-4d9b-836d-1761658eec99'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 30;
  v_pcs_per_ctn := 30;
  v_stock := 1200;
  v_entry_id := '427e584b-3c79-42b3-a783-eed493cf5b8e'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'arrache clou 500*18mm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '44-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '44-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '44-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    40, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '44-2', 'excel_row', 227)
    );
  end if;

  -- 44-3: arrache clou 600*18mm
  -- stock 40 CTN x 30 paquet x 1 pcs = 1200 pieces
  v_product_id := '771ed154-bfad-442d-bc77-89577f04914e'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 30;
  v_pcs_per_ctn := 30;
  v_stock := 1200;
  v_entry_id := '7d7d05fd-e11e-45d5-aceb-82f53222da94'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'arrache clou 600*18mm', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '44-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '44-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '44-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    40, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '44-3', 'excel_row', 228)
    );
  end if;

  -- 32-1: flexible lavabo 1/2 *1/2 50CM 10PCS/bag 20bags/ctn
  -- stock 30 CTN x 20 paquet x 10 pcs = 6000 pieces
  v_product_id := '8081e661-8907-4116-9b8f-b08b8307a45a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 10;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 200;
  v_stock := 6000;
  v_entry_id := 'd3bd56b6-e4c0-4f54-8487-455ff24b0652'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'flexible lavabo 1/2 *1/2 50CM 10PCS/bag 20bags/ctn', '/products/eyo/32-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '32-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '32-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '32-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    30, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '32-1', 'excel_row', 229)
    );
  end if;

  -- 32-2: flexible wc 3/8 *1/2 50CM
  -- stock 20 CTN x 20 paquet x 10 pcs = 4000 pieces
  v_product_id := '80d22d43-255a-45c7-8281-e90b920584e1'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 10;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 200;
  v_stock := 4000;
  v_entry_id := 'fd9a6976-406d-4e70-beb2-a339712738e2'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'flexible wc 3/8 *1/2 50CM', '/products/eyo/32-2.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '32-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '32-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '32-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '32-2', 'excel_row', 230)
    );
  end if;

  -- RD-3: flexible 1/2F*1/2M 50cm lavabo
  -- stock 7 CTN x 20 paquet x 10 pcs = 1400 pieces
  v_product_id := '47a56842-da41-4395-84fc-b044d85b7c9c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'plomberie';
  v_pcs_per_pkg := 10;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 200;
  v_stock := 1400;
  v_entry_id := 'f041a580-5ea5-432d-9158-0f6fb3a012be'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'plomberie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'flexible 1/2F*1/2M 50cm lavabo', '/products/eyo/RD-3.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'RD-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'RD-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'RD-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    7, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'RD-3', 'excel_row', 231)
    );
  end if;

  -- 46-1: rolo peinture oange pt 38CM 4(120)
  -- stock 100 CTN x 120 paquet x 1 pcs = 12000 pieces
  v_product_id := 'a503835c-1b88-4152-bf63-33d117870cbb'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 12000;
  v_entry_id := '3600fbc8-bd78-4920-ba4e-706df84abd97'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'rolo peinture oange pt 38CM 4(120)', '/products/eyo/46-1.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '46-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '46-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '46-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    100, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '46-1', 'excel_row', 232)
    );
  end if;

  -- 46-2: rolo peinture 4
  -- stock 10 CTN x 120 paquet x 1 pcs = 1200 pieces
  v_product_id := '426bf6af-ce74-4747-9535-fa0db5a08f4a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 120;
  v_pcs_per_ctn := 120;
  v_stock := 1200;
  v_entry_id := 'cdb483f8-6dca-4157-93b8-b7b8a825fc93'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'rolo peinture 4', '/products/eyo/46-2.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '46-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '46-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '46-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '46-2', 'excel_row', 233)
    );
  end if;

  -- 46-3: rolo peinture 7
  -- stock 15 CTN x 100 paquet x 1 pcs = 1500 pieces
  v_product_id := '54b13c1e-b837-404f-9bd8-ea579d266af1'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 1500;
  v_entry_id := '21cdbf2d-9d34-4697-8d50-cabf4f8cbf9a'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'rolo peinture 7', '/products/eyo/46-3.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '46-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '46-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '46-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '46-3', 'excel_row', 234)
    );
  end if;

  -- 46-4: rolo peinture 9（100）
  -- stock 20 CTN x 100 paquet x 1 pcs = 2000 pieces
  v_product_id := 'd78c6f22-6ea8-4068-86d8-19e232c5a077'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 2000;
  v_entry_id := '7aa0b578-ac8a-4dc7-8980-1dcb2c41d2c8'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'rolo peinture 9（100）', '/products/eyo/46-4.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '46-4-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '46-4-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '46-4-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '46-4', 'excel_row', 235)
    );
  end if;

  -- 46-6: rolo peinture vert 7
  -- stock 18 CTN x 100 paquet x 1 pcs = 1800 pieces
  v_product_id := 'e327fa13-87b7-410a-b4e6-59cc187a934d'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 1800;
  v_entry_id := 'b17ceaa6-38ea-43c1-9bf4-2a5a3acf2fb5'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'rolo peinture vert 7', '/products/eyo/46-6.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '46-6-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '46-6-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '46-6-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    18, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '46-6', 'excel_row', 236)
    );
  end if;

  -- 46-7: rolo peinture vert 9
  -- stock 5 CTN x 100 paquet x 1 pcs = 500 pieces
  v_product_id := 'f7cf2cba-c802-4ca5-92eb-1906cfd39ee1'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 100;
  v_pcs_per_ctn := 100;
  v_stock := 500;
  v_entry_id := 'aadaaaee-091c-4eb3-8947-2b8f9fe5bd2d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'rolo peinture vert 9', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '46-7-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '46-7-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '46-7-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '46-7', 'excel_row', 237)
    );
  end if;

  -- 55-117: cardenna 45B
  -- stock 40 CTN x 10 paquet x 12 pcs = 4800 pieces
  v_product_id := '4b8553f3-4890-4319-9601-147a6a787b99'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 120;
  v_stock := 4800;
  v_entry_id := 'f5f34d5a-eab8-4de9-94c8-4c441ebdda0c'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna 45B', '/products/eyo/55-117.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-117-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-117-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-117-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    40, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-117', 'excel_row', 238)
    );
  end if;

  -- 55-118: cadenna 55B
  -- stock 5 CTN x 10 paquet x 12 pcs = 600 pieces
  v_product_id := '07e79dae-0b04-43c0-9574-015525d30198'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 12;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 120;
  v_stock := 600;
  v_entry_id := '6101c7cc-2a45-481d-b2d0-f3cd35114c0c'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cadenna 55B', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-118-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-118-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-118-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-118', 'excel_row', 239)
    );
  end if;

  -- 55-119: cardenna 65B
  -- stock 20 CTN x 10 paquet x 6 pcs = 1200 pieces
  v_product_id := 'b3834dcf-50b8-4e03-938d-2a3961227160'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 6;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 60;
  v_stock := 1200;
  v_entry_id := '1fc3e704-f9dd-4651-a256-46979da861b9'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna 65B', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-119-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-119-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-119-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-119', 'excel_row', 240)
    );
  end if;

  -- 55-120: cardenna 75B
  -- stock 20 CTN x 10 paquet x 6 pcs = 1200 pieces
  v_product_id := '3ca18dc0-01f6-49b0-9df7-67168c70f7d7'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 6;
  v_pkg_per_ctn := 10;
  v_pcs_per_ctn := 60;
  v_stock := 1200;
  v_entry_id := 'c48f9317-1b77-4c0f-a483-864b6a4e344e'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna 75B', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-120-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-120-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-120-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    20, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-120', 'excel_row', 241)
    );
  end if;

  -- 55-121: cardenna OIZA 70H
  -- stock 3 CTN x 48 paquet x 1 pcs = 144 pieces
  v_product_id := 'c86b8d4d-7952-4e11-808c-0da3f79bc16b'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 48;
  v_pcs_per_ctn := 48;
  v_stock := 144;
  v_entry_id := '2576a542-4092-4c35-9ada-cfed76e45a94'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna OIZA 70H', '/products/eyo/55-121.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-121-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-121-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-121-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-121', 'excel_row', 242)
    );
  end if;

  -- 55-123: cardenna OIZA 70S
  -- stock 2 CTN x 72 paquet x 1 pcs = 144 pieces
  v_product_id := '823b3282-551b-43f7-b557-447967965f2c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 72;
  v_pcs_per_ctn := 72;
  v_stock := 144;
  v_entry_id := '25bd3098-cb29-4d20-8555-890dd744b871'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna OIZA 70S', '/products/eyo/55-123.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-123-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-123-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-123-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    2, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-123', 'excel_row', 243)
    );
  end if;

  -- 55-124: cardenna OIZA 60S
  -- stock 3 CTN x 72 paquet x 1 pcs = 216 pieces
  v_product_id := '1084c9e1-2d12-4338-8813-53c49ddd1d33'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 72;
  v_pcs_per_ctn := 72;
  v_stock := 216;
  v_entry_id := '156f45f8-541f-4fb4-98a1-8e1d2fdf8190'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna OIZA 60S', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-124-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-124-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-124-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-124', 'excel_row', 244)
    );
  end if;

  -- 55-125: cardenna OIZA 50S
  -- stock 3 CTN x 72 paquet x 1 pcs = 216 pieces
  v_product_id := '02480a11-4fcd-4dfb-87c3-5c1e9748a3b6'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 72;
  v_pcs_per_ctn := 72;
  v_stock := 216;
  v_entry_id := 'f40d4a3d-643c-4b6b-b2f7-536acaf2bc00'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna OIZA 50S', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-125-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-125-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-125-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    3, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-125', 'excel_row', 245)
    );
  end if;

  -- 55-126: cardenna OIZA 40S
  -- stock 2 CTN x 72 paquet x 1 pcs = 144 pieces
  v_product_id := 'ed7557f0-b41d-4232-b418-054df92b515f'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 72;
  v_pcs_per_ctn := 72;
  v_stock := 144;
  v_entry_id := 'a3e34ada-7497-4fe0-91b4-f27e006bdd2d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'cardenna OIZA 40S', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-126-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-126-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-126-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    2, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-126', 'excel_row', 246)
    );
  end if;

  -- 55-153-1: pumelle papillon SS 5*3*2.5
  -- stock 15 CTN x 60 paquet x 1 pcs = 900 pieces
  v_product_id := 'c0558853-3ea4-4f25-a507-5d9e0d448b22'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 900;
  v_entry_id := '0bc67cf9-9651-4660-9ba9-9ea9adf4e5d9'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle papillon SS 5*3*2.5', '/products/eyo/55-153-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-153-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-153-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-153-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-153-1', 'excel_row', 247)
    );
  end if;

  -- 55-153-2: pumelle papillon SS 4*3*2.5
  -- stock 25 CTN x 60 paquet x 1 pcs = 1500 pieces
  v_product_id := '100cbf5f-51a7-42b1-9e14-b30ccdda2bc4'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 1500;
  v_entry_id := '9dd5d2d5-cb1c-43aa-a983-5c9cf4249384'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle papillon SS 4*3*2.5', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-153-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-153-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-153-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-153-2', 'excel_row', 248)
    );
  end if;

  -- 55-154-1: pumelle SS 5*3*2.5
  -- stock 15 CTN x 60 paquet x 1 pcs = 900 pieces
  v_product_id := '4349baa6-bedd-4013-b97b-19f9fdf4cca2'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 900;
  v_entry_id := '05ebfa4a-8d55-4202-aab6-935e11990828'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle SS 5*3*2.5', '/products/eyo/55-154-1.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-154-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-154-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-154-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    15, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-154-1', 'excel_row', 249)
    );
  end if;

  -- 55-154-2: pumelle SS 4*3*2.5
  -- stock 25 CTN x 60 paquet x 1 pcs = 1500 pieces
  v_product_id := '2b36a983-0151-4f0c-a2ed-a1604f57c061'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'minuserie';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 60;
  v_pcs_per_ctn := 60;
  v_stock := 1500;
  v_entry_id := '7e122f47-2013-4bec-9cf3-5fd21d0c8eed'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'minuserie';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'pumelle SS 4*3*2.5', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '55-154-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '55-154-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '55-154-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    25, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '55-154-2', 'excel_row', 250)
    );
  end if;

  -- GJS-1: clef GJS MAB
  -- stock 5 CTN x 20 paquet x 1 pcs = 100 pieces
  v_product_id := '0f10ee1b-8ea3-43ef-a9d8-ebcf3370dec6'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 100;
  v_entry_id := '0b5f2aee-8869-4261-822e-853552965f62'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef GJS MAB', '/products/eyo/GJS-1.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-1-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-1-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-1-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-1', 'excel_row', 251)
    );
  end if;

  -- GJS-2: clef GJS SN/NP
  -- stock 10 CTN x 20 paquet x 1 pcs = 200 pieces
  v_product_id := '86bf36ba-d1e2-48ed-8471-bb46c635d678'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 200;
  v_entry_id := '0ae6c3dd-d1a2-4ef8-8d21-eec318ce4436'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'clef GJS SN/NP', '/products/eyo/GJS-2.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-2-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-2-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-2-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-2', 'excel_row', 252)
    );
  end if;

  -- GJS-3: CLEF GJS MAE
  -- stock 10 CTN x 20 paquet x 1 pcs = 200 pieces
  v_product_id := '43713ab8-a39e-4b2f-9146-5e8e93ef7301'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 200;
  v_entry_id := '6add71e0-f9b6-49f9-ac46-e2eba63a13a4'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'CLEF GJS MAE', '/products/eyo/GJS-3.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-3-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-3-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-3-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-3', 'excel_row', 253)
    );
  end if;

  -- GJS-4: CLEF GJS SN/NP
  -- stock 10 CTN x 20 paquet x 1 pcs = 200 pieces
  v_product_id := '5221e38c-d024-4a9d-859e-36f113021a9a'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 200;
  v_entry_id := 'ac90b1e2-dfc6-47ab-a4fc-c900d7790410'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'CLEF GJS SN/NP', '/products/eyo/GJS-4.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-4-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-4-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-4-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-4', 'excel_row', 254)
    );
  end if;

  -- GJS-5: DOOR HANDLE MAE
  -- stock 10 CTN x 20 paquet x 1 pcs = 200 pieces
  v_product_id := '7a4dbfef-754b-49a2-94b7-5e65ade785ac'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 200;
  v_entry_id := '30cf87ea-2605-419a-85cb-c9a4b5042521'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'DOOR HANDLE MAE', '/products/eyo/GJS-5.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-5-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-5-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-5-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-5', 'excel_row', 255)
    );
  end if;

  -- GJS-6: CLEF GJS MAE
  -- stock 5 CTN x 20 paquet x 1 pcs = 100 pieces
  v_product_id := '95c3ebb8-a50e-41c3-a5c8-cc8a72ea8b99'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 100;
  v_entry_id := '9cd7968d-d555-4406-ba31-0e4c366d3fa4'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'CLEF GJS MAE', '/products/eyo/GJS-6.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-6-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-6-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-6-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-6', 'excel_row', 256)
    );
  end if;

  -- GJS-7: CLEF GJS NB/BN
  -- stock 10 CTN x 20 paquet x 1 pcs = 200 pieces
  v_product_id := '535576e3-a625-4db2-9eaa-f5f7de4822d8'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 200;
  v_entry_id := '84b31f5b-20be-43d3-9479-5fe13037ce98'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'CLEF GJS NB/BN', '/products/eyo/GJS-7.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-7-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-7-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-7-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-7', 'excel_row', 257)
    );
  end if;

  -- GJS-8: DOOR HANDLE MAE
  -- stock 10 CTN x 20 paquet x 1 pcs = 200 pieces
  v_product_id := '6ebb5022-b1a4-4a14-a779-b41cce336538'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 200;
  v_entry_id := '347930e8-4f7a-43e7-956f-ae1558e4e0fe'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'DOOR HANDLE MAE', '/products/eyo/GJS-8.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-8-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-8-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-8-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    10, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-8', 'excel_row', 258)
    );
  end if;

  -- GJS-9: CLEF GJS MAB
  -- stock 5 CTN x 20 paquet x 1 pcs = 100 pieces
  v_product_id := 'de6b9d35-bce9-4536-8eaa-4242fcfd17d8'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 100;
  v_entry_id := '2b8539aa-0b52-4514-a9f5-10f776d30c94'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'CLEF GJS MAB', '/products/eyo/GJS-9.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-9-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-9-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-9-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-9', 'excel_row', 259)
    );
  end if;

  -- GJS-10: CLEF GJS AB
  -- stock 5 CTN x 20 paquet x 1 pcs = 100 pieces
  v_product_id := '7e3415c6-d8cc-4822-9264-ddb4ded4923b'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 100;
  v_entry_id := 'b7e4d6a0-dd94-4613-9219-2af60c4a30ff'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'CLEF GJS AB', '/products/eyo/GJS-10.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-10-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-10-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-10-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-10', 'excel_row', 260)
    );
  end if;

  -- GJS-11: CLEF GJS SN/NP
  -- stock 5 CTN x 20 paquet x 1 pcs = 100 pieces
  v_product_id := 'efe32603-6260-416c-ae92-80093cb816b0'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 100;
  v_entry_id := '9fe66da6-a981-47e1-886e-9e3ca22e1f80'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'CLEF GJS SN/NP', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-11-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-11-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-11-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-11', 'excel_row', 261)
    );
  end if;

  -- GJS-12: CLEF GJS SN/NP
  -- stock 5 CTN x 20 paquet x 1 pcs = 100 pieces
  v_product_id := '1457547e-95fa-4cd4-bc46-7104217b8dc3'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 100;
  v_entry_id := '10132ebb-98ed-4ba4-90f7-4c7ccba9cc75'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'CLEF GJS SN/NP', '/products/eyo/GJS-12.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-12-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-12-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-12-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-12', 'excel_row', 262)
    );
  end if;

  -- GJS-13: CLEF GJS MAE
  -- stock 5 CTN x 20 paquet x 1 pcs = 100 pieces
  v_product_id := '4e2a0bd9-a6a5-4eaa-8c17-5165ccde6f5c'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 100;
  v_entry_id := '245a1ac6-655e-42a6-b8ea-827687dffa4d'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'CLEF GJS MAE', '/products/eyo/GJS-13.jpeg',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-13-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-13-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-13-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-13', 'excel_row', 263)
    );
  end if;

  -- GJS-14: CLEF GJS NB/BN
  -- stock 5 CTN x 20 paquet x 1 pcs = 100 pieces
  v_product_id := 'e61219fa-7e06-495b-8b55-8a8add82fd40'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 20;
  v_pcs_per_ctn := 20;
  v_stock := 100;
  v_entry_id := '0e3c6824-58d2-4f7b-8e1d-67dd187f9782'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'CLEF GJS NB/BN', '/products/eyo/_missing.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'GJS-14-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'GJS-14-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'GJS-14-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    5, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'GJS-14', 'excel_row', 264)
    );
  end if;

  -- E6013: BAQUETTE A SOUDER
  -- stock 100 CTN x 8 paquet x 1 pcs = 800 pieces
  v_product_id := '4d05e77e-d5a0-4534-ad8b-e482cb1941ef'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'outils';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 8;
  v_pcs_per_ctn := 8;
  v_stock := 800;
  v_entry_id := 'ede80f13-77be-4703-a29e-4bc81bb2799b'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'outils';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'BAQUETTE A SOUDER', '/products/eyo/E6013.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   'E6013-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  'E6013-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  'E6013-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    100, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', 'E6013', 'excel_row', 265)
    );
  end if;

  -- 3120: VENUS CLEF 6 CLE ORG
  -- stock 6 CTN x 30 paquet x 1 pcs = 180 pieces
  v_product_id := '0f983684-3025-4af5-8d93-8976151713bf'::uuid;
  select category_id into v_cat_id from eyo_cat_map where excel_key = 'clef';
  v_pcs_per_pkg := 1;
  v_pkg_per_ctn := 30;
  v_pcs_per_ctn := 30;
  v_stock := 180;
  v_entry_id := 'b8bf3529-e464-4096-ad86-a831dc67b3eb'::uuid;

  if v_cat_id is null then
    raise exception 'EYO seed: category map miss for %', 'clef';
  end if;

  insert into public.products (
    id, depot_id, category_id, name, photo_url,
    current_stock_pieces, is_active
  ) values (
    v_product_id, v_depot_id, v_cat_id,
    'VENUS CLEF 6 CLE ORG', '/products/eyo/3120.png',
    v_stock, true
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    photo_url = excluded.photo_url,
    current_stock_pieces = excluded.current_stock_pieces,
    is_active = true,
    updated_at = now();

  insert into public.product_units (
    product_id, unit_level, unit_name, serial_number,
    relative_quantity, conversion_to_base,
    cost_price_cfa, selling_price_cfa
  ) values
    (v_product_id, 0, 'Piece',   '3120-PCE', null,          1,            0, 1),
    (v_product_id, 1, 'Paquet',  '3120-PKG', v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),
    (v_product_id, 2, 'Carton',  '3120-CTN', v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)
  on conflict (product_id, unit_level) do update set
    unit_name = excluded.unit_name,
    serial_number = excluded.serial_number,
    relative_quantity = excluded.relative_quantity,
    conversion_to_base = excluded.conversion_to_base,
    updated_at = now();

  insert into public.stock_entries (
    id, product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces, note, entered_by
  ) values (
    v_entry_id, v_product_id, v_depot_id, 2,
    6, v_stock, 'EYO dossier 1 opening stock', v_admin_id
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.inventory_transactions
    where reference_type = 'stock_entry' and reference_id = v_entry_id
  ) then
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces, transaction_type,
      reference_type, reference_id, created_by, metadata
    ) values (
      v_depot_id, v_product_id, v_stock, 'RESTOCK',
      'stock_entry', v_entry_id, v_admin_id,
      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', '3120', 'excel_row', 266)
    );
  end if;

  raise notice 'EYO seed complete: 262 products into depot %', v_depot_id;
end;
$$;

select
  'EYO SEED OK' as status,
  (select count(*) from public.products) as product_count,
  (select count(*) from public.categories where parent_id is null) as root_categories,
  (select count(*) from public.product_units
    where serial_number like '%-PCE') as piece_serials;