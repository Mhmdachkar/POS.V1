-- ================================================================
-- EYO fix: re-assert Piece / Paquet / Carton packing rules
-- L1 relative_quantity = pcs/pq (pieces per package)
-- L2 relative_quantity = paquet (packages per carton)
-- L2 conversion_to_base = paquet * pcs/pq
-- Stock current_stock_pieces = CTN * paquet * pcs/pq (unchanged)
-- ================================================================
begin;

-- JK-1: 30 CTN x 20 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '59e66c1c-b70b-46ab-8ac2-940405f333af'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '59e66c1c-b70b-46ab-8ac2-940405f333af'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '59e66c1c-b70b-46ab-8ac2-940405f333af'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 7200, updated_at = now() where id = '59e66c1c-b70b-46ab-8ac2-940405f333af'::uuid;

-- JK-2: 15 CTN x 20 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'bcdb99d2-66fb-48e9-a221-cf97fc649e8b'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'bcdb99d2-66fb-48e9-a221-cf97fc649e8b'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'bcdb99d2-66fb-48e9-a221-cf97fc649e8b'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 3600, updated_at = now() where id = 'bcdb99d2-66fb-48e9-a221-cf97fc649e8b'::uuid;

-- 57-3: 70 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '95aec582-a468-4091-a986-1db4a1e2a762'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '95aec582-a468-4091-a986-1db4a1e2a762'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '95aec582-a468-4091-a986-1db4a1e2a762'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1680, updated_at = now() where id = '95aec582-a468-4091-a986-1db4a1e2a762'::uuid;

-- 10-35: 600 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '974ff639-2b65-4502-9895-59d0f4afb044'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '974ff639-2b65-4502-9895-59d0f4afb044'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '974ff639-2b65-4502-9895-59d0f4afb044'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 14400, updated_at = now() where id = '974ff639-2b65-4502-9895-59d0f4afb044'::uuid;

-- RW-100: 15 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '710663c9-cc07-46c5-a05c-25949cd632c9'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '710663c9-cc07-46c5-a05c-25949cd632c9'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '710663c9-cc07-46c5-a05c-25949cd632c9'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 180, updated_at = now() where id = '710663c9-cc07-46c5-a05c-25949cd632c9'::uuid;

-- RW-101: 15 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c7c5f77a-96c5-4ff9-9940-2c64b73497aa'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c7c5f77a-96c5-4ff9-9940-2c64b73497aa'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c7c5f77a-96c5-4ff9-9940-2c64b73497aa'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 180, updated_at = now() where id = 'c7c5f77a-96c5-4ff9-9940-2c64b73497aa'::uuid;

-- RW-102: 10 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'a8f9d93b-d411-4681-b3ad-b39e3d6259c8'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'a8f9d93b-d411-4681-b3ad-b39e3d6259c8'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'a8f9d93b-d411-4681-b3ad-b39e3d6259c8'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 200, updated_at = now() where id = 'a8f9d93b-d411-4681-b3ad-b39e3d6259c8'::uuid;

-- 10-10: 25 CTN x 16 pkg x 40 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'abcac20d-f348-4a54-90ac-f1fea20d6ce4'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 40,
  conversion_to_base = 40,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'abcac20d-f348-4a54-90ac-f1fea20d6ce4'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 640,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'abcac20d-f348-4a54-90ac-f1fea20d6ce4'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 16000, updated_at = now() where id = 'abcac20d-f348-4a54-90ac-f1fea20d6ce4'::uuid;

-- 45-1 row 12: 25 CTN x 25 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'ad5f3af3-d8d9-40a7-b8cd-ec5de12b8c4c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'ad5f3af3-d8d9-40a7-b8cd-ec5de12b8c4c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 25,
  conversion_to_base = 25,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'ad5f3af3-d8d9-40a7-b8cd-ec5de12b8c4c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 625, updated_at = now() where id = 'ad5f3af3-d8d9-40a7-b8cd-ec5de12b8c4c'::uuid;

-- 55-129: 5 CTN x 100 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '4cf41dd5-be96-401c-b18d-e102593b38cd'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '4cf41dd5-be96-401c-b18d-e102593b38cd'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 1200,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '4cf41dd5-be96-401c-b18d-e102593b38cd'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 6000, updated_at = now() where id = '4cf41dd5-be96-401c-b18d-e102593b38cd'::uuid;

-- 55-130: 5 CTN x 100 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '336568d1-54cd-45bd-ad2e-963ba9f06996'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '336568d1-54cd-45bd-ad2e-963ba9f06996'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 1200,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '336568d1-54cd-45bd-ad2e-963ba9f06996'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 6000, updated_at = now() where id = '336568d1-54cd-45bd-ad2e-963ba9f06996'::uuid;

-- 55-131: 5 CTN x 100 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '9826be1d-dcab-4666-a452-e087e31f273e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '9826be1d-dcab-4666-a452-e087e31f273e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 1200,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '9826be1d-dcab-4666-a452-e087e31f273e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 6000, updated_at = now() where id = '9826be1d-dcab-4666-a452-e087e31f273e'::uuid;

-- 55-132: 300 CTN x 25 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '9da54f1a-ea1f-4f4a-8508-5e210a48c9c2'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '9da54f1a-ea1f-4f4a-8508-5e210a48c9c2'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 25,
  conversion_to_base = 25,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '9da54f1a-ea1f-4f4a-8508-5e210a48c9c2'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 7500, updated_at = now() where id = '9da54f1a-ea1f-4f4a-8508-5e210a48c9c2'::uuid;

-- 10-28: 20 CTN x 25 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'dcf984f1-c2f7-4a13-9b6b-25337b684dd9'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'dcf984f1-c2f7-4a13-9b6b-25337b684dd9'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 25,
  conversion_to_base = 25,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'dcf984f1-c2f7-4a13-9b6b-25337b684dd9'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = 'dcf984f1-c2f7-4a13-9b6b-25337b684dd9'::uuid;

-- 10-29: 60 CTN x 25 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '458b6e81-c7d1-48a0-b47c-514e1465cc14'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '458b6e81-c7d1-48a0-b47c-514e1465cc14'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 25,
  conversion_to_base = 25,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '458b6e81-c7d1-48a0-b47c-514e1465cc14'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1500, updated_at = now() where id = '458b6e81-c7d1-48a0-b47c-514e1465cc14'::uuid;

-- 10-30: 50 CTN x 25 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'b7302f2e-1a5b-4c5c-99f2-b9c047a886e5'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'b7302f2e-1a5b-4c5c-99f2-b9c047a886e5'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 25,
  conversion_to_base = 25,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'b7302f2e-1a5b-4c5c-99f2-b9c047a886e5'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1250, updated_at = now() where id = 'b7302f2e-1a5b-4c5c-99f2-b9c047a886e5'::uuid;

-- 10-31: 40 CTN x 25 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '4c40f2cc-47c3-4702-88b8-40682fdbc034'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '4c40f2cc-47c3-4702-88b8-40682fdbc034'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 25,
  conversion_to_base = 25,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '4c40f2cc-47c3-4702-88b8-40682fdbc034'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = '4c40f2cc-47c3-4702-88b8-40682fdbc034'::uuid;

-- 10-33: 40 CTN x 25 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'fbd02cb4-a8f1-47a5-89b9-254e7696146f'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'fbd02cb4-a8f1-47a5-89b9-254e7696146f'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 25,
  conversion_to_base = 25,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'fbd02cb4-a8f1-47a5-89b9-254e7696146f'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = 'fbd02cb4-a8f1-47a5-89b9-254e7696146f'::uuid;

-- 10-34: 50 CTN x 25 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '23a8284c-e6b6-4468-a9ee-08efd87fea2e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '23a8284c-e6b6-4468-a9ee-08efd87fea2e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 25,
  conversion_to_base = 25,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '23a8284c-e6b6-4468-a9ee-08efd87fea2e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1250, updated_at = now() where id = '23a8284c-e6b6-4468-a9ee-08efd87fea2e'::uuid;

-- 48-1: 10 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '0693f7b7-a7cb-44a4-9c5a-b3bc009e4124'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '0693f7b7-a7cb-44a4-9c5a-b3bc009e4124'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '0693f7b7-a7cb-44a4-9c5a-b3bc009e4124'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = '0693f7b7-a7cb-44a4-9c5a-b3bc009e4124'::uuid;

-- 48-2: 10 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c1fa0bcc-fda1-44ac-b7e4-7baa19239e88'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c1fa0bcc-fda1-44ac-b7e4-7baa19239e88'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c1fa0bcc-fda1-44ac-b7e4-7baa19239e88'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = 'c1fa0bcc-fda1-44ac-b7e4-7baa19239e88'::uuid;

-- 48-3: 35 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2827c16f-e0fa-4e28-85ea-97000e028ef9'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2827c16f-e0fa-4e28-85ea-97000e028ef9'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2827c16f-e0fa-4e28-85ea-97000e028ef9'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 3500, updated_at = now() where id = '2827c16f-e0fa-4e28-85ea-97000e028ef9'::uuid;

-- 48-4: 60 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd66cfe4d-78dd-4de5-8783-d309c005cc21'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd66cfe4d-78dd-4de5-8783-d309c005cc21'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd66cfe4d-78dd-4de5-8783-d309c005cc21'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 6000, updated_at = now() where id = 'd66cfe4d-78dd-4de5-8783-d309c005cc21'::uuid;

-- 48-12: 10 CTN x 50 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'cfaae1c4-81b6-4533-bafe-983e7209d42a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'cfaae1c4-81b6-4533-bafe-983e7209d42a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 600,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'cfaae1c4-81b6-4533-bafe-983e7209d42a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 6000, updated_at = now() where id = 'cfaae1c4-81b6-4533-bafe-983e7209d42a'::uuid;

-- 48-13: 5 CTN x 50 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'cbbadd22-d5d6-42ef-b869-df69bbb5b7ac'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'cbbadd22-d5d6-42ef-b869-df69bbb5b7ac'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 600,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'cbbadd22-d5d6-42ef-b869-df69bbb5b7ac'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 3000, updated_at = now() where id = 'cbbadd22-d5d6-42ef-b869-df69bbb5b7ac'::uuid;

-- 24-1: 25 CTN x 14 pkg x 4 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '0745caf1-feb9-4df8-aaf8-d1d90937c1e4'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 4,
  conversion_to_base = 4,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '0745caf1-feb9-4df8-aaf8-d1d90937c1e4'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 14,
  conversion_to_base = 56,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '0745caf1-feb9-4df8-aaf8-d1d90937c1e4'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1400, updated_at = now() where id = '0745caf1-feb9-4df8-aaf8-d1d90937c1e4'::uuid;

-- 24-2: 45 CTN x 14 pkg x 4 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'b5e7abf8-0f00-4eda-8d53-264dd3793108'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 4,
  conversion_to_base = 4,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'b5e7abf8-0f00-4eda-8d53-264dd3793108'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 14,
  conversion_to_base = 56,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'b5e7abf8-0f00-4eda-8d53-264dd3793108'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 2520, updated_at = now() where id = 'b5e7abf8-0f00-4eda-8d53-264dd3793108'::uuid;

-- 24-3: 15 CTN x 14 pkg x 4 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '1468cbae-12a2-4242-88a7-06b8c73535e5'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 4,
  conversion_to_base = 4,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '1468cbae-12a2-4242-88a7-06b8c73535e5'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 14,
  conversion_to_base = 56,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '1468cbae-12a2-4242-88a7-06b8c73535e5'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 840, updated_at = now() where id = '1468cbae-12a2-4242-88a7-06b8c73535e5'::uuid;

-- 10-1: 20 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'bf38cb6f-90e4-4eff-9e11-9707c488ff44'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'bf38cb6f-90e4-4eff-9e11-9707c488ff44'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'bf38cb6f-90e4-4eff-9e11-9707c488ff44'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = 'bf38cb6f-90e4-4eff-9e11-9707c488ff44'::uuid;

-- 10-7: 7 CTN x 20 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '0a7c381e-00cb-42c5-8731-91b57cf00328'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '0a7c381e-00cb-42c5-8731-91b57cf00328'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '0a7c381e-00cb-42c5-8731-91b57cf00328'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1680, updated_at = now() where id = '0a7c381e-00cb-42c5-8731-91b57cf00328'::uuid;

-- 10-8: 3 CTN x 20 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '65fd41c3-02c6-4bf0-a7e1-a2b6f5f99ccc'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '65fd41c3-02c6-4bf0-a7e1-a2b6f5f99ccc'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '65fd41c3-02c6-4bf0-a7e1-a2b6f5f99ccc'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 720, updated_at = now() where id = '65fd41c3-02c6-4bf0-a7e1-a2b6f5f99ccc'::uuid;

-- 10-18: 50 CTN x 10 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '1ef03132-39ea-47a9-9266-788c23a1c672'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '1ef03132-39ea-47a9-9266-788c23a1c672'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 10,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '1ef03132-39ea-47a9-9266-788c23a1c672'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = '1ef03132-39ea-47a9-9266-788c23a1c672'::uuid;

-- 10-19: 150 CTN x 10 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '342a256b-399d-4fe2-9e0c-b9d39e56c828'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '342a256b-399d-4fe2-9e0c-b9d39e56c828'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 10,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '342a256b-399d-4fe2-9e0c-b9d39e56c828'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1500, updated_at = now() where id = '342a256b-399d-4fe2-9e0c-b9d39e56c828'::uuid;

-- 10-20: 50 CTN x 10 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e21e1c34-233a-45df-bb37-806e28cca3ea'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e21e1c34-233a-45df-bb37-806e28cca3ea'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 10,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e21e1c34-233a-45df-bb37-806e28cca3ea'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = 'e21e1c34-233a-45df-bb37-806e28cca3ea'::uuid;

-- 55-80: 20 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'ab7bf2fc-9c79-429e-859f-c14932a5869b'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'ab7bf2fc-9c79-429e-859f-c14932a5869b'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'ab7bf2fc-9c79-429e-859f-c14932a5869b'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = 'ab7bf2fc-9c79-429e-859f-c14932a5869b'::uuid;

-- 55-81: 20 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd32d788e-7520-4212-b91a-30e893450ec9'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd32d788e-7520-4212-b91a-30e893450ec9'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd32d788e-7520-4212-b91a-30e893450ec9'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = 'd32d788e-7520-4212-b91a-30e893450ec9'::uuid;

-- 55-82: 20 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c519aea4-9f5f-4b83-bdcd-1c566acfff75'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c519aea4-9f5f-4b83-bdcd-1c566acfff75'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c519aea4-9f5f-4b83-bdcd-1c566acfff75'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = 'c519aea4-9f5f-4b83-bdcd-1c566acfff75'::uuid;

-- 55-83: 20 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'b745d99b-d10b-4ac1-9d3c-8eee673e310c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'b745d99b-d10b-4ac1-9d3c-8eee673e310c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'b745d99b-d10b-4ac1-9d3c-8eee673e310c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = 'b745d99b-d10b-4ac1-9d3c-8eee673e310c'::uuid;

-- 55-84: 20 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '8fbb7612-e8df-4025-9409-052d9d6d078f'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '8fbb7612-e8df-4025-9409-052d9d6d078f'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '8fbb7612-e8df-4025-9409-052d9d6d078f'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = '8fbb7612-e8df-4025-9409-052d9d6d078f'::uuid;

-- 55-85: 20 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '12bc38ef-33b3-4e33-bb54-f9dcc7497060'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '12bc38ef-33b3-4e33-bb54-f9dcc7497060'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '12bc38ef-33b3-4e33-bb54-f9dcc7497060'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = '12bc38ef-33b3-4e33-bb54-f9dcc7497060'::uuid;

-- 55-86: 20 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '58e2978c-6bd3-48bc-8cd3-dba603216659'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '58e2978c-6bd3-48bc-8cd3-dba603216659'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '58e2978c-6bd3-48bc-8cd3-dba603216659'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = '58e2978c-6bd3-48bc-8cd3-dba603216659'::uuid;

-- 55-87: 20 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'eba2cda3-7dde-4a65-9f67-ddf50bedb5dc'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'eba2cda3-7dde-4a65-9f67-ddf50bedb5dc'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'eba2cda3-7dde-4a65-9f67-ddf50bedb5dc'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = 'eba2cda3-7dde-4a65-9f67-ddf50bedb5dc'::uuid;

-- 55-88: 20 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '278c2473-3422-4a1e-b993-58d56a9b1247'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '278c2473-3422-4a1e-b993-58d56a9b1247'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '278c2473-3422-4a1e-b993-58d56a9b1247'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = '278c2473-3422-4a1e-b993-58d56a9b1247'::uuid;

-- 55-89: 20 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '3f43ff1e-48b6-429d-891b-4655d591ca97'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '3f43ff1e-48b6-429d-891b-4655d591ca97'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '3f43ff1e-48b6-429d-891b-4655d591ca97'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = '3f43ff1e-48b6-429d-891b-4655d591ca97'::uuid;

-- 55-90: 25 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'f754f965-fce6-4058-a833-34eb29302e34'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'f754f965-fce6-4058-a833-34eb29302e34'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'f754f965-fce6-4058-a833-34eb29302e34'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 400, updated_at = now() where id = 'f754f965-fce6-4058-a833-34eb29302e34'::uuid;

-- 55-91: 25 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'de0dd123-4aad-4b02-97c3-c4c196c0e7a0'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'de0dd123-4aad-4b02-97c3-c4c196c0e7a0'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'de0dd123-4aad-4b02-97c3-c4c196c0e7a0'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 400, updated_at = now() where id = 'de0dd123-4aad-4b02-97c3-c4c196c0e7a0'::uuid;

-- 55-92: 25 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c68c7430-a220-48e0-90fb-f1a19bfb67fd'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c68c7430-a220-48e0-90fb-f1a19bfb67fd'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c68c7430-a220-48e0-90fb-f1a19bfb67fd'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 400, updated_at = now() where id = 'c68c7430-a220-48e0-90fb-f1a19bfb67fd'::uuid;

-- 55-93: 25 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'a9b4d805-0cbb-4a4f-a156-f10b72ed964d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'a9b4d805-0cbb-4a4f-a156-f10b72ed964d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'a9b4d805-0cbb-4a4f-a156-f10b72ed964d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 400, updated_at = now() where id = 'a9b4d805-0cbb-4a4f-a156-f10b72ed964d'::uuid;

-- 55-94: 25 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '6df90407-55be-4b08-96e5-e12c56835d7d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '6df90407-55be-4b08-96e5-e12c56835d7d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '6df90407-55be-4b08-96e5-e12c56835d7d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 400, updated_at = now() where id = '6df90407-55be-4b08-96e5-e12c56835d7d'::uuid;

-- 55-95: 25 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '5a522d84-2d48-4f66-b8fc-dba0dd6bb4d9'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '5a522d84-2d48-4f66-b8fc-dba0dd6bb4d9'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '5a522d84-2d48-4f66-b8fc-dba0dd6bb4d9'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 400, updated_at = now() where id = '5a522d84-2d48-4f66-b8fc-dba0dd6bb4d9'::uuid;

-- 55-96: 25 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '30ff4221-a048-4d2d-bae8-5337e917b14f'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '30ff4221-a048-4d2d-bae8-5337e917b14f'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '30ff4221-a048-4d2d-bae8-5337e917b14f'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 400, updated_at = now() where id = '30ff4221-a048-4d2d-bae8-5337e917b14f'::uuid;

-- 55-97: 25 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'aca614ef-7373-4405-ac23-a33a15c664a6'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'aca614ef-7373-4405-ac23-a33a15c664a6'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'aca614ef-7373-4405-ac23-a33a15c664a6'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 400, updated_at = now() where id = 'aca614ef-7373-4405-ac23-a33a15c664a6'::uuid;

-- 55-98: 25 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '778f46d7-de88-4869-aca6-4c58c25f9f48'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '778f46d7-de88-4869-aca6-4c58c25f9f48'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '778f46d7-de88-4869-aca6-4c58c25f9f48'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 400, updated_at = now() where id = '778f46d7-de88-4869-aca6-4c58c25f9f48'::uuid;

-- 55-99: 25 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '44b8b45e-7882-47c5-9107-198f4512439c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '44b8b45e-7882-47c5-9107-198f4512439c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '44b8b45e-7882-47c5-9107-198f4512439c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 400, updated_at = now() where id = '44b8b45e-7882-47c5-9107-198f4512439c'::uuid;

-- 55-100: 15 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '139a259d-5348-4f9c-a9b0-fdf448100ab5'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '139a259d-5348-4f9c-a9b0-fdf448100ab5'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '139a259d-5348-4f9c-a9b0-fdf448100ab5'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = '139a259d-5348-4f9c-a9b0-fdf448100ab5'::uuid;

-- 55-101: 15 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '6aa5f609-4156-4538-99d0-88881b3c643d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '6aa5f609-4156-4538-99d0-88881b3c643d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '6aa5f609-4156-4538-99d0-88881b3c643d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = '6aa5f609-4156-4538-99d0-88881b3c643d'::uuid;

-- 55-102: 15 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e46705d0-277a-4e12-aad7-afa6a8a01eca'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e46705d0-277a-4e12-aad7-afa6a8a01eca'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e46705d0-277a-4e12-aad7-afa6a8a01eca'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = 'e46705d0-277a-4e12-aad7-afa6a8a01eca'::uuid;

-- 55-103: 10 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '77535028-a471-4084-8b15-7e7ac59c19d6'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '77535028-a471-4084-8b15-7e7ac59c19d6'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '77535028-a471-4084-8b15-7e7ac59c19d6'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '77535028-a471-4084-8b15-7e7ac59c19d6'::uuid;

-- 55-104: 10 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '67a8394f-3f2c-42b4-9bc5-07058b0517ba'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '67a8394f-3f2c-42b4-9bc5-07058b0517ba'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '67a8394f-3f2c-42b4-9bc5-07058b0517ba'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '67a8394f-3f2c-42b4-9bc5-07058b0517ba'::uuid;

-- 55-105: 10 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '7cee1af5-684c-4369-bb59-23eb9747fe89'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '7cee1af5-684c-4369-bb59-23eb9747fe89'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '7cee1af5-684c-4369-bb59-23eb9747fe89'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '7cee1af5-684c-4369-bb59-23eb9747fe89'::uuid;

-- 55-106: 10 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'aba8b5b4-fa3c-4460-84d6-342fc8577018'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'aba8b5b4-fa3c-4460-84d6-342fc8577018'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'aba8b5b4-fa3c-4460-84d6-342fc8577018'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = 'aba8b5b4-fa3c-4460-84d6-342fc8577018'::uuid;

-- 55-107: 15 CTN x 10 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '38ea642f-8bc4-4f80-b262-6967d231c650'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '38ea642f-8bc4-4f80-b262-6967d231c650'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '38ea642f-8bc4-4f80-b262-6967d231c650'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1800, updated_at = now() where id = '38ea642f-8bc4-4f80-b262-6967d231c650'::uuid;

-- 55-108: 15 CTN x 10 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '015e9ebd-d723-4264-8751-5c18edc853ea'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '015e9ebd-d723-4264-8751-5c18edc853ea'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '015e9ebd-d723-4264-8751-5c18edc853ea'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1800, updated_at = now() where id = '015e9ebd-d723-4264-8751-5c18edc853ea'::uuid;

-- 55-109: 100 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'aedaacdf-baef-4a8f-8431-b1bfe2d39de1'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'aedaacdf-baef-4a8f-8431-b1bfe2d39de1'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'aedaacdf-baef-4a8f-8431-b1bfe2d39de1'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = 'aedaacdf-baef-4a8f-8431-b1bfe2d39de1'::uuid;

-- 55-110: 100 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '54d02ade-8ee2-43cb-a1e2-33b25d550a4d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '54d02ade-8ee2-43cb-a1e2-33b25d550a4d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '54d02ade-8ee2-43cb-a1e2-33b25d550a4d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = '54d02ade-8ee2-43cb-a1e2-33b25d550a4d'::uuid;

-- 55-111: 30 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '1705728b-a402-4e2c-971e-107335bc67bc'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '1705728b-a402-4e2c-971e-107335bc67bc'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '1705728b-a402-4e2c-971e-107335bc67bc'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = '1705728b-a402-4e2c-971e-107335bc67bc'::uuid;

-- 55-112: 30 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '25717f98-43ee-4b9d-be20-44881557e5bd'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '25717f98-43ee-4b9d-be20-44881557e5bd'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '25717f98-43ee-4b9d-be20-44881557e5bd'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = '25717f98-43ee-4b9d-be20-44881557e5bd'::uuid;

-- 55-113: 20 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd19de525-b93a-46e9-a96f-939643b1dec7'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd19de525-b93a-46e9-a96f-939643b1dec7'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd19de525-b93a-46e9-a96f-939643b1dec7'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = 'd19de525-b93a-46e9-a96f-939643b1dec7'::uuid;

-- 55-114: 15 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '40d837d4-c5ec-43fe-b379-55ef960f2ea2'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '40d837d4-c5ec-43fe-b379-55ef960f2ea2'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '40d837d4-c5ec-43fe-b379-55ef960f2ea2'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 180, updated_at = now() where id = '40d837d4-c5ec-43fe-b379-55ef960f2ea2'::uuid;

-- 55-115: 20 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '76ff8627-9f27-4a72-ad50-5f57004b38d3'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '76ff8627-9f27-4a72-ad50-5f57004b38d3'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '76ff8627-9f27-4a72-ad50-5f57004b38d3'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '76ff8627-9f27-4a72-ad50-5f57004b38d3'::uuid;

-- 55-116: 20 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'fe568f7a-1d84-4602-b269-c7fe0d6cbb34'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'fe568f7a-1d84-4602-b269-c7fe0d6cbb34'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'fe568f7a-1d84-4602-b269-c7fe0d6cbb34'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = 'fe568f7a-1d84-4602-b269-c7fe0d6cbb34'::uuid;

-- FHM-40: 300 CTN x 12 pkg x 6 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'f4c80003-df1f-43cb-9ce6-dda8d82028ee'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 6,
  conversion_to_base = 6,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'f4c80003-df1f-43cb-9ce6-dda8d82028ee'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'f4c80003-df1f-43cb-9ce6-dda8d82028ee'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 21600, updated_at = now() where id = 'f4c80003-df1f-43cb-9ce6-dda8d82028ee'::uuid;

-- FHM-19: 132 CTN x 12 pkg x 16 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '8755180d-af7b-4cc5-a73f-5067d476c01a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '8755180d-af7b-4cc5-a73f-5067d476c01a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 192,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '8755180d-af7b-4cc5-a73f-5067d476c01a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 25344, updated_at = now() where id = '8755180d-af7b-4cc5-a73f-5067d476c01a'::uuid;

-- 5-2: 5 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '0e055dbc-214e-41fa-b5b0-3a3744b2ca6f'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '0e055dbc-214e-41fa-b5b0-3a3744b2ca6f'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '0e055dbc-214e-41fa-b5b0-3a3744b2ca6f'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 300, updated_at = now() where id = '0e055dbc-214e-41fa-b5b0-3a3744b2ca6f'::uuid;

-- 5-3: 5 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'ac02bcc0-59a9-4aa7-85ef-f8c9745e4ce4'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'ac02bcc0-59a9-4aa7-85ef-f8c9745e4ce4'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'ac02bcc0-59a9-4aa7-85ef-f8c9745e4ce4'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 300, updated_at = now() where id = 'ac02bcc0-59a9-4aa7-85ef-f8c9745e4ce4'::uuid;

-- 5-4 row 79: 3 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e4b7b3d7-05ec-4a22-bd1b-95e38c616912'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e4b7b3d7-05ec-4a22-bd1b-95e38c616912'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e4b7b3d7-05ec-4a22-bd1b-95e38c616912'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 180, updated_at = now() where id = 'e4b7b3d7-05ec-4a22-bd1b-95e38c616912'::uuid;

-- 5-5: 3 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '66ae8dbb-cc3a-49ab-9392-a520e12e8c47'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '66ae8dbb-cc3a-49ab-9392-a520e12e8c47'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '66ae8dbb-cc3a-49ab-9392-a520e12e8c47'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 180, updated_at = now() where id = '66ae8dbb-cc3a-49ab-9392-a520e12e8c47'::uuid;

-- 5-6: 3 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '125343f4-03d3-4db3-9796-92e713c9b0de'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '125343f4-03d3-4db3-9796-92e713c9b0de'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '125343f4-03d3-4db3-9796-92e713c9b0de'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 180, updated_at = now() where id = '125343f4-03d3-4db3-9796-92e713c9b0de'::uuid;

-- 5-7 row 82: 10 CTN x 10 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd27cf1ce-1f67-4104-a798-abf1f5c64791'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd27cf1ce-1f67-4104-a798-abf1f5c64791'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd27cf1ce-1f67-4104-a798-abf1f5c64791'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = 'd27cf1ce-1f67-4104-a798-abf1f5c64791'::uuid;

-- 53-1 row 83: 20 CTN x 50 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '210a253d-cf9a-4066-bc25-3d987b9391dd'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '210a253d-cf9a-4066-bc25-3d987b9391dd'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 50,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '210a253d-cf9a-4066-bc25-3d987b9391dd'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = '210a253d-cf9a-4066-bc25-3d987b9391dd'::uuid;

-- 53-2: 50 CTN x 50 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '9ce17365-b15b-44a4-be02-65fa63bcd8ed'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '9ce17365-b15b-44a4-be02-65fa63bcd8ed'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 50,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '9ce17365-b15b-44a4-be02-65fa63bcd8ed'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 2500, updated_at = now() where id = '9ce17365-b15b-44a4-be02-65fa63bcd8ed'::uuid;

-- 53-3: 10 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '448c563e-5cbe-4b1a-92df-4934c979675c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '448c563e-5cbe-4b1a-92df-4934c979675c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '448c563e-5cbe-4b1a-92df-4934c979675c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '448c563e-5cbe-4b1a-92df-4934c979675c'::uuid;

-- 53-4: 20 CTN x 50 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2bd52136-c6e0-4013-8953-44fb5c13853a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2bd52136-c6e0-4013-8953-44fb5c13853a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 50,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2bd52136-c6e0-4013-8953-44fb5c13853a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = '2bd52136-c6e0-4013-8953-44fb5c13853a'::uuid;

-- 53-6: 5 CTN x 50 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'f1df2fda-49ef-4795-85f7-326c71c0b22b'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'f1df2fda-49ef-4795-85f7-326c71c0b22b'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 50,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'f1df2fda-49ef-4795-85f7-326c71c0b22b'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 250, updated_at = now() where id = 'f1df2fda-49ef-4795-85f7-326c71c0b22b'::uuid;

-- 53-7: 5 CTN x 50 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c19f1b4d-e368-411f-9f79-8fe7fb5f19c8'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c19f1b4d-e368-411f-9f79-8fe7fb5f19c8'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 50,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c19f1b4d-e368-411f-9f79-8fe7fb5f19c8'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 250, updated_at = now() where id = 'c19f1b4d-e368-411f-9f79-8fe7fb5f19c8'::uuid;

-- 53-6-1: 112 CTN x 50 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'ee594f23-6e90-48ba-af79-4b7fe82e1417'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'ee594f23-6e90-48ba-af79-4b7fe82e1417'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 50,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'ee594f23-6e90-48ba-af79-4b7fe82e1417'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 5600, updated_at = now() where id = 'ee594f23-6e90-48ba-af79-4b7fe82e1417'::uuid;

-- 53-1 row 90: 10 CTN x 50 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'ea9ce7ba-f0a0-4af9-98a5-9f5f5af2e52f'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'ea9ce7ba-f0a0-4af9-98a5-9f5f5af2e52f'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 50,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'ea9ce7ba-f0a0-4af9-98a5-9f5f5af2e52f'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = 'ea9ce7ba-f0a0-4af9-98a5-9f5f5af2e52f'::uuid;

-- 30-1: 5 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c78069eb-cb79-430d-a167-96c5f3d12535'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c78069eb-cb79-430d-a167-96c5f3d12535'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c78069eb-cb79-430d-a167-96c5f3d12535'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = 'c78069eb-cb79-430d-a167-96c5f3d12535'::uuid;

-- 30-2: 5 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2f809ac2-518c-459e-a49f-b2b9c54b1ae0'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2f809ac2-518c-459e-a49f-b2b9c54b1ae0'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2f809ac2-518c-459e-a49f-b2b9c54b1ae0'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '2f809ac2-518c-459e-a49f-b2b9c54b1ae0'::uuid;

-- G-3: 5 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '82a0190e-e736-450f-865e-7cb7e72c8deb'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '82a0190e-e736-450f-865e-7cb7e72c8deb'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '82a0190e-e736-450f-865e-7cb7e72c8deb'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '82a0190e-e736-450f-865e-7cb7e72c8deb'::uuid;

-- 30-4: 5 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '92f4f908-dc2f-4b21-8b84-e3933bbc0593'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '92f4f908-dc2f-4b21-8b84-e3933bbc0593'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '92f4f908-dc2f-4b21-8b84-e3933bbc0593'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '92f4f908-dc2f-4b21-8b84-e3933bbc0593'::uuid;

-- 30-6: 5 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '76c252f8-d497-402f-b895-85638f299da5'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '76c252f8-d497-402f-b895-85638f299da5'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '76c252f8-d497-402f-b895-85638f299da5'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '76c252f8-d497-402f-b895-85638f299da5'::uuid;

-- 30-7: 5 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '25b0cf9e-7eb5-40b7-ba78-dccf66f23699'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '25b0cf9e-7eb5-40b7-ba78-dccf66f23699'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '25b0cf9e-7eb5-40b7-ba78-dccf66f23699'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '25b0cf9e-7eb5-40b7-ba78-dccf66f23699'::uuid;

-- 30-8: 5 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e16e02a1-4ab9-4e54-b453-e9211b6c0c22'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e16e02a1-4ab9-4e54-b453-e9211b6c0c22'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e16e02a1-4ab9-4e54-b453-e9211b6c0c22'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = 'e16e02a1-4ab9-4e54-b453-e9211b6c0c22'::uuid;

-- 37-2: 20 CTN x 50 pkg x 10 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '42f5bb28-c564-453a-8219-9f7cbbd9b377'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 10,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '42f5bb28-c564-453a-8219-9f7cbbd9b377'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 500,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '42f5bb28-c564-453a-8219-9f7cbbd9b377'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 10000, updated_at = now() where id = '42f5bb28-c564-453a-8219-9f7cbbd9b377'::uuid;

-- 202: 600 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2d8a8413-c4e8-4909-9744-7dacce278f7f'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2d8a8413-c4e8-4909-9744-7dacce278f7f'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2d8a8413-c4e8-4909-9744-7dacce278f7f'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 14400, updated_at = now() where id = '2d8a8413-c4e8-4909-9744-7dacce278f7f'::uuid;

-- 21-1: 300 CTN x 20 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'a6873e5d-9dad-4e7a-8e00-8f5c1ef26933'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'a6873e5d-9dad-4e7a-8e00-8f5c1ef26933'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'a6873e5d-9dad-4e7a-8e00-8f5c1ef26933'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 72000, updated_at = now() where id = 'a6873e5d-9dad-4e7a-8e00-8f5c1ef26933'::uuid;

-- 21-2: 120 CTN x 20 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '14ae06a1-7994-479c-8c9f-b285df9446ff'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '14ae06a1-7994-479c-8c9f-b285df9446ff'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '14ae06a1-7994-479c-8c9f-b285df9446ff'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 28800, updated_at = now() where id = '14ae06a1-7994-479c-8c9f-b285df9446ff'::uuid;

-- 21-3: 175 CTN x 10 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '7b29109b-51a9-40fc-9b3a-ae91a6641e7b'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '7b29109b-51a9-40fc-9b3a-ae91a6641e7b'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '7b29109b-51a9-40fc-9b3a-ae91a6641e7b'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 21000, updated_at = now() where id = '7b29109b-51a9-40fc-9b3a-ae91a6641e7b'::uuid;

-- 21-4: 120 CTN x 10 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e96f8bab-d368-446e-89cb-d8afad986628'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e96f8bab-d368-446e-89cb-d8afad986628'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e96f8bab-d368-446e-89cb-d8afad986628'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 14400, updated_at = now() where id = 'e96f8bab-d368-446e-89cb-d8afad986628'::uuid;

-- 21-5: 60 CTN x 8 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c62c1432-be17-4537-af17-8aa808fa80a3'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c62c1432-be17-4537-af17-8aa808fa80a3'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 8,
  conversion_to_base = 96,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c62c1432-be17-4537-af17-8aa808fa80a3'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 5760, updated_at = now() where id = 'c62c1432-be17-4537-af17-8aa808fa80a3'::uuid;

-- 21-7: 5 CTN x 20 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '8c093303-133b-4f19-b6e5-e50fb6233064'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '8c093303-133b-4f19-b6e5-e50fb6233064'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '8c093303-133b-4f19-b6e5-e50fb6233064'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = '8c093303-133b-4f19-b6e5-e50fb6233064'::uuid;

-- 21-17: 5 CTN x 50 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '82b2e6cb-7d42-4c7b-9de4-16964a21c5e6'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '82b2e6cb-7d42-4c7b-9de4-16964a21c5e6'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 600,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '82b2e6cb-7d42-4c7b-9de4-16964a21c5e6'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 3000, updated_at = now() where id = '82b2e6cb-7d42-4c7b-9de4-16964a21c5e6'::uuid;

-- CB-1: 5 CTN x 12 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'b8383343-d24d-419c-a0b8-707a6db673df'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'b8383343-d24d-419c-a0b8-707a6db673df'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 144,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'b8383343-d24d-419c-a0b8-707a6db673df'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 720, updated_at = now() where id = 'b8383343-d24d-419c-a0b8-707a6db673df'::uuid;

-- CB-2: 5 CTN x 8 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e092178c-9cfe-41f7-abca-2be7c247fc3d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e092178c-9cfe-41f7-abca-2be7c247fc3d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 8,
  conversion_to_base = 96,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e092178c-9cfe-41f7-abca-2be7c247fc3d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = 'e092178c-9cfe-41f7-abca-2be7c247fc3d'::uuid;

-- CB-3: 5 CTN x 6 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '5045723d-348a-4d93-998f-92f8d071b72e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '5045723d-348a-4d93-998f-92f8d071b72e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 6,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '5045723d-348a-4d93-998f-92f8d071b72e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = '5045723d-348a-4d93-998f-92f8d071b72e'::uuid;

-- 55-128: 500 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c91819b2-37c1-49ac-8ec6-b808eb167587'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c91819b2-37c1-49ac-8ec6-b808eb167587'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c91819b2-37c1-49ac-8ec6-b808eb167587'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 10000, updated_at = now() where id = 'c91819b2-37c1-49ac-8ec6-b808eb167587'::uuid;

-- 40-1: 200 CTN x 5 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2a17cb8f-f4c1-41dc-8935-68232f635713'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2a17cb8f-f4c1-41dc-8935-68232f635713'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 5,
  conversion_to_base = 5,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2a17cb8f-f4c1-41dc-8935-68232f635713'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = '2a17cb8f-f4c1-41dc-8935-68232f635713'::uuid;

-- 40-2 row 113: 100 CTN x 5 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '693d7225-9bb2-4bfd-9ffe-02d12854f1e4'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '693d7225-9bb2-4bfd-9ffe-02d12854f1e4'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 5,
  conversion_to_base = 5,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '693d7225-9bb2-4bfd-9ffe-02d12854f1e4'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = '693d7225-9bb2-4bfd-9ffe-02d12854f1e4'::uuid;

-- 40-2 row 114: 100 CTN x 5 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2077d0b5-b2e8-4050-9a1f-f398ddc3100d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2077d0b5-b2e8-4050-9a1f-f398ddc3100d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 5,
  conversion_to_base = 5,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2077d0b5-b2e8-4050-9a1f-f398ddc3100d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = '2077d0b5-b2e8-4050-9a1f-f398ddc3100d'::uuid;

-- 40-30: 5 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '4586e622-7681-4a1f-bc72-ea4a68251729'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '4586e622-7681-4a1f-bc72-ea4a68251729'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '4586e622-7681-4a1f-bc72-ea4a68251729'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '4586e622-7681-4a1f-bc72-ea4a68251729'::uuid;

-- 40-5: 15 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '5c316f8d-1c27-4151-822e-ee4de584cbef'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '5c316f8d-1c27-4151-822e-ee4de584cbef'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '5c316f8d-1c27-4151-822e-ee4de584cbef'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 900, updated_at = now() where id = '5c316f8d-1c27-4151-822e-ee4de584cbef'::uuid;

-- 40-6: 10 CTN x 50 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c2f3610e-f871-4bb9-8ab0-cede8983b72d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c2f3610e-f871-4bb9-8ab0-cede8983b72d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 50,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c2f3610e-f871-4bb9-8ab0-cede8983b72d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = 'c2f3610e-f871-4bb9-8ab0-cede8983b72d'::uuid;

-- 55-1: 5 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '110cca95-bcf6-4d05-a740-39ac040b016e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '110cca95-bcf6-4d05-a740-39ac040b016e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '110cca95-bcf6-4d05-a740-39ac040b016e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '110cca95-bcf6-4d05-a740-39ac040b016e'::uuid;

-- 55-2: 10 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd2453112-97a5-4e8f-914a-8e592eeb3232'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd2453112-97a5-4e8f-914a-8e592eeb3232'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd2453112-97a5-4e8f-914a-8e592eeb3232'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = 'd2453112-97a5-4e8f-914a-8e592eeb3232'::uuid;

-- 55-3: 20 CTN x 72 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'f8796509-78ba-4017-a3ee-c94010b9a679'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'f8796509-78ba-4017-a3ee-c94010b9a679'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 72,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'f8796509-78ba-4017-a3ee-c94010b9a679'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1440, updated_at = now() where id = 'f8796509-78ba-4017-a3ee-c94010b9a679'::uuid;

-- 55-4: 25 CTN x 72 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'dade1c7d-3f0d-4082-8bd1-b70baff16f56'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'dade1c7d-3f0d-4082-8bd1-b70baff16f56'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 72,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'dade1c7d-3f0d-4082-8bd1-b70baff16f56'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1800, updated_at = now() where id = 'dade1c7d-3f0d-4082-8bd1-b70baff16f56'::uuid;

-- 55-5: 35 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '05c6b7a1-c078-4abe-bef0-0650f6c084b8'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '05c6b7a1-c078-4abe-bef0-0650f6c084b8'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '05c6b7a1-c078-4abe-bef0-0650f6c084b8'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1680, updated_at = now() where id = '05c6b7a1-c078-4abe-bef0-0650f6c084b8'::uuid;

-- 55-6: 10 CTN x 30 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '95df5049-0c8f-456f-ba9c-99716700880d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '95df5049-0c8f-456f-ba9c-99716700880d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 30,
  conversion_to_base = 30,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '95df5049-0c8f-456f-ba9c-99716700880d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 300, updated_at = now() where id = '95df5049-0c8f-456f-ba9c-99716700880d'::uuid;

-- 55-7: 10 CTN x 30 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '123f94df-40f4-42de-b120-6ab341e3b127'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '123f94df-40f4-42de-b120-6ab341e3b127'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 30,
  conversion_to_base = 30,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '123f94df-40f4-42de-b120-6ab341e3b127'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 300, updated_at = now() where id = '123f94df-40f4-42de-b120-6ab341e3b127'::uuid;

-- 55-8: 10 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2df2a37a-4981-4a75-abda-9a5c56553156'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2df2a37a-4981-4a75-abda-9a5c56553156'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2df2a37a-4981-4a75-abda-9a5c56553156'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '2df2a37a-4981-4a75-abda-9a5c56553156'::uuid;

-- 55-15: 10 CTN x 12 pkg x 50 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'fca2424c-13d2-4672-af18-81a05ee0a8b8'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 50,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'fca2424c-13d2-4672-af18-81a05ee0a8b8'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 600,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'fca2424c-13d2-4672-af18-81a05ee0a8b8'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 6000, updated_at = now() where id = 'fca2424c-13d2-4672-af18-81a05ee0a8b8'::uuid;

-- 55-133: 10 CTN x 72 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '51abaaea-6ada-4f08-b747-9ff2469d2876'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '51abaaea-6ada-4f08-b747-9ff2469d2876'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 72,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '51abaaea-6ada-4f08-b747-9ff2469d2876'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 720, updated_at = now() where id = '51abaaea-6ada-4f08-b747-9ff2469d2876'::uuid;

-- 55-134: 10 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '8564ff42-9023-46c4-992b-00f06c6e3910'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '8564ff42-9023-46c4-992b-00f06c6e3910'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '8564ff42-9023-46c4-992b-00f06c6e3910'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = '8564ff42-9023-46c4-992b-00f06c6e3910'::uuid;

-- 55-135: 10 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '7640a88d-79d0-4819-94ba-996983b39076'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '7640a88d-79d0-4819-94ba-996983b39076'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '7640a88d-79d0-4819-94ba-996983b39076'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = '7640a88d-79d0-4819-94ba-996983b39076'::uuid;

-- 45-1 row 130: 10 CTN x 10 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e96935ec-5128-49c3-9f3b-7c2e3d2e13c7'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e96935ec-5128-49c3-9f3b-7c2e3d2e13c7'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 10,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e96935ec-5128-49c3-9f3b-7c2e3d2e13c7'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 100, updated_at = now() where id = 'e96935ec-5128-49c3-9f3b-7c2e3d2e13c7'::uuid;

-- 45-2: 15 CTN x 5 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '936e8884-9e19-4cf3-b4fb-4d1b511dbacf'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '936e8884-9e19-4cf3-b4fb-4d1b511dbacf'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 5,
  conversion_to_base = 5,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '936e8884-9e19-4cf3-b4fb-4d1b511dbacf'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 75, updated_at = now() where id = '936e8884-9e19-4cf3-b4fb-4d1b511dbacf'::uuid;

-- 45-3: 15 CTN x 5 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'a08fa71f-e0f8-44e4-9828-8628e5f444b5'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'a08fa71f-e0f8-44e4-9828-8628e5f444b5'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 5,
  conversion_to_base = 5,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'a08fa71f-e0f8-44e4-9828-8628e5f444b5'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 75, updated_at = now() where id = 'a08fa71f-e0f8-44e4-9828-8628e5f444b5'::uuid;

-- 47-1: 10 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '764f655a-c103-467d-8718-e3ee65205621'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '764f655a-c103-467d-8718-e3ee65205621'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '764f655a-c103-467d-8718-e3ee65205621'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '764f655a-c103-467d-8718-e3ee65205621'::uuid;

-- 47-12: 5 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2093c59c-1452-45f0-8c6c-5b6f71bb1a40'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2093c59c-1452-45f0-8c6c-5b6f71bb1a40'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2093c59c-1452-45f0-8c6c-5b6f71bb1a40'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '2093c59c-1452-45f0-8c6c-5b6f71bb1a40'::uuid;

-- 47-14: 3 CTN x 240 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '712d4121-7317-4bca-91e5-347e781f70aa'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '712d4121-7317-4bca-91e5-347e781f70aa'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 240,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '712d4121-7317-4bca-91e5-347e781f70aa'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 720, updated_at = now() where id = '712d4121-7317-4bca-91e5-347e781f70aa'::uuid;

-- 47-18: 5 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2ff3cfb5-006b-407e-8c74-1b38c23fe129'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2ff3cfb5-006b-407e-8c74-1b38c23fe129'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2ff3cfb5-006b-407e-8c74-1b38c23fe129'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '2ff3cfb5-006b-407e-8c74-1b38c23fe129'::uuid;

-- 47-19: 3 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '3d8c772b-aaf5-4e8f-9ed8-d8fc1a6b6f7e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '3d8c772b-aaf5-4e8f-9ed8-d8fc1a6b6f7e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '3d8c772b-aaf5-4e8f-9ed8-d8fc1a6b6f7e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = '3d8c772b-aaf5-4e8f-9ed8-d8fc1a6b6f7e'::uuid;

-- 47-20: 5 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'cdb34ced-8c5d-4c56-a62c-8733aa271de9'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'cdb34ced-8c5d-4c56-a62c-8733aa271de9'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'cdb34ced-8c5d-4c56-a62c-8733aa271de9'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = 'cdb34ced-8c5d-4c56-a62c-8733aa271de9'::uuid;

-- 47-21: 5 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd847e607-a514-4d3f-aec2-9383ca9efc19'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd847e607-a514-4d3f-aec2-9383ca9efc19'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd847e607-a514-4d3f-aec2-9383ca9efc19'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = 'd847e607-a514-4d3f-aec2-9383ca9efc19'::uuid;

-- 47-22: 5 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd05d82ff-f701-462e-b029-e77c580ebcd0'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd05d82ff-f701-462e-b029-e77c580ebcd0'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd05d82ff-f701-462e-b029-e77c580ebcd0'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = 'd05d82ff-f701-462e-b029-e77c580ebcd0'::uuid;

-- 3-23: 5 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '85f198fc-e381-4edc-8e89-4ae2f4ce582a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '85f198fc-e381-4edc-8e89-4ae2f4ce582a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '85f198fc-e381-4edc-8e89-4ae2f4ce582a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 100, updated_at = now() where id = '85f198fc-e381-4edc-8e89-4ae2f4ce582a'::uuid;

-- 3-24: 5 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '24667bcb-934e-42d8-863f-6e52eb9acc8c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '24667bcb-934e-42d8-863f-6e52eb9acc8c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '24667bcb-934e-42d8-863f-6e52eb9acc8c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 80, updated_at = now() where id = '24667bcb-934e-42d8-863f-6e52eb9acc8c'::uuid;

-- 3-25: 5 CTN x 16 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '04a40d14-4210-40ac-af0c-72a462c1972c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '04a40d14-4210-40ac-af0c-72a462c1972c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 16,
  conversion_to_base = 16,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '04a40d14-4210-40ac-af0c-72a462c1972c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 80, updated_at = now() where id = '04a40d14-4210-40ac-af0c-72a462c1972c'::uuid;

-- 3-26: 5 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '4b86b9e9-1c63-41de-b993-cf1f9dce7aff'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '4b86b9e9-1c63-41de-b993-cf1f9dce7aff'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '4b86b9e9-1c63-41de-b993-cf1f9dce7aff'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 60, updated_at = now() where id = '4b86b9e9-1c63-41de-b993-cf1f9dce7aff'::uuid;

-- 47-2: 20 CTN x 10 pkg x 6 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'df323425-c92a-4d01-9637-d2a906ee26e3'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 6,
  conversion_to_base = 6,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'df323425-c92a-4d01-9637-d2a906ee26e3'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'df323425-c92a-4d01-9637-d2a906ee26e3'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = 'df323425-c92a-4d01-9637-d2a906ee26e3'::uuid;

-- 47-3: 5 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '72f3a3ad-3340-4164-b81f-757db11729fe'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '72f3a3ad-3340-4164-b81f-757db11729fe'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '72f3a3ad-3340-4164-b81f-757db11729fe'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '72f3a3ad-3340-4164-b81f-757db11729fe'::uuid;

-- 47-5: 5 CTN x 240 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '01fa0d82-f905-4f7a-ab85-771e25f7d103'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '01fa0d82-f905-4f7a-ab85-771e25f7d103'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 240,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '01fa0d82-f905-4f7a-ab85-771e25f7d103'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = '01fa0d82-f905-4f7a-ab85-771e25f7d103'::uuid;

-- 47-6: 10 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '5221b915-88fb-4620-b974-beee4874d24d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '5221b915-88fb-4620-b974-beee4874d24d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '5221b915-88fb-4620-b974-beee4874d24d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = '5221b915-88fb-4620-b974-beee4874d24d'::uuid;

-- 47-7: 5 CTN x 36 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '6cbf6bb0-cfad-4de8-bd76-c850afa6721e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '6cbf6bb0-cfad-4de8-bd76-c850afa6721e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 36,
  conversion_to_base = 36,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '6cbf6bb0-cfad-4de8-bd76-c850afa6721e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 180, updated_at = now() where id = '6cbf6bb0-cfad-4de8-bd76-c850afa6721e'::uuid;

-- 47-11: 5 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '87c53433-cb9b-4940-8ced-5eb1cf7be154'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '87c53433-cb9b-4940-8ced-5eb1cf7be154'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '87c53433-cb9b-4940-8ced-5eb1cf7be154'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '87c53433-cb9b-4940-8ced-5eb1cf7be154'::uuid;

-- 47-13: 10 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '9a5baed0-4505-4fc2-84f0-1e6edea05040'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '9a5baed0-4505-4fc2-84f0-1e6edea05040'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '9a5baed0-4505-4fc2-84f0-1e6edea05040'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '9a5baed0-4505-4fc2-84f0-1e6edea05040'::uuid;

-- 47-15: 3 CTN x 25 pkg x 20 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '478362fe-edd4-4ed8-8e33-e320e67c1902'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '478362fe-edd4-4ed8-8e33-e320e67c1902'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 25,
  conversion_to_base = 500,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '478362fe-edd4-4ed8-8e33-e320e67c1902'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1500, updated_at = now() where id = '478362fe-edd4-4ed8-8e33-e320e67c1902'::uuid;

-- 47-16: 4 CTN x 25 pkg x 20 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '77c3c401-2d3f-4bdc-a0b2-eabb5e67c687'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '77c3c401-2d3f-4bdc-a0b2-eabb5e67c687'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 25,
  conversion_to_base = 500,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '77c3c401-2d3f-4bdc-a0b2-eabb5e67c687'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 2000, updated_at = now() where id = '77c3c401-2d3f-4bdc-a0b2-eabb5e67c687'::uuid;

-- 50-1: 15 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '6f170931-d469-4033-9c82-1e21a1f3cb3e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '6f170931-d469-4033-9c82-1e21a1f3cb3e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '6f170931-d469-4033-9c82-1e21a1f3cb3e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 720, updated_at = now() where id = '6f170931-d469-4033-9c82-1e21a1f3cb3e'::uuid;

-- 50-22: 5 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'cf521ae3-53aa-47d1-b622-b51b6dbb33f0'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'cf521ae3-53aa-47d1-b622-b51b6dbb33f0'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'cf521ae3-53aa-47d1-b622-b51b6dbb33f0'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 300, updated_at = now() where id = 'cf521ae3-53aa-47d1-b622-b51b6dbb33f0'::uuid;

-- 50-23: 10 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c3c93264-0eae-4286-8938-a95c5692030c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c3c93264-0eae-4286-8938-a95c5692030c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c3c93264-0eae-4286-8938-a95c5692030c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 480, updated_at = now() where id = 'c3c93264-0eae-4286-8938-a95c5692030c'::uuid;

-- B-14: 10 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2be207b0-5966-401a-b73c-1e6f324f4777'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2be207b0-5966-401a-b73c-1e6f324f4777'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2be207b0-5966-401a-b73c-1e6f324f4777'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '2be207b0-5966-401a-b73c-1e6f324f4777'::uuid;

-- 3-4: 5 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '453a1cb7-c5f3-4876-9e54-8dc16cd10e2e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '453a1cb7-c5f3-4876-9e54-8dc16cd10e2e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '453a1cb7-c5f3-4876-9e54-8dc16cd10e2e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '453a1cb7-c5f3-4876-9e54-8dc16cd10e2e'::uuid;

-- 3-5: 15 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'a7fe03e6-35c1-48e4-b2a8-95870c370b5d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'a7fe03e6-35c1-48e4-b2a8-95870c370b5d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'a7fe03e6-35c1-48e4-b2a8-95870c370b5d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 720, updated_at = now() where id = 'a7fe03e6-35c1-48e4-b2a8-95870c370b5d'::uuid;

-- 3-6: 10 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2150761f-1bda-4248-9cf0-eb882993760a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2150761f-1bda-4248-9cf0-eb882993760a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2150761f-1bda-4248-9cf0-eb882993760a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '2150761f-1bda-4248-9cf0-eb882993760a'::uuid;

-- 47-17: 5 CTN x 10 pkg x 6 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '01885888-0067-4e03-9576-fa97005d150d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 6,
  conversion_to_base = 6,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '01885888-0067-4e03-9576-fa97005d150d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '01885888-0067-4e03-9576-fa97005d150d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 300, updated_at = now() where id = '01885888-0067-4e03-9576-fa97005d150d'::uuid;

-- 47-23: 10 CTN x 10 pkg x 6 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '26d74ab2-8764-48f5-ad2a-4300c5301c13'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 6,
  conversion_to_base = 6,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '26d74ab2-8764-48f5-ad2a-4300c5301c13'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '26d74ab2-8764-48f5-ad2a-4300c5301c13'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '26d74ab2-8764-48f5-ad2a-4300c5301c13'::uuid;

-- 55-136: 5 CTN x 10 pkg x 6 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '16b51d47-d8a5-4b23-ab6d-befb016ab8ed'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 6,
  conversion_to_base = 6,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '16b51d47-d8a5-4b23-ab6d-befb016ab8ed'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '16b51d47-d8a5-4b23-ab6d-befb016ab8ed'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 300, updated_at = now() where id = '16b51d47-d8a5-4b23-ab6d-befb016ab8ed'::uuid;

-- 55-137: 2 CTN x 10 pkg x 6 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '18f55351-3eca-4fa5-a447-7d9ee12aa10a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 6,
  conversion_to_base = 6,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '18f55351-3eca-4fa5-a447-7d9ee12aa10a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '18f55351-3eca-4fa5-a447-7d9ee12aa10a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 120, updated_at = now() where id = '18f55351-3eca-4fa5-a447-7d9ee12aa10a'::uuid;

-- 55-139: 10 CTN x 10 pkg x 6 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '8a82e450-bf39-4d37-82b3-98eb89a540e3'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 6,
  conversion_to_base = 6,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '8a82e450-bf39-4d37-82b3-98eb89a540e3'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '8a82e450-bf39-4d37-82b3-98eb89a540e3'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '8a82e450-bf39-4d37-82b3-98eb89a540e3'::uuid;

-- 55-140-1: 3 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'de304bb5-9706-4fb4-a0dc-846ee544b651'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'de304bb5-9706-4fb4-a0dc-846ee544b651'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'de304bb5-9706-4fb4-a0dc-846ee544b651'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = 'de304bb5-9706-4fb4-a0dc-846ee544b651'::uuid;

-- 55-140-2: 3 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e15fa045-e710-402c-b442-5d168c2f6d67'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e15fa045-e710-402c-b442-5d168c2f6d67'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e15fa045-e710-402c-b442-5d168c2f6d67'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = 'e15fa045-e710-402c-b442-5d168c2f6d67'::uuid;

-- 55-140-3: 6 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e890cc2c-389a-43e8-a198-a11df45b5447'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e890cc2c-389a-43e8-a198-a11df45b5447'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e890cc2c-389a-43e8-a198-a11df45b5447'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 720, updated_at = now() where id = 'e890cc2c-389a-43e8-a198-a11df45b5447'::uuid;

-- 55-140-4: 3 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '95b4656e-394a-4f24-a38c-63dedc44af2e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '95b4656e-394a-4f24-a38c-63dedc44af2e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '95b4656e-394a-4f24-a38c-63dedc44af2e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = '95b4656e-394a-4f24-a38c-63dedc44af2e'::uuid;

-- 55-140-5: 3 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd1a4042d-91ac-4941-9e02-3c7f7db0dc9a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd1a4042d-91ac-4941-9e02-3c7f7db0dc9a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd1a4042d-91ac-4941-9e02-3c7f7db0dc9a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = 'd1a4042d-91ac-4941-9e02-3c7f7db0dc9a'::uuid;

-- 55-145: 3 CTN x 72 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'ce4f7214-ff28-4392-9354-9b527d7f85c5'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'ce4f7214-ff28-4392-9354-9b527d7f85c5'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 72,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'ce4f7214-ff28-4392-9354-9b527d7f85c5'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 216, updated_at = now() where id = 'ce4f7214-ff28-4392-9354-9b527d7f85c5'::uuid;

-- 55-146: 3 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2f07f79e-ef8b-484e-9da2-b02d46e19241'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2f07f79e-ef8b-484e-9da2-b02d46e19241'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2f07f79e-ef8b-484e-9da2-b02d46e19241'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 180, updated_at = now() where id = '2f07f79e-ef8b-484e-9da2-b02d46e19241'::uuid;

-- 55-147: 3 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'bc2161e1-40ff-46d2-838a-d183d24362d7'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'bc2161e1-40ff-46d2-838a-d183d24362d7'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'bc2161e1-40ff-46d2-838a-d183d24362d7'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 144, updated_at = now() where id = 'bc2161e1-40ff-46d2-838a-d183d24362d7'::uuid;

-- 55-148: 5 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '281a03f0-4bce-4248-b6a4-881f7349af17'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '281a03f0-4bce-4248-b6a4-881f7349af17'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '281a03f0-4bce-4248-b6a4-881f7349af17'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '281a03f0-4bce-4248-b6a4-881f7349af17'::uuid;

-- 55-149-1: 10 CTN x 20 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '949d7773-ef3f-4e47-a5a7-ba06bb2855d8'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '949d7773-ef3f-4e47-a5a7-ba06bb2855d8'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '949d7773-ef3f-4e47-a5a7-ba06bb2855d8'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 2400, updated_at = now() where id = '949d7773-ef3f-4e47-a5a7-ba06bb2855d8'::uuid;

-- 55-149-2: 10 CTN x 20 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '07e96617-a205-4a70-9a5d-2e48c4b291f9'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '07e96617-a205-4a70-9a5d-2e48c4b291f9'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '07e96617-a205-4a70-9a5d-2e48c4b291f9'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 2400, updated_at = now() where id = '07e96617-a205-4a70-9a5d-2e48c4b291f9'::uuid;

-- 47-9: 5 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '0a082b78-f7ec-4ba7-a524-e1ff63ffc031'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '0a082b78-f7ec-4ba7-a524-e1ff63ffc031'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '0a082b78-f7ec-4ba7-a524-e1ff63ffc031'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 300, updated_at = now() where id = '0a082b78-f7ec-4ba7-a524-e1ff63ffc031'::uuid;

-- 47-10: 5 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '479b1214-baa4-4a01-bbfb-7a5db6646a7b'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '479b1214-baa4-4a01-bbfb-7a5db6646a7b'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '479b1214-baa4-4a01-bbfb-7a5db6646a7b'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 300, updated_at = now() where id = '479b1214-baa4-4a01-bbfb-7a5db6646a7b'::uuid;

-- 51-1: 25 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '6c522d53-e640-437d-9968-fa24c1712808'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '6c522d53-e640-437d-9968-fa24c1712808'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '6c522d53-e640-437d-9968-fa24c1712808'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1500, updated_at = now() where id = '6c522d53-e640-437d-9968-fa24c1712808'::uuid;

-- 55-151: 25 CTN x 20 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'b5d18bae-c252-4988-8a62-bc1e9905df1a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'b5d18bae-c252-4988-8a62-bc1e9905df1a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'b5d18bae-c252-4988-8a62-bc1e9905df1a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 6000, updated_at = now() where id = 'b5d18bae-c252-4988-8a62-bc1e9905df1a'::uuid;

-- 26-70: 25 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'ad3ed6f5-9f43-46c5-a457-9c6a6d5b21cf'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'ad3ed6f5-9f43-46c5-a457-9c6a6d5b21cf'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'ad3ed6f5-9f43-46c5-a457-9c6a6d5b21cf'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 2500, updated_at = now() where id = 'ad3ed6f5-9f43-46c5-a457-9c6a6d5b21cf'::uuid;

-- 26-71: 5 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'ecab4680-5d84-4c25-bea1-4d9b829ef1ad'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'ecab4680-5d84-4c25-bea1-4d9b829ef1ad'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'ecab4680-5d84-4c25-bea1-4d9b829ef1ad'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = 'ecab4680-5d84-4c25-bea1-4d9b829ef1ad'::uuid;

-- 38-1: 10 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd75e9617-7631-41e0-aad9-ae77ef98d96e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd75e9617-7631-41e0-aad9-ae77ef98d96e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd75e9617-7631-41e0-aad9-ae77ef98d96e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = 'd75e9617-7631-41e0-aad9-ae77ef98d96e'::uuid;

-- 38-2: 3 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '82dcff2a-45c9-4699-a4c9-5875c85b6906'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '82dcff2a-45c9-4699-a4c9-5875c85b6906'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '82dcff2a-45c9-4699-a4c9-5875c85b6906'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = '82dcff2a-45c9-4699-a4c9-5875c85b6906'::uuid;

-- 38-3: 3 CTN x 250 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'aa83a017-b29a-42f4-91fc-c541b116efd6'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'aa83a017-b29a-42f4-91fc-c541b116efd6'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 250,
  conversion_to_base = 250,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'aa83a017-b29a-42f4-91fc-c541b116efd6'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 750, updated_at = now() where id = 'aa83a017-b29a-42f4-91fc-c541b116efd6'::uuid;

-- 2-1: 10 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e444095c-bead-40b5-8462-64235ce2570c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e444095c-bead-40b5-8462-64235ce2570c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e444095c-bead-40b5-8462-64235ce2570c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = 'e444095c-bead-40b5-8462-64235ce2570c'::uuid;

-- 2-2: 5 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'adb57408-159d-494c-b557-35b3929bbdd8'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'adb57408-159d-494c-b557-35b3929bbdd8'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'adb57408-159d-494c-b557-35b3929bbdd8'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = 'adb57408-159d-494c-b557-35b3929bbdd8'::uuid;

-- 5-4 row 188: 50 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2fb08a9e-fded-4935-b660-38680b2fe0e7'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2fb08a9e-fded-4935-b660-38680b2fe0e7'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2fb08a9e-fded-4935-b660-38680b2fe0e7'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 2400, updated_at = now() where id = '2fb08a9e-fded-4935-b660-38680b2fe0e7'::uuid;

-- 5-88: 20 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'dfac89ea-618c-4031-8d2c-3510ff4b1a86'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'dfac89ea-618c-4031-8d2c-3510ff4b1a86'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'dfac89ea-618c-4031-8d2c-3510ff4b1a86'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 960, updated_at = now() where id = 'dfac89ea-618c-4031-8d2c-3510ff4b1a86'::uuid;

-- 5-7 row 190: 5 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'f603e5f8-2d98-4af2-af77-9e7283efd763'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'f603e5f8-2d98-4af2-af77-9e7283efd763'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'f603e5f8-2d98-4af2-af77-9e7283efd763'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 60, updated_at = now() where id = 'f603e5f8-2d98-4af2-af77-9e7283efd763'::uuid;

-- 5-8: 5 CTN x 12 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '15a00842-df64-4659-900d-28802242009e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '15a00842-df64-4659-900d-28802242009e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '15a00842-df64-4659-900d-28802242009e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 60, updated_at = now() where id = '15a00842-df64-4659-900d-28802242009e'::uuid;

-- 5-9: 30 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2de81591-24f6-4f6a-afa1-8d090d40cfad'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2de81591-24f6-4f6a-afa1-8d090d40cfad'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2de81591-24f6-4f6a-afa1-8d090d40cfad'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1800, updated_at = now() where id = '2de81591-24f6-4f6a-afa1-8d090d40cfad'::uuid;

-- 5-10: 30 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '21b6a029-9e9b-4dae-8174-17870171206a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '21b6a029-9e9b-4dae-8174-17870171206a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '21b6a029-9e9b-4dae-8174-17870171206a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1800, updated_at = now() where id = '21b6a029-9e9b-4dae-8174-17870171206a'::uuid;

-- 5-11: 30 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c6867460-262d-478d-a628-1f034eb33c8f'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c6867460-262d-478d-a628-1f034eb33c8f'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c6867460-262d-478d-a628-1f034eb33c8f'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1440, updated_at = now() where id = 'c6867460-262d-478d-a628-1f034eb33c8f'::uuid;

-- 5-12: 30 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'ca97f6ac-8783-49d2-bcff-eda1f94abbfc'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'ca97f6ac-8783-49d2-bcff-eda1f94abbfc'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'ca97f6ac-8783-49d2-bcff-eda1f94abbfc'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1440, updated_at = now() where id = 'ca97f6ac-8783-49d2-bcff-eda1f94abbfc'::uuid;

-- RBT-8: 10 CTN x 10 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '04335c49-ed8b-4e41-80d6-4e83b691c4d9'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '04335c49-ed8b-4e41-80d6-4e83b691c4d9'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '04335c49-ed8b-4e41-80d6-4e83b691c4d9'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = '04335c49-ed8b-4e41-80d6-4e83b691c4d9'::uuid;

-- RBT-12: 2 CTN x 10 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '825ffb7c-e271-4316-9e45-1d6581a18634'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '825ffb7c-e271-4316-9e45-1d6581a18634'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '825ffb7c-e271-4316-9e45-1d6581a18634'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '825ffb7c-e271-4316-9e45-1d6581a18634'::uuid;

-- 9-18: 100 CTN x 25 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '6dd4ebbb-a00b-42bd-a4e6-82c9d9ec7aa1'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '6dd4ebbb-a00b-42bd-a4e6-82c9d9ec7aa1'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 25,
  conversion_to_base = 25,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '6dd4ebbb-a00b-42bd-a4e6-82c9d9ec7aa1'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 2500, updated_at = now() where id = '6dd4ebbb-a00b-42bd-a4e6-82c9d9ec7aa1'::uuid;

-- RBT-80: 3 CTN x 150 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '0c517f2b-1f9c-49db-bef4-c0d0fce36c7e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '0c517f2b-1f9c-49db-bef4-c0d0fce36c7e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 150,
  conversion_to_base = 150,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '0c517f2b-1f9c-49db-bef4-c0d0fce36c7e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 450, updated_at = now() where id = '0c517f2b-1f9c-49db-bef4-c0d0fce36c7e'::uuid;

-- RBT-81: 3 CTN x 90 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '239374b5-1f18-4a67-a48e-9f623662efb4'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '239374b5-1f18-4a67-a48e-9f623662efb4'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 90,
  conversion_to_base = 90,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '239374b5-1f18-4a67-a48e-9f623662efb4'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 270, updated_at = now() where id = '239374b5-1f18-4a67-a48e-9f623662efb4'::uuid;

-- RBT-82: 10 CTN x 64 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '1a33e484-6267-45c5-811d-fdb713964cd5'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '1a33e484-6267-45c5-811d-fdb713964cd5'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 64,
  conversion_to_base = 64,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '1a33e484-6267-45c5-811d-fdb713964cd5'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 640, updated_at = now() where id = '1a33e484-6267-45c5-811d-fdb713964cd5'::uuid;

-- RBT-83: 3 CTN x 36 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '69ca932e-23c9-40a1-97fb-9407a189878b'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '69ca932e-23c9-40a1-97fb-9407a189878b'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 36,
  conversion_to_base = 36,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '69ca932e-23c9-40a1-97fb-9407a189878b'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 108, updated_at = now() where id = '69ca932e-23c9-40a1-97fb-9407a189878b'::uuid;

-- RBT-84: 3 CTN x 30 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '1379855b-b629-4201-94a0-4b097ac9e652'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '1379855b-b629-4201-94a0-4b097ac9e652'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 30,
  conversion_to_base = 30,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '1379855b-b629-4201-94a0-4b097ac9e652'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 90, updated_at = now() where id = '1379855b-b629-4201-94a0-4b097ac9e652'::uuid;

-- RBT-15: 5 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'a74172e9-7edd-465d-98e7-15d1e0c77f38'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'a74172e9-7edd-465d-98e7-15d1e0c77f38'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'a74172e9-7edd-465d-98e7-15d1e0c77f38'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = 'a74172e9-7edd-465d-98e7-15d1e0c77f38'::uuid;

-- RBT-16: 10 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '52ea7bd2-20e9-490b-8ce0-cf7055491d38'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '52ea7bd2-20e9-490b-8ce0-cf7055491d38'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '52ea7bd2-20e9-490b-8ce0-cf7055491d38'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = '52ea7bd2-20e9-490b-8ce0-cf7055491d38'::uuid;

-- 55-127: 10 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd1dc11fd-cad1-4c9b-a4e3-40d54c176610'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd1dc11fd-cad1-4c9b-a4e3-40d54c176610'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd1dc11fd-cad1-4c9b-a4e3-40d54c176610'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = 'd1dc11fd-cad1-4c9b-a4e3-40d54c176610'::uuid;

-- 13-5: 4 CTN x 72 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '173fb93a-c329-4749-b81a-c6c2479bc6b9'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '173fb93a-c329-4749-b81a-c6c2479bc6b9'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 72,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '173fb93a-c329-4749-b81a-c6c2479bc6b9'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 288, updated_at = now() where id = '173fb93a-c329-4749-b81a-c6c2479bc6b9'::uuid;

-- 13-6: 5 CTN x 72 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2af76fc2-d8f5-4f69-bb5d-c82ce0770b84'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2af76fc2-d8f5-4f69-bb5d-c82ce0770b84'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 72,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2af76fc2-d8f5-4f69-bb5d-c82ce0770b84'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 360, updated_at = now() where id = '2af76fc2-d8f5-4f69-bb5d-c82ce0770b84'::uuid;

-- 13-7: 6 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'a8fcd932-af5c-419d-8a73-eb3f7d54248d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'a8fcd932-af5c-419d-8a73-eb3f7d54248d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'a8fcd932-af5c-419d-8a73-eb3f7d54248d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 288, updated_at = now() where id = 'a8fcd932-af5c-419d-8a73-eb3f7d54248d'::uuid;

-- 13-8: 7 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '8c4f42ca-992b-4c0b-afcd-9e93ff81bec8'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '8c4f42ca-992b-4c0b-afcd-9e93ff81bec8'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '8c4f42ca-992b-4c0b-afcd-9e93ff81bec8'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 336, updated_at = now() where id = '8c4f42ca-992b-4c0b-afcd-9e93ff81bec8'::uuid;

-- 70-1: 10 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '7ac69f9e-f216-4b24-9ff3-513ce9a926a8'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '7ac69f9e-f216-4b24-9ff3-513ce9a926a8'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '7ac69f9e-f216-4b24-9ff3-513ce9a926a8'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '7ac69f9e-f216-4b24-9ff3-513ce9a926a8'::uuid;

-- 70-2: 10 CTN x 24 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '44e02a48-9514-4913-823c-0443c065a95b'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '44e02a48-9514-4913-823c-0443c065a95b'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '44e02a48-9514-4913-823c-0443c065a95b'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 240, updated_at = now() where id = '44e02a48-9514-4913-823c-0443c065a95b'::uuid;

-- 8-4: 10 CTN x 20 pkg x 5 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2a4d2418-d716-4c2d-a689-dd7f43a4272c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 5,
  conversion_to_base = 5,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2a4d2418-d716-4c2d-a689-dd7f43a4272c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2a4d2418-d716-4c2d-a689-dd7f43a4272c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = '2a4d2418-d716-4c2d-a689-dd7f43a4272c'::uuid;

-- 8-5: 1 CTN x 300 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '9b7c4dca-f353-4934-8283-6509b51c416d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '9b7c4dca-f353-4934-8283-6509b51c416d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 300,
  conversion_to_base = 300,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '9b7c4dca-f353-4934-8283-6509b51c416d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 300, updated_at = now() where id = '9b7c4dca-f353-4934-8283-6509b51c416d'::uuid;

-- 20-1: 50 CTN x 20 pkg x 24 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '9a4d3d25-a414-49ee-931b-c301db27323b'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '9a4d3d25-a414-49ee-931b-c301db27323b'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 480,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '9a4d3d25-a414-49ee-931b-c301db27323b'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 24000, updated_at = now() where id = '9a4d3d25-a414-49ee-931b-c301db27323b'::uuid;

-- 20-2: 70 CTN x 10 pkg x 24 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'edbc9e3b-7096-4ec9-86b0-463e3073e976'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'edbc9e3b-7096-4ec9-86b0-463e3073e976'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'edbc9e3b-7096-4ec9-86b0-463e3073e976'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 16800, updated_at = now() where id = 'edbc9e3b-7096-4ec9-86b0-463e3073e976'::uuid;

-- 20-3: 150 CTN x 5 pkg x 24 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c57cc60c-2277-4940-ad76-89282f5edcfe'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c57cc60c-2277-4940-ad76-89282f5edcfe'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 5,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c57cc60c-2277-4940-ad76-89282f5edcfe'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 18000, updated_at = now() where id = 'c57cc60c-2277-4940-ad76-89282f5edcfe'::uuid;

-- 20-4: 30 CTN x 20 pkg x 24 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '997c9446-8292-4d3b-9c35-bbaafa2638bd'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '997c9446-8292-4d3b-9c35-bbaafa2638bd'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 480,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '997c9446-8292-4d3b-9c35-bbaafa2638bd'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 14400, updated_at = now() where id = '997c9446-8292-4d3b-9c35-bbaafa2638bd'::uuid;

-- 20-5: 30 CTN x 10 pkg x 24 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2c33fb91-776a-4d3e-81c2-7e48861770cc'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2c33fb91-776a-4d3e-81c2-7e48861770cc'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 240,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2c33fb91-776a-4d3e-81c2-7e48861770cc'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 7200, updated_at = now() where id = '2c33fb91-776a-4d3e-81c2-7e48861770cc'::uuid;

-- 20-6: 70 CTN x 5 pkg x 24 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'f28c6de5-1129-4801-9b2b-e9c365b6e505'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 24,
  conversion_to_base = 24,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'f28c6de5-1129-4801-9b2b-e9c365b6e505'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 5,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'f28c6de5-1129-4801-9b2b-e9c365b6e505'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 8400, updated_at = now() where id = 'f28c6de5-1129-4801-9b2b-e9c365b6e505'::uuid;

-- FHM-41: 10 CTN x 72 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'ed2a9949-68fb-4b19-afcb-6b52d3dcf214'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'ed2a9949-68fb-4b19-afcb-6b52d3dcf214'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 72,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'ed2a9949-68fb-4b19-afcb-6b52d3dcf214'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 720, updated_at = now() where id = 'ed2a9949-68fb-4b19-afcb-6b52d3dcf214'::uuid;

-- FHM-42: 25 CTN x 50 pkg x 10 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd6b86610-1a32-4ece-8013-2d2f8e54f7af'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 10,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd6b86610-1a32-4ece-8013-2d2f8e54f7af'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 500,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd6b86610-1a32-4ece-8013-2d2f8e54f7af'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 12500, updated_at = now() where id = 'd6b86610-1a32-4ece-8013-2d2f8e54f7af'::uuid;

-- 61-1: 30 CTN x 200 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'a325521f-0544-4028-bd5f-ed9fbbb6ef46'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'a325521f-0544-4028-bd5f-ed9fbbb6ef46'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 200,
  conversion_to_base = 200,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'a325521f-0544-4028-bd5f-ed9fbbb6ef46'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 6000, updated_at = now() where id = 'a325521f-0544-4028-bd5f-ed9fbbb6ef46'::uuid;

-- 61-2: 20 CTN x 50 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '81e226f5-cf14-42d6-9e69-6f89c45bba35'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '81e226f5-cf14-42d6-9e69-6f89c45bba35'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 50,
  conversion_to_base = 50,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '81e226f5-cf14-42d6-9e69-6f89c45bba35'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1000, updated_at = now() where id = '81e226f5-cf14-42d6-9e69-6f89c45bba35'::uuid;

-- 52-1: 15 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c55a5aa3-aec7-4667-a54f-adfec9598831'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c55a5aa3-aec7-4667-a54f-adfec9598831'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c55a5aa3-aec7-4667-a54f-adfec9598831'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1500, updated_at = now() where id = 'c55a5aa3-aec7-4667-a54f-adfec9598831'::uuid;

-- 44-1: 40 CTN x 36 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'b07680ee-dd7c-4647-8379-c2e4ee99dd9c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'b07680ee-dd7c-4647-8379-c2e4ee99dd9c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 36,
  conversion_to_base = 36,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'b07680ee-dd7c-4647-8379-c2e4ee99dd9c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1440, updated_at = now() where id = 'b07680ee-dd7c-4647-8379-c2e4ee99dd9c'::uuid;

-- 44-2: 40 CTN x 30 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'dbcbde50-89f6-4d9b-836d-1761658eec99'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'dbcbde50-89f6-4d9b-836d-1761658eec99'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 30,
  conversion_to_base = 30,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'dbcbde50-89f6-4d9b-836d-1761658eec99'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = 'dbcbde50-89f6-4d9b-836d-1761658eec99'::uuid;

-- 44-3: 40 CTN x 30 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '771ed154-bfad-442d-bc77-89577f04914e'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '771ed154-bfad-442d-bc77-89577f04914e'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 30,
  conversion_to_base = 30,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '771ed154-bfad-442d-bc77-89577f04914e'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = '771ed154-bfad-442d-bc77-89577f04914e'::uuid;

-- 32-1: 30 CTN x 20 pkg x 10 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '8081e661-8907-4116-9b8f-b08b8307a45a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 10,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '8081e661-8907-4116-9b8f-b08b8307a45a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 200,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '8081e661-8907-4116-9b8f-b08b8307a45a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 6000, updated_at = now() where id = '8081e661-8907-4116-9b8f-b08b8307a45a'::uuid;

-- 32-2: 20 CTN x 20 pkg x 10 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '80d22d43-255a-45c7-8281-e90b920584e1'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 10,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '80d22d43-255a-45c7-8281-e90b920584e1'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 200,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '80d22d43-255a-45c7-8281-e90b920584e1'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 4000, updated_at = now() where id = '80d22d43-255a-45c7-8281-e90b920584e1'::uuid;

-- RD-3: 7 CTN x 20 pkg x 10 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '47a56842-da41-4395-84fc-b044d85b7c9c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 10,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '47a56842-da41-4395-84fc-b044d85b7c9c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 200,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '47a56842-da41-4395-84fc-b044d85b7c9c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1400, updated_at = now() where id = '47a56842-da41-4395-84fc-b044d85b7c9c'::uuid;

-- 46-1: 100 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'a503835c-1b88-4152-bf63-33d117870cbb'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'a503835c-1b88-4152-bf63-33d117870cbb'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'a503835c-1b88-4152-bf63-33d117870cbb'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 12000, updated_at = now() where id = 'a503835c-1b88-4152-bf63-33d117870cbb'::uuid;

-- 46-2: 10 CTN x 120 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '426bf6af-ce74-4747-9535-fa0db5a08f4a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '426bf6af-ce74-4747-9535-fa0db5a08f4a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 120,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '426bf6af-ce74-4747-9535-fa0db5a08f4a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = '426bf6af-ce74-4747-9535-fa0db5a08f4a'::uuid;

-- 46-3: 15 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '54b13c1e-b837-404f-9bd8-ea579d266af1'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '54b13c1e-b837-404f-9bd8-ea579d266af1'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '54b13c1e-b837-404f-9bd8-ea579d266af1'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1500, updated_at = now() where id = '54b13c1e-b837-404f-9bd8-ea579d266af1'::uuid;

-- 46-4: 20 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'd78c6f22-6ea8-4068-86d8-19e232c5a077'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'd78c6f22-6ea8-4068-86d8-19e232c5a077'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'd78c6f22-6ea8-4068-86d8-19e232c5a077'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 2000, updated_at = now() where id = 'd78c6f22-6ea8-4068-86d8-19e232c5a077'::uuid;

-- 46-6: 18 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e327fa13-87b7-410a-b4e6-59cc187a934d'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e327fa13-87b7-410a-b4e6-59cc187a934d'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e327fa13-87b7-410a-b4e6-59cc187a934d'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1800, updated_at = now() where id = 'e327fa13-87b7-410a-b4e6-59cc187a934d'::uuid;

-- 46-7: 5 CTN x 100 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'f7cf2cba-c802-4ca5-92eb-1906cfd39ee1'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'f7cf2cba-c802-4ca5-92eb-1906cfd39ee1'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 100,
  conversion_to_base = 100,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'f7cf2cba-c802-4ca5-92eb-1906cfd39ee1'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 500, updated_at = now() where id = 'f7cf2cba-c802-4ca5-92eb-1906cfd39ee1'::uuid;

-- 55-117: 40 CTN x 10 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '4b8553f3-4890-4319-9601-147a6a787b99'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '4b8553f3-4890-4319-9601-147a6a787b99'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '4b8553f3-4890-4319-9601-147a6a787b99'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 4800, updated_at = now() where id = '4b8553f3-4890-4319-9601-147a6a787b99'::uuid;

-- 55-118: 5 CTN x 10 pkg x 12 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '07e79dae-0b04-43c0-9574-015525d30198'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 12,
  conversion_to_base = 12,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '07e79dae-0b04-43c0-9574-015525d30198'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 120,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '07e79dae-0b04-43c0-9574-015525d30198'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 600, updated_at = now() where id = '07e79dae-0b04-43c0-9574-015525d30198'::uuid;

-- 55-119: 20 CTN x 10 pkg x 6 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'b3834dcf-50b8-4e03-938d-2a3961227160'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 6,
  conversion_to_base = 6,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'b3834dcf-50b8-4e03-938d-2a3961227160'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'b3834dcf-50b8-4e03-938d-2a3961227160'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = 'b3834dcf-50b8-4e03-938d-2a3961227160'::uuid;

-- 55-120: 20 CTN x 10 pkg x 6 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '3ca18dc0-01f6-49b0-9df7-67168c70f7d7'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 6,
  conversion_to_base = 6,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '3ca18dc0-01f6-49b0-9df7-67168c70f7d7'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 10,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '3ca18dc0-01f6-49b0-9df7-67168c70f7d7'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1200, updated_at = now() where id = '3ca18dc0-01f6-49b0-9df7-67168c70f7d7'::uuid;

-- 55-121: 3 CTN x 48 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c86b8d4d-7952-4e11-808c-0da3f79bc16b'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c86b8d4d-7952-4e11-808c-0da3f79bc16b'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 48,
  conversion_to_base = 48,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c86b8d4d-7952-4e11-808c-0da3f79bc16b'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 144, updated_at = now() where id = 'c86b8d4d-7952-4e11-808c-0da3f79bc16b'::uuid;

-- 55-123: 2 CTN x 72 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '823b3282-551b-43f7-b557-447967965f2c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '823b3282-551b-43f7-b557-447967965f2c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 72,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '823b3282-551b-43f7-b557-447967965f2c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 144, updated_at = now() where id = '823b3282-551b-43f7-b557-447967965f2c'::uuid;

-- 55-124: 3 CTN x 72 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '1084c9e1-2d12-4338-8813-53c49ddd1d33'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '1084c9e1-2d12-4338-8813-53c49ddd1d33'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 72,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '1084c9e1-2d12-4338-8813-53c49ddd1d33'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 216, updated_at = now() where id = '1084c9e1-2d12-4338-8813-53c49ddd1d33'::uuid;

-- 55-125: 3 CTN x 72 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '02480a11-4fcd-4dfb-87c3-5c1e9748a3b6'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '02480a11-4fcd-4dfb-87c3-5c1e9748a3b6'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 72,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '02480a11-4fcd-4dfb-87c3-5c1e9748a3b6'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 216, updated_at = now() where id = '02480a11-4fcd-4dfb-87c3-5c1e9748a3b6'::uuid;

-- 55-126: 2 CTN x 72 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'ed7557f0-b41d-4232-b418-054df92b515f'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'ed7557f0-b41d-4232-b418-054df92b515f'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 72,
  conversion_to_base = 72,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'ed7557f0-b41d-4232-b418-054df92b515f'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 144, updated_at = now() where id = 'ed7557f0-b41d-4232-b418-054df92b515f'::uuid;

-- 55-153-1: 15 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'c0558853-3ea4-4f25-a507-5d9e0d448b22'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'c0558853-3ea4-4f25-a507-5d9e0d448b22'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'c0558853-3ea4-4f25-a507-5d9e0d448b22'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 900, updated_at = now() where id = 'c0558853-3ea4-4f25-a507-5d9e0d448b22'::uuid;

-- 55-153-2: 25 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '100cbf5f-51a7-42b1-9e14-b30ccdda2bc4'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '100cbf5f-51a7-42b1-9e14-b30ccdda2bc4'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '100cbf5f-51a7-42b1-9e14-b30ccdda2bc4'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1500, updated_at = now() where id = '100cbf5f-51a7-42b1-9e14-b30ccdda2bc4'::uuid;

-- 55-154-1: 15 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '4349baa6-bedd-4013-b97b-19f9fdf4cca2'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '4349baa6-bedd-4013-b97b-19f9fdf4cca2'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '4349baa6-bedd-4013-b97b-19f9fdf4cca2'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 900, updated_at = now() where id = '4349baa6-bedd-4013-b97b-19f9fdf4cca2'::uuid;

-- 55-154-2: 25 CTN x 60 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '2b36a983-0151-4f0c-a2ed-a1604f57c061'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '2b36a983-0151-4f0c-a2ed-a1604f57c061'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 60,
  conversion_to_base = 60,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '2b36a983-0151-4f0c-a2ed-a1604f57c061'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 1500, updated_at = now() where id = '2b36a983-0151-4f0c-a2ed-a1604f57c061'::uuid;

-- GJS-1: 5 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '0f10ee1b-8ea3-43ef-a9d8-ebcf3370dec6'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '0f10ee1b-8ea3-43ef-a9d8-ebcf3370dec6'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '0f10ee1b-8ea3-43ef-a9d8-ebcf3370dec6'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 100, updated_at = now() where id = '0f10ee1b-8ea3-43ef-a9d8-ebcf3370dec6'::uuid;

-- GJS-2: 10 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '86bf36ba-d1e2-48ed-8471-bb46c635d678'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '86bf36ba-d1e2-48ed-8471-bb46c635d678'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '86bf36ba-d1e2-48ed-8471-bb46c635d678'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 200, updated_at = now() where id = '86bf36ba-d1e2-48ed-8471-bb46c635d678'::uuid;

-- GJS-3: 10 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '43713ab8-a39e-4b2f-9146-5e8e93ef7301'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '43713ab8-a39e-4b2f-9146-5e8e93ef7301'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '43713ab8-a39e-4b2f-9146-5e8e93ef7301'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 200, updated_at = now() where id = '43713ab8-a39e-4b2f-9146-5e8e93ef7301'::uuid;

-- GJS-4: 10 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '5221e38c-d024-4a9d-859e-36f113021a9a'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '5221e38c-d024-4a9d-859e-36f113021a9a'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '5221e38c-d024-4a9d-859e-36f113021a9a'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 200, updated_at = now() where id = '5221e38c-d024-4a9d-859e-36f113021a9a'::uuid;

-- GJS-5: 10 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '7a4dbfef-754b-49a2-94b7-5e65ade785ac'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '7a4dbfef-754b-49a2-94b7-5e65ade785ac'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '7a4dbfef-754b-49a2-94b7-5e65ade785ac'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 200, updated_at = now() where id = '7a4dbfef-754b-49a2-94b7-5e65ade785ac'::uuid;

-- GJS-6: 5 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '95c3ebb8-a50e-41c3-a5c8-cc8a72ea8b99'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '95c3ebb8-a50e-41c3-a5c8-cc8a72ea8b99'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '95c3ebb8-a50e-41c3-a5c8-cc8a72ea8b99'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 100, updated_at = now() where id = '95c3ebb8-a50e-41c3-a5c8-cc8a72ea8b99'::uuid;

-- GJS-7: 10 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '535576e3-a625-4db2-9eaa-f5f7de4822d8'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '535576e3-a625-4db2-9eaa-f5f7de4822d8'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '535576e3-a625-4db2-9eaa-f5f7de4822d8'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 200, updated_at = now() where id = '535576e3-a625-4db2-9eaa-f5f7de4822d8'::uuid;

-- GJS-8: 10 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '6ebb5022-b1a4-4a14-a779-b41cce336538'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '6ebb5022-b1a4-4a14-a779-b41cce336538'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '6ebb5022-b1a4-4a14-a779-b41cce336538'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 200, updated_at = now() where id = '6ebb5022-b1a4-4a14-a779-b41cce336538'::uuid;

-- GJS-9: 5 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'de6b9d35-bce9-4536-8eaa-4242fcfd17d8'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'de6b9d35-bce9-4536-8eaa-4242fcfd17d8'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'de6b9d35-bce9-4536-8eaa-4242fcfd17d8'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 100, updated_at = now() where id = 'de6b9d35-bce9-4536-8eaa-4242fcfd17d8'::uuid;

-- GJS-10: 5 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '7e3415c6-d8cc-4822-9264-ddb4ded4923b'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '7e3415c6-d8cc-4822-9264-ddb4ded4923b'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '7e3415c6-d8cc-4822-9264-ddb4ded4923b'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 100, updated_at = now() where id = '7e3415c6-d8cc-4822-9264-ddb4ded4923b'::uuid;

-- GJS-11: 5 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'efe32603-6260-416c-ae92-80093cb816b0'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'efe32603-6260-416c-ae92-80093cb816b0'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'efe32603-6260-416c-ae92-80093cb816b0'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 100, updated_at = now() where id = 'efe32603-6260-416c-ae92-80093cb816b0'::uuid;

-- GJS-12: 5 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '1457547e-95fa-4cd4-bc46-7104217b8dc3'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '1457547e-95fa-4cd4-bc46-7104217b8dc3'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '1457547e-95fa-4cd4-bc46-7104217b8dc3'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 100, updated_at = now() where id = '1457547e-95fa-4cd4-bc46-7104217b8dc3'::uuid;

-- GJS-13: 5 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '4e2a0bd9-a6a5-4eaa-8c17-5165ccde6f5c'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '4e2a0bd9-a6a5-4eaa-8c17-5165ccde6f5c'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '4e2a0bd9-a6a5-4eaa-8c17-5165ccde6f5c'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 100, updated_at = now() where id = '4e2a0bd9-a6a5-4eaa-8c17-5165ccde6f5c'::uuid;

-- GJS-14: 5 CTN x 20 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = 'e61219fa-7e06-495b-8b55-8a8add82fd40'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = 'e61219fa-7e06-495b-8b55-8a8add82fd40'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 20,
  conversion_to_base = 20,
  unit_name = 'Carton',
  updated_at = now()
where product_id = 'e61219fa-7e06-495b-8b55-8a8add82fd40'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 100, updated_at = now() where id = 'e61219fa-7e06-495b-8b55-8a8add82fd40'::uuid;

-- E6013: 100 CTN x 8 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '4d05e77e-d5a0-4534-ad8b-e482cb1941ef'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '4d05e77e-d5a0-4534-ad8b-e482cb1941ef'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 8,
  conversion_to_base = 8,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '4d05e77e-d5a0-4534-ad8b-e482cb1941ef'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 800, updated_at = now() where id = '4d05e77e-d5a0-4534-ad8b-e482cb1941ef'::uuid;

-- 3120: 6 CTN x 30 pkg x 1 pcs
update public.product_units set
  relative_quantity = null,
  conversion_to_base = 1,
  unit_name = 'Piece',
  updated_at = now()
where product_id = '0f983684-3025-4af5-8d93-8976151713bf'::uuid and unit_level = 0;
update public.product_units set
  relative_quantity = 1,
  conversion_to_base = 1,
  unit_name = 'Paquet',
  updated_at = now()
where product_id = '0f983684-3025-4af5-8d93-8976151713bf'::uuid and unit_level = 1;
update public.product_units set
  relative_quantity = 30,
  conversion_to_base = 30,
  unit_name = 'Carton',
  updated_at = now()
where product_id = '0f983684-3025-4af5-8d93-8976151713bf'::uuid and unit_level = 2;
update public.products set current_stock_pieces = 180, updated_at = now() where id = '0f983684-3025-4af5-8d93-8976151713bf'::uuid;

commit;

select
  'EYO PACKING OK' as status,
  count(*) filter (where unit_level=1 and relative_quantity > 0) as packages_with_pcs,
  count(*) filter (where unit_level=2 and relative_quantity > 0) as cartons_with_pkgs
from public.product_units u
where exists (select 1 from public.product_units x where x.product_id=u.product_id and x.serial_number like '%-PCE');