-- ================================================================
-- CEO Notes Phase — RPC: restock_product with Cost Snapshot
-- ================================================================
--
-- CHANGE: restock_product now snapshots cost at restock time.
--   stock_entries.unit_cost_price_cfa = cost per base PIECE at restock time
--   stock_entries.total_cost_cfa      = unit_cost × quantity_pieces
--
-- COST DERIVATION:
--   The unit's cost_price_cfa is cost per unit (e.g. Package).
--   unit_cost_per_piece = cost_price_cfa / conversion_to_base
--   total_cost = unit_cost_per_piece * quantity_pieces
--           OR = (cost_price_cfa / conversion_to_base) * (qty_in_unit * conversion_to_base)
--           OR = cost_price_cfa * qty_in_unit  ← simplest and equivalent
--
-- EXAMPLE:
--   Package: cost=240 CFA, conversion=12 pieces/package
--   Restock: 5 packages
--   unit_cost_price_cfa (per piece) = 240/12 = 20
--   total_cost_cfa = 5 × 240 = 1200  (or equivalently: 60 × 20 = 1200)
--
-- HISTORICAL SAFETY:
--   Existing stock_entries rows remain with NULL cost columns.
--   Only new restocks via this updated RPC will have cost snapshots.
-- ================================================================

CREATE OR REPLACE FUNCTION public.restock_product(
  p_product_id       uuid,
  p_unit_level       smallint,
  p_quantity_in_unit numeric,
  p_note             text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx                private.caller_ctx;
  v_product            public.products%rowtype;
  v_unit               public.product_units%rowtype;
  v_qty_pieces         numeric;
  v_entry_id           uuid;
  v_new_stock          numeric;
  v_unit_cost_per_piece numeric;
  v_total_cost         numeric;
BEGIN
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

  -- ── Cost snapshot calculation ─────────────────────────────────
  -- unit_cost_per_piece = cost_price_cfa / conversion_to_base
  -- total_cost = cost_price_cfa * quantity_in_unit (equivalent formula)
  if v_unit.cost_price_cfa > 0 then
    v_unit_cost_per_piece := round(v_unit.cost_price_cfa / v_unit.conversion_to_base, 6);
    v_total_cost          := round(v_unit.cost_price_cfa * p_quantity_in_unit, 2);
  else
    -- Cost is 0 or not set: snapshot as null to distinguish from "known zero cost"
    v_unit_cost_per_piece := null;
    v_total_cost          := null;
  end if;

  -- ── Insert stock_entries record with cost snapshot ────────────
  insert into public.stock_entries (
    product_id, depot_id, unit_level,
    quantity_in_unit, quantity_pieces,
    unit_cost_price_cfa, total_cost_cfa,
    note, entered_by
  ) values (
    p_product_id, v_product.depot_id, p_unit_level,
    p_quantity_in_unit, v_qty_pieces,
    v_unit_cost_per_piece, v_total_cost,
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
      'unit_level',          p_unit_level,
      'quantity_in_unit',    p_quantity_in_unit,
      'unit_cost_per_piece', v_unit_cost_per_piece,
      'total_cost_cfa',      v_total_cost
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
      'stock_entry_id',      v_entry_id,
      'unit_level',          p_unit_level,
      'quantity_in_unit',    p_quantity_in_unit,
      'quantity_pieces',     v_qty_pieces,
      'unit_cost_per_piece', v_unit_cost_per_piece,
      'total_cost_cfa',      v_total_cost,
      'new_stock_pieces',    v_new_stock
    )
  );

  return jsonb_build_object(
    'stock_entry_id',      v_entry_id,
    'product_id',          p_product_id,
    'unit_level',          p_unit_level,
    'quantity_in_unit',    p_quantity_in_unit,
    'quantity_pieces',     v_qty_pieces,
    'unit_cost_per_piece', v_unit_cost_per_piece,
    'total_cost_cfa',      v_total_cost,
    'new_stock_pieces',    v_new_stock
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.restock_product(uuid, smallint, numeric, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.restock_product(uuid, smallint, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.restock_product(uuid, smallint, numeric, text) IS
  'CEO Notes: snapshots unit_cost_price_cfa and total_cost_cfa into stock_entries at restock time. Existing rows remain NULL (cannot be backfilled accurately).';
