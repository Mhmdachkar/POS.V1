-- ================================================================
-- VHM POS — Migration 021: adjust_inventory() + restock_product()
-- ================================================================
--
-- Both functions:
--   - SECURITY DEFINER
--   - Caller: depot_staff or admin
--   - Write inventory_transactions row in same txn as stock update
--   - Use FOR UPDATE on product row
-- ================================================================

-- ─── adjust_inventory ───────────────────────────────────────────
-- Records a signed inventory adjustment (damage, loss, count correction, etc.)
-- quantity_pieces is SIGNED (negative = stock removal).
-- DB-level sign enforcement per type is in migration 003 (adjustment_sign_check).
--
-- LOCK ORDER:
--   product FOR UPDATE (single product, no ordering needed)

create or replace function public.adjust_inventory(
  p_product_id      uuid,
  p_adjustment_type text,       -- DAMAGE|LOSS|COUNT_CORRECTION|EXPIRY|OTHER
  p_quantity_pieces numeric,    -- signed
  p_reason          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx          private.caller_ctx;
  v_product      public.products%rowtype;
  v_adj_id       uuid;
  v_new_stock    numeric;
begin
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['depot_staff', 'admin']);

  -- ── Input validation ──────────────────────────────────────────
  if p_product_id is null then
    perform private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT', '{"reason":"product_id_required"}'::jsonb);
  end if;

  if p_quantity_pieces is null or p_quantity_pieces = 0 then
    perform private.raise_vhm_error('INVALID_QUANTITY',
      '{"reason":"quantity_pieces_cannot_be_zero"}'::jsonb);
  end if;

  if p_adjustment_type is null or p_adjustment_type not in
     ('DAMAGE', 'LOSS', 'COUNT_CORRECTION', 'EXPIRY', 'OTHER') then
    perform private.raise_vhm_error('INVALID_QUANTITY',
      jsonb_build_object('reason', 'invalid_adjustment_type', 'value', p_adjustment_type));
  end if;

  -- Enforce sign rules (mirrors DB constraint)
  if p_adjustment_type in ('DAMAGE', 'LOSS', 'EXPIRY') and p_quantity_pieces > 0 then
    perform private.raise_vhm_error('INVALID_QUANTITY',
      jsonb_build_object('reason', 'damage_loss_expiry_must_be_negative', 'type', p_adjustment_type));
  end if;

  if p_adjustment_type = 'OTHER' and p_reason is null then
    perform private.raise_vhm_error('INVALID_QUANTITY',
      '{"reason":"reason_required_for_OTHER_adjustment_type"}'::jsonb);
  end if;

  -- ── Lock and read product ─────────────────────────────────────
  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    perform private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
      jsonb_build_object('product_id', p_product_id, 'reason', 'not_found'));
  end if;

  if not v_product.is_active then
    perform private.raise_vhm_error('PRODUCT_INACTIVE',
      jsonb_build_object('product_id', p_product_id));
  end if;

  -- Depot isolation
  if v_ctx.role = 'depot_staff' and v_product.depot_id != v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('product_depot', v_product.depot_id, 'caller_depot', v_ctx.depot_id));
  end if;

  -- Would result in negative stock?
  if v_product.current_stock_pieces + p_quantity_pieces < 0 then
    perform private.raise_vhm_error('ADJUSTMENT_NEGATIVE_RESULT',
      jsonb_build_object(
        'product_id',      p_product_id,
        'current_stock',   v_product.current_stock_pieces,
        'adjustment',      p_quantity_pieces,
        'result_would_be', v_product.current_stock_pieces + p_quantity_pieces
      ));
  end if;

  -- ── Insert inventory_adjustments record ───────────────────────
  insert into public.inventory_adjustments (
    product_id, depot_id, adjustment_type,
    quantity_pieces, reason, created_by
  ) values (
    p_product_id, v_product.depot_id, p_adjustment_type,
    p_quantity_pieces, p_reason, v_ctx.staff_id
  )
  returning id into v_adj_id;

  -- ── Update stock ──────────────────────────────────────────────
  update public.products
  set current_stock_pieces = current_stock_pieces + p_quantity_pieces
  where id = p_product_id
  returning current_stock_pieces into v_new_stock;

  -- ── Write inventory_transactions (same txn as stock update) ───
  insert into public.inventory_transactions (
    depot_id, product_id, quantity_pieces,
    transaction_type, reference_type, reference_id,
    created_by, metadata
  ) values (
    v_product.depot_id, p_product_id, p_quantity_pieces,
    'ADJUSTMENT', 'inventory_adjustment', v_adj_id,
    v_ctx.staff_id,
    jsonb_build_object('type', p_adjustment_type, 'reason', p_reason)
  );

  -- ── Write audit log ───────────────────────────────────────────
  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'adjust_inventory',
    p_entity_type := 'inventory_adjustment',
    p_entity_id   := v_adj_id,
    p_depot_id    := v_product.depot_id,
    p_before_val  := jsonb_build_object('current_stock_pieces', v_product.current_stock_pieces),
    p_after_val   := jsonb_build_object(
      'adjustment_id',    v_adj_id,
      'adjustment_type',  p_adjustment_type,
      'quantity_pieces',  p_quantity_pieces,
      'new_stock_pieces', v_new_stock,
      'reason',           p_reason
    )
  );

  return jsonb_build_object(
    'adjustment_id',    v_adj_id,
    'product_id',       p_product_id,
    'adjustment_type',  p_adjustment_type,
    'quantity_pieces',  p_quantity_pieces,
    'new_stock_pieces', v_new_stock
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.adjust_inventory(uuid, text, numeric, text) from public;
grant execute on function public.adjust_inventory(uuid, text, numeric, text) to authenticated;

comment on function public.adjust_inventory(uuid, text, numeric, text) is
  'SECURITY DEFINER. Records signed inventory adjustment. Writes inventory_transactions + inventory_adjustments in same txn.';

-- ─── restock_product ────────────────────────────────────────────
-- Records a positive stock addition (restock) using a named unit.
-- Computes quantity_pieces = quantity_in_unit * conversion_to_base.
--
-- LOCK ORDER:
--   product FOR UPDATE (single product)

create or replace function public.restock_product(
  p_product_id       uuid,
  p_unit_level       smallint,
  p_quantity_in_unit numeric,
  p_note             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx          private.caller_ctx;
  v_product      public.products%rowtype;
  v_unit         public.product_units%rowtype;
  v_qty_pieces   numeric;
  v_entry_id     uuid;
  v_new_stock    numeric;
begin
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['depot_staff', 'admin']);

  -- ── Input validation ──────────────────────────────────────────
  if p_quantity_in_unit is null or p_quantity_in_unit <= 0 then
    perform private.raise_vhm_error('INVALID_QUANTITY',
      jsonb_build_object('reason', 'quantity_must_be_positive', 'value', p_quantity_in_unit));
  end if;

  -- ── Lock and read product ─────────────────────────────────────
  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    perform private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
      jsonb_build_object('product_id', p_product_id, 'reason', 'not_found'));
  end if;

  if not v_product.is_active then
    perform private.raise_vhm_error('PRODUCT_INACTIVE',
      jsonb_build_object('product_id', p_product_id));
  end if;

  -- Depot isolation
  if v_ctx.role = 'depot_staff' and v_product.depot_id != v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('product_depot', v_product.depot_id, 'caller_depot', v_ctx.depot_id));
  end if;

  -- ── Read product unit (product already locked) ────────────────
  select * into v_unit
  from public.product_units
  where product_id = p_product_id
    and unit_level = p_unit_level;

  if not found then
    perform private.raise_vhm_error('INVALID_UNIT',
      jsonb_build_object('product_id', p_product_id, 'unit_level', p_unit_level));
  end if;

  if v_unit.conversion_to_base <= 0 then
    perform private.raise_vhm_error('INVALID_UNIT',
      jsonb_build_object('reason', 'conversion_to_base_must_be_positive', 'product_id', p_product_id));
  end if;

  -- Server-compute quantity_pieces
  v_qty_pieces := p_quantity_in_unit * v_unit.conversion_to_base;

  -- ── Insert stock_entries record ───────────────────────────────
  insert into public.stock_entries (
    product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces,
    note, entered_by
  ) values (
    p_product_id, v_product.depot_id, p_unit_level,
    p_quantity_in_unit, v_qty_pieces,
    p_note, v_ctx.staff_id
  )
  returning id into v_entry_id;

  -- ── Update stock ──────────────────────────────────────────────
  update public.products
  set current_stock_pieces = current_stock_pieces + v_qty_pieces
  where id = p_product_id
  returning current_stock_pieces into v_new_stock;

  -- ── Write inventory_transactions (same txn as stock update) ───
  insert into public.inventory_transactions (
    depot_id, product_id, quantity_pieces,
    transaction_type, reference_type, reference_id,
    created_by, metadata
  ) values (
    v_product.depot_id, p_product_id, v_qty_pieces,
    'RESTOCK', 'stock_entry', v_entry_id,
    v_ctx.staff_id,
    jsonb_build_object(
      'unit_level',       p_unit_level,
      'quantity_in_unit', p_quantity_in_unit,
      'unit_name',        v_unit.unit_name
    )
  );

  -- ── Write audit log ───────────────────────────────────────────
  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'restock_product',
    p_entity_type := 'stock_entry',
    p_entity_id   := v_entry_id,
    p_depot_id    := v_product.depot_id,
    p_before_val  := jsonb_build_object('current_stock_pieces', v_product.current_stock_pieces),
    p_after_val   := jsonb_build_object(
      'entry_id',         v_entry_id,
      'quantity_in_unit', p_quantity_in_unit,
      'unit_level',       p_unit_level,
      'quantity_pieces',  v_qty_pieces,
      'new_stock_pieces', v_new_stock
    )
  );

  return jsonb_build_object(
    'entry_id',         v_entry_id,
    'product_id',       p_product_id,
    'quantity_in_unit', p_quantity_in_unit,
    'quantity_pieces',  v_qty_pieces,
    'new_stock_pieces', v_new_stock
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.restock_product(uuid, smallint, numeric, text) from public;
grant execute on function public.restock_product(uuid, smallint, numeric, text) to authenticated;

comment on function public.restock_product(uuid, smallint, numeric, text) is
  'SECURITY DEFINER. Records stock restock. Derives quantity_pieces server-side. Writes inventory_transactions + stock_entries in same txn.';
