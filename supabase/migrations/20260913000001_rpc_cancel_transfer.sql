-- ================================================================
-- VHM POS — Migration: cancel_transfer + draft hardening
-- ================================================================
--
-- Additive only. Does NOT edit 20260912200008_rpc_transfer.sql.
-- Does NOT replace complete_transfer.
--
-- 1. Cancellation metadata on stock_transfers
-- 2. Unique (transfer_id, from_product_id) defense
-- 3. CREATE OR REPLACE create_transfer_draft:
--      - reject duplicate from_product_id BEFORE header insert
--      - explicit source/dest product existence, depot, active
-- 4. cancel_transfer(p_transfer_id, p_reason) — pending only
-- ================================================================

-- ─── Cancellation columns ───────────────────────────────────────
alter table public.stock_transfers
  add column if not exists cancelled_at   timestamptz,
  add column if not exists cancelled_by   uuid references public.staff(id),
  add column if not exists cancel_reason  text;

alter table public.stock_transfers
  drop constraint if exists stock_transfers_cancel_metadata_chk;

alter table public.stock_transfers
  add constraint stock_transfers_cancel_metadata_chk check (
    (
      status <> 'cancelled'
      and cancelled_at is null
      and cancelled_by is null
      and cancel_reason is null
    )
    or (
      status = 'cancelled'
      and cancelled_at is not null
      and cancelled_by is not null
    )
  );

comment on column public.stock_transfers.cancelled_at is
  'Set only by cancel_transfer. Null until cancelled.';
comment on column public.stock_transfers.cancelled_by is
  'Staff who cancelled. References staff(id) (= auth.uid()).';
comment on column public.stock_transfers.cancel_reason is
  'Optional cancellation reason. Never stored in note.';

-- ─── One source product per transfer (defense) ──────────────────
create unique index if not exists stock_transfer_items_transfer_from_product_uidx
  on public.stock_transfer_items (transfer_id, from_product_id);

-- ─── create_transfer_draft (hardened; same signature) ───────────
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
  v_to_prod     public.products%rowtype;
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

  -- Reject duplicate source products before any insert
  if (
    select count(*) from jsonb_array_elements(p_items) e
  ) <> (
    select count(distinct e->>'from_product_id') from jsonb_array_elements(p_items) e
  ) then
    perform private.raise_vhm_error('DUPLICATE_TRANSFER_LINE',
      '{"reason":"from_product_id_must_be_unique_per_transfer"}'::jsonb);
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
  -- Trigger validate_transfer_item_depots remains a defense layer.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if (v_item->>'quantity_in_unit') is null or (v_item->>'quantity_in_unit')::numeric <= 0 then
      perform private.raise_vhm_error('INVALID_QUANTITY',
        '{"reason":"quantity_in_unit_must_be_positive"}'::jsonb);
    end if;

    -- Source product: existence + depot ownership + active
    select * into v_from_prod
    from public.products
    where id = (v_item->>'from_product_id')::uuid;

    if not found or v_from_prod.depot_id != p_from_depot_id then
      perform private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
        jsonb_build_object(
          'product_id',     v_item->>'from_product_id',
          'expected_depot', p_from_depot_id,
          'role',           'source'
        ));
    end if;

    if not v_from_prod.is_active then
      perform private.raise_vhm_error('PRODUCT_INACTIVE',
        jsonb_build_object('product_id', v_from_prod.id, 'role', 'source'));
    end if;

    -- Destination product: existence + depot ownership + active
    select * into v_to_prod
    from public.products
    where id = (v_item->>'to_product_id')::uuid;

    if not found or v_to_prod.depot_id != p_to_depot_id then
      perform private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
        jsonb_build_object(
          'product_id',     v_item->>'to_product_id',
          'expected_depot', p_to_depot_id,
          'role',           'destination'
        ));
    end if;

    if not v_to_prod.is_active then
      perform private.raise_vhm_error('PRODUCT_INACTIVE',
        jsonb_build_object('product_id', v_to_prod.id, 'role', 'destination'));
    end if;

    if v_from_prod.id = v_to_prod.id then
      perform private.raise_vhm_error('INVALID_INPUT',
        '{"reason":"from_product_id_equals_to_product_id"}'::jsonb);
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
  'SECURITY DEFINER. Creates a pending stock transfer. Stock not moved. Rejects duplicate from_product_id. Validates source and destination product existence, depot ownership, and active state. Trigger remains a defense layer.';

-- ─── cancel_transfer ────────────────────────────────────────────
create or replace function public.cancel_transfer(
  p_transfer_id  uuid,
  p_reason       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx       private.caller_ctx;
  v_transfer  public.stock_transfers%rowtype;
  v_reason    text;
  v_now       timestamptz := now();
begin
  v_ctx := private.get_caller_ctx(array['depot_staff', 'admin']);

  if p_transfer_id is null then
    perform private.raise_vhm_error('TRANSFER_NOT_FOUND',
      '{"reason":"transfer_id_required"}'::jsonb);
  end if;

  v_reason := nullif(btrim(p_reason), '');

  -- Lock transfer row
  select * into v_transfer
  from public.stock_transfers
  where id = p_transfer_id
  for update;

  if not found then
    perform private.raise_vhm_error('TRANSFER_NOT_FOUND',
      jsonb_build_object('transfer_id', p_transfer_id));
  end if;

  -- depot_staff may cancel only outgoing (from) transfers
  if v_ctx.role = 'depot_staff' and v_ctx.depot_id != v_transfer.from_depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object(
        'caller_depot', v_ctx.depot_id,
        'from_depot',   v_transfer.from_depot_id
      ));
  end if;

  if v_transfer.status = 'completed' then
    perform private.raise_vhm_error('TRANSFER_ALREADY_COMPLETED',
      jsonb_build_object('transfer_id', p_transfer_id));
  end if;

  if v_transfer.status = 'cancelled' then
    perform private.raise_vhm_error('TRANSFER_CANCELLED',
      jsonb_build_object('transfer_id', p_transfer_id));
  end if;

  update public.stock_transfers
  set
    status        = 'cancelled',
    cancelled_at  = v_now,
    cancelled_by  = v_ctx.staff_id,
    cancel_reason = v_reason
  where id = p_transfer_id;

  -- No products / stock_entries / inventory_transactions writes

  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'cancel_transfer',
    p_entity_type := 'stock_transfer',
    p_entity_id   := p_transfer_id,
    p_depot_id    := v_transfer.from_depot_id,
    p_before_val  := jsonb_build_object(
      'status',        'pending',
      'transfer_id',   p_transfer_id,
      'from_depot_id', v_transfer.from_depot_id,
      'to_depot_id',   v_transfer.to_depot_id
    ),
    p_after_val   := jsonb_build_object(
      'status',        'cancelled',
      'transfer_id',   p_transfer_id,
      'from_depot_id', v_transfer.from_depot_id,
      'to_depot_id',   v_transfer.to_depot_id,
      'cancelled_at',  v_now,
      'cancelled_by',  v_ctx.staff_id,
      'cancel_reason', v_reason
    )
  );

  return jsonb_build_object(
    'transfer_id',   p_transfer_id,
    'status',        'cancelled',
    'cancelled_at',  v_now,
    'cancelled_by',  v_ctx.staff_id,
    'cancel_reason', v_reason
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.cancel_transfer(uuid, text) from public;
grant execute on function public.cancel_transfer(uuid, text) to authenticated;

comment on function public.cancel_transfer(uuid, text) is
  'SECURITY DEFINER. Cancels a pending transfer only. No stock or ledger writes. Writes audit_log. Admin any pending; depot_staff source depot only.';
