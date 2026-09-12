-- ================================================================
-- VHM POS — Migration 022: create_transfer_draft() + complete_transfer()
-- ================================================================
--
-- create_transfer_draft:
--   Creates a pending stock transfer (header + items).
--   Stock is NOT moved. Trigger validates product-depot ownership.
--   Caller: depot_staff or admin.
--
-- complete_transfer:
--   Atomically moves stock from source to destination products.
--   Revalidates product-depot ownership at completion time (C7).
--   Writes inventory_transactions rows for TRANSFER_OUT and TRANSFER_IN.
--   Only completed transfers affect inventory_transactions.
--
-- LOCK ORDER for complete_transfer:
--   1. stock_transfers FOR UPDATE
--   2. products FOR UPDATE (all involved products, ascending UUID order)
--   (No shift or customer locks in this RPC)
-- ================================================================

-- ─── create_transfer_draft ──────────────────────────────────────
create or replace function public.create_transfer_draft(
  p_from_depot_id  uuid,
  p_to_depot_id    uuid,
  p_items          jsonb,   -- [{from_product_id, to_product_id, unit_level, quantity_in_unit}]
  p_note           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx         private.caller_ctx;
  v_from_depot  public.depots%rowtype;
  v_to_depot    public.depots%rowtype;
  v_transfer_id uuid;
  v_item        jsonb;
  v_from_prod   public.products%rowtype;
  v_unit        public.product_units%rowtype;
  v_qty_pieces  numeric;
begin
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['depot_staff', 'admin']);

  -- ── Input validation ──────────────────────────────────────────
  if p_from_depot_id is null or p_to_depot_id is null then
    perform private.raise_vhm_error('INVALID_DEPOT',
      '{"reason":"from_depot_id_and_to_depot_id_required"}'::jsonb);
  end if;
  if p_from_depot_id = p_to_depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      '{"reason":"cannot_transfer_to_same_depot"}'::jsonb);
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    perform private.raise_vhm_error('CART_EMPTY',
      '{"reason":"transfer_items_required"}'::jsonb);
  end if;

  -- Depot isolation: depot_staff must be in from_depot
  if v_ctx.role = 'depot_staff' and v_ctx.depot_id != p_from_depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('caller_depot', v_ctx.depot_id, 'from_depot', p_from_depot_id));
  end if;

  -- ── Validate depots ───────────────────────────────────────────
  select * into v_from_depot from public.depots where id = p_from_depot_id;
  if not found or not v_from_depot.is_active then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', p_from_depot_id, 'reason', 'not_found_or_inactive'));
  end if;

  select * into v_to_depot from public.depots where id = p_to_depot_id;
  if not found or not v_to_depot.is_active then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', p_to_depot_id, 'reason', 'not_found_or_inactive'));
  end if;

  -- ── Insert transfer header ────────────────────────────────────
  insert into public.stock_transfers (
    from_depot_id, to_depot_id, status, created_by, note
  ) values (
    p_from_depot_id, p_to_depot_id, 'pending', v_ctx.staff_id, p_note
  )
  returning id into v_transfer_id;

  -- ── Validate and insert transfer items ────────────────────────
  -- The trigger validate_transfer_item_depots (migration 013) checks
  -- product-depot ownership at INSERT time.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if (v_item->>'quantity_in_unit') is null or (v_item->>'quantity_in_unit')::numeric <= 0 then
      perform private.raise_vhm_error('INVALID_QUANTITY',
        '{"reason":"quantity_in_unit_must_be_positive"}'::jsonb);
    end if;

    -- Validate from_product
    select * into v_from_prod
    from public.products
    where id = (v_item->>'from_product_id')::uuid;

    if not found or not v_from_prod.is_active then
      perform private.raise_vhm_error('PRODUCT_INACTIVE',
        jsonb_build_object('product_id', v_item->>'from_product_id'));
    end if;

    -- Read unit (conversion to compute pieces for storage)
    select * into v_unit
    from public.product_units
    where product_id = v_from_prod.id
      and unit_level = (v_item->>'unit_level')::smallint;

    if not found or v_unit.conversion_to_base <= 0 then
      perform private.raise_vhm_error('INVALID_UNIT',
        jsonb_build_object('product_id', v_from_prod.id, 'unit_level', v_item->>'unit_level'));
    end if;

    v_qty_pieces := (v_item->>'quantity_in_unit')::numeric * v_unit.conversion_to_base;

    insert into public.stock_transfer_items (
      transfer_id, from_product_id, to_product_id,
      unit_level, quantity_in_unit, quantity_pieces
    ) values (
      v_transfer_id,
      (v_item->>'from_product_id')::uuid,
      (v_item->>'to_product_id')::uuid,
      (v_item->>'unit_level')::smallint,
      (v_item->>'quantity_in_unit')::numeric,
      v_qty_pieces
    );
    -- Trigger validates product-depot ownership on INSERT above
  end loop;

  -- ── Write audit log ───────────────────────────────────────────
  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'create_transfer_draft',
    p_entity_type := 'stock_transfer',
    p_entity_id   := v_transfer_id,
    p_depot_id    := p_from_depot_id,
    p_before_val  := null,
    p_after_val   := jsonb_build_object(
      'transfer_id',   v_transfer_id,
      'from_depot_id', p_from_depot_id,
      'to_depot_id',   p_to_depot_id,
      'items_count',   jsonb_array_length(p_items)
    )
  );

  return jsonb_build_object(
    'transfer_id',   v_transfer_id,
    'from_depot_id', p_from_depot_id,
    'to_depot_id',   p_to_depot_id,
    'status',        'pending'
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.create_transfer_draft(uuid, uuid, jsonb, text) from public;
grant execute on function public.create_transfer_draft(uuid, uuid, jsonb, text) to authenticated;

comment on function public.create_transfer_draft(uuid, uuid, jsonb, text) is
  'SECURITY DEFINER. Creates a pending stock transfer. Stock not moved until complete_transfer(). Trigger validates product-depot ownership.';

-- ─── complete_transfer ──────────────────────────────────────────
create or replace function public.complete_transfer(
  p_transfer_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx          private.caller_ctx;
  v_transfer     public.stock_transfers%rowtype;
  v_all_prod_ids uuid[];
  v_item         public.stock_transfer_items%rowtype;
  v_from_prod    public.products%rowtype;
  v_to_prod      public.products%rowtype;
  v_items_moved  int := 0;
begin
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['depot_staff', 'admin']);

  if p_transfer_id is null then
    perform private.raise_vhm_error('TRANSFER_NOT_FOUND', '{"reason":"transfer_id_required"}'::jsonb);
  end if;

  -- ── Lock transfer row (FIRST lock) ────────────────────────────
  select * into v_transfer
  from public.stock_transfers
  where id = p_transfer_id
  for update;

  if not found then
    perform private.raise_vhm_error('TRANSFER_NOT_FOUND',
      jsonb_build_object('transfer_id', p_transfer_id));
  end if;

  -- Depot isolation: depot_staff must be in from_depot
  if v_ctx.role = 'depot_staff' and v_ctx.depot_id != v_transfer.from_depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('caller_depot', v_ctx.depot_id, 'from_depot', v_transfer.from_depot_id));
  end if;

  -- Status check
  if v_transfer.status = 'completed' then
    perform private.raise_vhm_error('TRANSFER_ALREADY_COMPLETED',
      jsonb_build_object('transfer_id', p_transfer_id));
  end if;
  if v_transfer.status = 'cancelled' then
    perform private.raise_vhm_error('TRANSFER_CANCELLED',
      jsonb_build_object('transfer_id', p_transfer_id));
  end if;

  -- Verify depots still differ (should always be true due to check constraint)
  if v_transfer.from_depot_id = v_transfer.to_depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      '{"reason":"from_depot_equals_to_depot"}'::jsonb);
  end if;

  -- ── Collect all product IDs and lock in ascending UUID order ──
  -- SECOND lock set: all products across all transfer items
  select array_agg(distinct prod_id order by prod_id)
  into v_all_prod_ids
  from (
    select from_product_id as prod_id from public.stock_transfer_items where transfer_id = p_transfer_id
    union
    select to_product_id   as prod_id from public.stock_transfer_items where transfer_id = p_transfer_id
  ) ids;

  perform 1 from public.products
  where id = any(v_all_prod_ids)
  order by id
  for update;

  -- ── Revalidate and move stock per item (C7) ───────────────────
  for v_item in
    select * from public.stock_transfer_items
    where transfer_id = p_transfer_id
  loop
    -- Re-read products after lock (products are now locked)
    select * into v_from_prod from public.products where id = v_item.from_product_id;
    select * into v_to_prod   from public.products where id = v_item.to_product_id;

    -- Revalidate product-depot ownership at completion time (not only at creation)
    if v_from_prod.depot_id != v_transfer.from_depot_id then
      perform private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
        jsonb_build_object(
          'product_id',      v_item.from_product_id,
          'expected_depot',  v_transfer.from_depot_id,
          'actual_depot',    v_from_prod.depot_id
        ));
    end if;

    if v_to_prod.depot_id != v_transfer.to_depot_id then
      perform private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
        jsonb_build_object(
          'product_id',     v_item.to_product_id,
          'expected_depot', v_transfer.to_depot_id,
          'actual_depot',   v_to_prod.depot_id
        ));
    end if;

    if not v_from_prod.is_active then
      perform private.raise_vhm_error('PRODUCT_INACTIVE',
        jsonb_build_object('product_id', v_item.from_product_id, 'role', 'source'));
    end if;

    if not v_to_prod.is_active then
      perform private.raise_vhm_error('PRODUCT_INACTIVE',
        jsonb_build_object('product_id', v_item.to_product_id, 'role', 'destination'));
    end if;

    -- Stock check on source
    if v_from_prod.current_stock_pieces < v_item.quantity_pieces then
      perform private.raise_vhm_error('INSUFFICIENT_STOCK',
        jsonb_build_object(
          'product_id',       v_item.from_product_id,
          'requested_pieces', v_item.quantity_pieces,
          'available_pieces', v_from_prod.current_stock_pieces
        ));
    end if;

    -- Move stock
    update public.products
    set current_stock_pieces = current_stock_pieces - v_item.quantity_pieces
    where id = v_item.from_product_id;

    update public.products
    set current_stock_pieces = current_stock_pieces + v_item.quantity_pieces
    where id = v_item.to_product_id;

    -- Write inventory_transactions for TRANSFER_OUT (source)
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by
    ) values (
      v_transfer.from_depot_id, v_item.from_product_id, -v_item.quantity_pieces,
      'TRANSFER_OUT', 'stock_transfer', p_transfer_id,
      v_ctx.staff_id
    );

    -- Write inventory_transactions for TRANSFER_IN (destination)
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by
    ) values (
      v_transfer.to_depot_id, v_item.to_product_id, v_item.quantity_pieces,
      'TRANSFER_IN', 'stock_transfer', p_transfer_id,
      v_ctx.staff_id
    );

    v_items_moved := v_items_moved + 1;
  end loop;

  -- ── Mark transfer complete ────────────────────────────────────
  update public.stock_transfers
  set
    status       = 'completed',
    completed_at = now(),
    completed_by = v_ctx.staff_id
  where id = p_transfer_id;

  -- ── Write audit log ───────────────────────────────────────────
  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'complete_transfer',
    p_entity_type := 'stock_transfer',
    p_entity_id   := p_transfer_id,
    p_depot_id    := v_transfer.from_depot_id,
    p_before_val  := jsonb_build_object('status', 'pending'),
    p_after_val   := jsonb_build_object(
      'status',       'completed',
      'completed_at', now(),
      'completed_by', v_ctx.staff_id,
      'items_moved',  v_items_moved
    )
  );

  return jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status',      'completed',
    'items_moved', v_items_moved
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.complete_transfer(uuid) from public;
grant execute on function public.complete_transfer(uuid) to authenticated;

comment on function public.complete_transfer(uuid) is
  'SECURITY DEFINER. Atomically moves stock between depots. Revalidates product-depot ownership at completion. Writes TRANSFER_OUT + TRANSFER_IN to inventory_transactions.';
