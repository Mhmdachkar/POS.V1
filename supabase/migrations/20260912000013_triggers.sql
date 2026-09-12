-- ================================================================
-- VHM POS — Migration 013: Triggers
-- ================================================================
--
-- Two categories of triggers:
--
--   1. UPDATED_AT maintenance
--      Keep updated_at in sync on tables that have it.
--      Applied to: products, product_units, business_settings
--
--   2. Transfer item depot ownership validation
--      Ensures:
--        from_product_id.depot_id = transfer.from_depot_id
--        to_product_id.depot_id   = transfer.to_depot_id
--      CHECK constraints cannot reference other tables in standard
--      PostgreSQL, so a BEFORE INSERT OR UPDATE trigger enforces this.
--      This prevents accidental cross-depot product assignment in
--      transfer items.
-- ================================================================

-- ─── Helper: updated_at trigger function ────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generic trigger function that sets updated_at = now() on any update.';

-- ─── Apply updated_at trigger ───────────────────────────────────

create trigger products_set_updated_at
  before update on products
  for each row
  execute function public.set_updated_at();

create trigger product_units_set_updated_at
  before update on product_units
  for each row
  execute function public.set_updated_at();

create trigger business_settings_set_updated_at
  before update on business_settings
  for each row
  execute function public.set_updated_at();

-- ─── Transfer item depot ownership validation ────────────────────
--
-- ARCHITECTURE NOTE: Transfers never auto-create destination products.
-- The destination product must already exist in the destination depot.
-- This trigger is the DB-level enforcement of that constraint.
--
-- Also validates that source product belongs to from_depot and
-- destination product belongs to to_depot.
--
-- DEADLOCK PREVENTION (documented — NOT enforced in this trigger):
-- The complete_transfer RPC must always acquire FOR UPDATE locks on
-- all products in a transfer IN ASCENDING UUID ORDER to prevent
-- deadlock when two transfers involve overlapping product sets.
-- If transfer A locks product P1 then P2, and transfer B locks P2
-- then P1, a deadlock can occur. Ascending UUID order breaks cycles.

create or replace function public.validate_transfer_item_depots()
returns trigger
language plpgsql
as $$
declare
  v_from_depot_id     uuid;
  v_to_depot_id       uuid;
  v_from_product_depot uuid;
  v_to_product_depot  uuid;
  v_transfer_status   text;
begin
  -- Fetch the parent transfer's depots and status
  select from_depot_id, to_depot_id, status
  into v_from_depot_id, v_to_depot_id, v_transfer_status
  from public.stock_transfers
  where id = new.transfer_id;

  if not found then
    raise exception 'Transfer % not found', new.transfer_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Cannot add items to a completed or cancelled transfer
  if v_transfer_status <> 'pending' then
    raise exception 'Cannot modify items of a % transfer (id: %)',
      v_transfer_status, new.transfer_id
      using errcode = 'check_violation';
  end if;

  -- Fetch from_product depot
  select depot_id into v_from_product_depot
  from public.products
  where id = new.from_product_id;

  if not found then
    raise exception 'from_product_id % not found', new.from_product_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Fetch to_product depot
  select depot_id into v_to_product_depot
  from public.products
  where id = new.to_product_id;

  if not found then
    raise exception 'to_product_id % not found', new.to_product_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Validate from_product belongs to from_depot
  if v_from_product_depot <> v_from_depot_id then
    raise exception
      'from_product_id % belongs to depot %, not the transfer from_depot_id %',
      new.from_product_id, v_from_product_depot, v_from_depot_id
      using errcode = 'check_violation';
  end if;

  -- Validate to_product belongs to to_depot
  if v_to_product_depot <> v_to_depot_id then
    raise exception
      'to_product_id % belongs to depot %, not the transfer to_depot_id %',
      new.to_product_id, v_to_product_depot, v_to_depot_id
      using errcode = 'check_violation';
  end if;

  -- Validate to_product is active (cannot transfer to an inactive destination product)
  if not exists (
    select 1 from public.products where id = new.to_product_id and is_active = true
  ) then
    raise exception
      'Destination product % is inactive. Transfer destination must be an active product.',
      new.to_product_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger validate_transfer_item_depots_trigger
  before insert or update on stock_transfer_items
  for each row
  execute function public.validate_transfer_item_depots();

comment on function public.validate_transfer_item_depots() is
  'Ensures from_product belongs to from_depot and to_product belongs to to_depot. Prevents invalid cross-depot item assignment.';

-- ─── Void sale guard trigger ─────────────────────────────────────
-- Prevents a voided sale from being returned.
-- (Additional check — the void_sale RPC also validates, but the
-- trigger is a DB-level safety net.)

create or replace function public.prevent_return_of_voided_sale()
returns trigger
language plpgsql
as $$
declare
  v_sale_status text;
begin
  select status into v_sale_status
  from public.sales
  where id = new.sale_id;

  if v_sale_status = 'voided' then
    raise exception 'Cannot create a return for a voided sale (id: %)', new.sale_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger prevent_return_of_voided_sale_trigger
  before insert on sale_returns
  for each row
  execute function public.prevent_return_of_voided_sale();

comment on function public.prevent_return_of_voided_sale() is
  'DB-level guard: prevents returns on voided sales. The process_return RPC also validates this.';
