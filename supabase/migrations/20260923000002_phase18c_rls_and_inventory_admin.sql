-- ================================================================
-- VHM POS — Phase 18C: depot_staff sales/customers read; inventory admin-only
-- ================================================================

create policy "customers_select_depot_staff"
  on public.customers for select
  using (public.is_current_staff_depot_staff());

create policy "sales_select_depot_staff"
  on public.sales for select
  using (
    public.is_current_staff_depot_staff()
    and depot_id = public.get_current_staff_depot_id()
  );

create policy "sale_items_select_depot_staff"
  on public.sale_items for select
  using (
    public.is_current_staff_depot_staff()
    and exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and s.depot_id = public.get_current_staff_depot_id()
    )
  );

create policy "sale_returns_select_depot_staff"
  on public.sale_returns for select
  using (
    public.is_current_staff_depot_staff()
    and depot_id = public.get_current_staff_depot_id()
  );

create policy "sale_return_items_select_depot_staff"
  on public.sale_return_items for select
  using (
    public.is_current_staff_depot_staff()
    and exists (
      select 1 from public.sale_returns sr
      where sr.id = sale_return_items.return_id
        and sr.depot_id = public.get_current_staff_depot_id()
    )
  );

-- Phase 18C: stock mutations admin-only (depot_staff read-only inventory)
create or replace function public.adjust_inventory(
  p_product_id      uuid,
  p_adjustment_type text,
  p_quantity_pieces numeric,
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
  v_ctx := private.get_caller_ctx(array['admin']);

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

  if p_adjustment_type in ('DAMAGE', 'LOSS', 'EXPIRY') and p_quantity_pieces > 0 then
    perform private.raise_vhm_error('INVALID_QUANTITY',
      jsonb_build_object('reason', 'damage_loss_expiry_must_be_negative', 'type', p_adjustment_type));
  end if;

  if p_adjustment_type = 'OTHER' and p_reason is null then
    perform private.raise_vhm_error('INVALID_QUANTITY',
      '{"reason":"reason_required_for_OTHER_adjustment_type"}'::jsonb);
  end if;

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

  if v_product.current_stock_pieces + p_quantity_pieces < 0 then
    perform private.raise_vhm_error('ADJUSTMENT_NEGATIVE_RESULT',
      jsonb_build_object(
        'product_id',      p_product_id,
        'current_stock',   v_product.current_stock_pieces,
        'adjustment',      p_quantity_pieces,
        'result_would_be', v_product.current_stock_pieces + p_quantity_pieces
      ));
  end if;

  insert into public.inventory_adjustments (
    product_id, depot_id, adjustment_type,
    quantity_pieces, reason, created_by
  ) values (
    p_product_id, v_product.depot_id, p_adjustment_type,
    p_quantity_pieces, p_reason, v_ctx.staff_id
  )
  returning id into v_adj_id;

  update public.products
  set current_stock_pieces = current_stock_pieces + p_quantity_pieces
  where id = p_product_id
  returning current_stock_pieces into v_new_stock;

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
  v_ctx := private.get_caller_ctx(array['admin']);

  if p_quantity_in_unit is null or p_quantity_in_unit <= 0 then
    perform private.raise_vhm_error('INVALID_QUANTITY',
      jsonb_build_object('reason', 'quantity_must_be_positive', 'value', p_quantity_in_unit));
  end if;

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

  v_qty_pieces := p_quantity_in_unit * v_unit.conversion_to_base;

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

  update public.products
  set current_stock_pieces = current_stock_pieces + v_qty_pieces
  where id = p_product_id
  returning current_stock_pieces into v_new_stock;

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

comment on function public.adjust_inventory(uuid, text, numeric, text) is
  'Phase 18C: admin-only. SECURITY DEFINER inventory adjustment.';

comment on function public.restock_product(uuid, smallint, numeric, text) is
  'Phase 18C: admin-only. SECURITY DEFINER stock restock.';
