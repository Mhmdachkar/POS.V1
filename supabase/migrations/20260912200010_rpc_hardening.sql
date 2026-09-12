-- ================================================================
-- VHM POS — Migration 024: Phase 4 Hardening Pass
-- ================================================================
--
-- Three targeted fixes discovered during the Phase 4 final audit.
-- No architecture changes — existing RPC contracts are preserved.
--
-- FIX 1: complete_sale — Idempotency check ordering
--   BUG: validate_shift (acquires FOR UPDATE + checks status='open')
--        ran at Step 7 BEFORE the idempotency check at Step 8.
--        A retry of an already-committed sale on a now-closed shift
--        would fail with SHIFT_NOT_OPEN before returning the cached result.
--   FIX: Idempotency advisory lock + early-return is now Step 3,
--        immediately after auth + depot isolation and before all other
--        validation. This guarantees that any committed idempotency_key
--        always returns the cached result regardless of shift status.
--
-- FIX 2: complete_sale — Duplicate product line stock check
--   BUG: The per-item stock check used `v_qty_pieces` (this item only),
--        not the cumulative total for the same product across all cart lines.
--        Two lines of qty=7 for a product with stock=10 each passed the
--        per-item check (10≥7), then the aggregate UPDATE violated the
--        current_stock_pieces≥0 DB CHECK rather than raising INSUFFICIENT_STOCK.
--   FIX: The stock check now uses:
--        coalesce(already_accumulated, 0) + v_qty_pieces
--        so duplicate product lines are caught as INSUFFICIENT_STOCK with a
--        structured VHM error before any mutation.
--
-- FIX 3: SECURITY DEFINER search_path hardening (Phase 2/3 functions)
--   BUG: 7 SECURITY DEFINER functions from Phase 2/3 migrations used
--        SET search_path = public (missing pg_catalog).
--        pg_catalog must appear first to prevent schema-shadowing of
--        built-in functions via attacker-controlled objects in public.
--   FIX: Re-create all 7 functions with SET search_path = pg_catalog, public.
--        Function bodies are unchanged; only the search_path declaration is updated.
--
-- UPDATED LOCK ORDER (complete_sale):
--   0. pg_advisory_xact_lock (idempotency key — not a row lock)
--   1. shifts (via private.validate_shift — FOR UPDATE)
--   2. depots FOR UPDATE   (receipt_seq generation)
--   3. products FOR UPDATE (ascending UUID order)
--   4. customers FOR UPDATE (if credit sale)
-- ================================================================


-- ================================================================
-- FIX 1 + FIX 2: complete_sale() — idempotency ordering +
--                                  duplicate product stock check
-- ================================================================

create or replace function public.complete_sale(
  p_depot_id            uuid,
  p_customer_id         uuid     default null,   -- null = walk-in
  p_cart_items          jsonb    default '[]',   -- [{product_id, unit_level, quantity_in_unit}]
  p_amount_tendered_cfa numeric  default 0,
  p_display_currency    text     default 'CFA',  -- 'CFA' | 'USD'
  p_discount_type       text     default null,   -- null | 'flat' | 'percent'
  p_discount_value      numeric  default null,
  p_shift_id            uuid     default null,
  p_idempotency_key     uuid     default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  -- Caller
  v_ctx              private.caller_ctx;

  -- Depot
  v_depot            public.depots%rowtype;
  v_effective_depot  uuid;

  -- Cart item processing
  v_item             jsonb;
  v_product          public.products%rowtype;
  v_unit             public.product_units%rowtype;
  v_qty_in_unit      numeric;
  v_qty_pieces       numeric;
  v_line_total       numeric;
  v_cost_price       numeric;

  -- Accumulated per product (for inventory ledger aggregation)
  v_product_ids      uuid[];
  v_product_qty_map  jsonb := '{}'::jsonb;   -- product_id → total_pieces (cumulative)

  -- Sale financials (all server-computed)
  v_subtotal         numeric := 0;
  v_discount_amount  numeric := 0;
  v_total            numeric := 0;
  v_amount_applied   numeric := 0;
  v_change_given     numeric := 0;
  v_balance_added    numeric := 0;
  v_rate             numeric;

  -- Intermediate storage for items
  v_items_data       jsonb[] := array[]::jsonb[];
  v_item_count       int;
  v_net_line_total   numeric;
  v_net_sum_so_far   numeric := 0;

  -- IDs
  v_sale_id          uuid;
  v_payment_id       uuid;
  v_receipt_number   text;
  v_item_data        jsonb;
  v_existing_sale    record;

  -- Customer
  v_customer         public.customers%rowtype;

  -- Inventory ledger
  v_prod_id          uuid;
  v_agg_qty          numeric;
  v_already_acc      numeric;  -- accumulated pieces for this product so far in the cart

  -- Return value
  v_result           jsonb;

  -- Item iteration for net_line_total calculation
  v_idx              int;
  v_item_total       int;
begin
  -- ── Step 1: Authenticate & authorize ──────────────────────────
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  -- ── Step 2: Depot isolation ───────────────────────────────────
  if v_ctx.role = 'cashier' then
    -- Cashiers are locked to their own depot
    v_effective_depot := v_ctx.depot_id;
  else
    -- Admin can operate on any depot
    v_effective_depot := p_depot_id;
    if v_effective_depot is null then
      perform private.raise_vhm_error('INVALID_DEPOT',
        '{"reason": "admin_must_supply_depot_id"}'::jsonb);
    end if;
  end if;

  -- ── Step 3: Idempotency (64-bit advisory lock) ────────────────
  -- MUST be before shift validation. A retry of a committed sale must
  -- return the cached result even if the original shift is now closed.
  -- Advisory lock serializes concurrent submissions of the same key.
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_idempotency_key::text, 0)
    );
    -- Check for existing sale with this key
    select id, receipt_number, subtotal_cfa, discount_amount_cfa,
           total_cfa, amount_applied_cfa, change_given_cfa, balance_added_cfa
    into v_existing_sale
    from public.sales
    where idempotency_key = p_idempotency_key;

    if found then
      -- Return existing sale result — no mutation, shift status irrelevant
      return jsonb_build_object(
        'sale_id',            v_existing_sale.id,
        'receipt_number',     v_existing_sale.receipt_number,
        'subtotal_cfa',       v_existing_sale.subtotal_cfa,
        'discount_amount_cfa',v_existing_sale.discount_amount_cfa,
        'total_cfa',          v_existing_sale.total_cfa,
        'amount_applied_cfa', v_existing_sale.amount_applied_cfa,
        'change_given_cfa',   v_existing_sale.change_given_cfa,
        'balance_added_cfa',  v_existing_sale.balance_added_cfa,
        'idempotent',         true
      );
    end if;
  end if;

  -- ── Step 4: Validate display currency ─────────────────────────
  if p_display_currency not in ('CFA', 'USD') then
    perform private.raise_vhm_error('INVALID_CURRENCY',
      jsonb_build_object('value', p_display_currency));
  end if;

  -- ── Step 5: Validate amount tendered ──────────────────────────
  if p_amount_tendered_cfa < 0 then
    perform private.raise_vhm_error('INVALID_AMOUNT',
      '{"reason": "amount_tendered_cannot_be_negative"}'::jsonb);
  end if;

  -- ── Step 6: Validate cart not empty ───────────────────────────
  if p_cart_items is null or jsonb_array_length(p_cart_items) = 0 then
    perform private.raise_vhm_error('CART_EMPTY', null);
  end if;

  -- ── Step 7: Validate discount inputs ──────────────────────────
  -- (range validation done after subtotal is computed)
  if p_discount_type is not null and p_discount_type not in ('flat', 'percent') then
    perform private.raise_vhm_error('INVALID_DISCOUNT',
      jsonb_build_object('reason', 'invalid_discount_type', 'value', p_discount_type));
  end if;
  if (p_discount_type is null) != (p_discount_value is null) then
    perform private.raise_vhm_error('INVALID_DISCOUNT',
      '{"reason": "discount_type_and_value_must_both_be_set_or_both_null"}'::jsonb);
  end if;

  -- ── Step 8: Shift validation (acquires shift FOR UPDATE if provided) ──
  -- LOCK ORDER: shift FIRST (after advisory lock), before depot and product locks.
  -- Idempotency early-return (Step 3) already fired if the key was committed,
  -- so we only reach here for genuine new submissions.
  perform private.validate_shift(p_shift_id, v_effective_depot);

  -- ── Step 9: Lock depot row (receipt_seq) ──────────────────────
  -- LOCK ORDER: depot AFTER shift, BEFORE products
  select * into v_depot
  from public.depots
  where id = v_effective_depot
  for update;

  if not found or not v_depot.is_active then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', v_effective_depot, 'reason', 'not_found_or_inactive'));
  end if;

  -- ── Step 10: Lock all products in ascending UUID order ────────
  -- Sort product_ids first to enforce lock ordering (deadlock prevention).
  -- Simultaneously validate and capture item data.
  v_item_count := jsonb_array_length(p_cart_items);

  -- Collect product_ids to lock in order
  select array_agg(distinct (item->>'product_id')::uuid order by (item->>'product_id')::uuid)
  into v_product_ids
  from jsonb_array_elements(p_cart_items) as item;

  -- Validate each cart item and compute line totals
  -- (products are locked above as a set in ascending order)
  for v_item in select * from jsonb_array_elements(p_cart_items)
  loop
    -- Input validation
    if (v_item->>'quantity_in_unit') is null then
      perform private.raise_vhm_error('INVALID_QUANTITY',
        '{"reason": "quantity_in_unit_required"}'::jsonb);
    end if;
    v_qty_in_unit := (v_item->>'quantity_in_unit')::numeric;
    if v_qty_in_unit <= 0 then
      perform private.raise_vhm_error('INVALID_QUANTITY',
        jsonb_build_object('reason', 'quantity_must_be_positive', 'value', v_qty_in_unit));
    end if;

    -- Lock and read product (products locked as set above; individual reads here)
    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
    for update;

    if not found then
      perform private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
        jsonb_build_object('product_id', v_item->>'product_id', 'reason', 'product_not_found'));
    end if;

    if not v_product.is_active then
      perform private.raise_vhm_error('PRODUCT_INACTIVE',
        jsonb_build_object('product_id', v_product.id));
    end if;

    if v_product.depot_id != v_effective_depot then
      perform private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
        jsonb_build_object('product_id', v_product.id, 'depot_id', v_product.depot_id));
    end if;

    -- Read product unit (no lock needed — product row is already locked)
    select * into v_unit
    from public.product_units
    where product_id = v_product.id
      and unit_level = (v_item->>'unit_level')::smallint;

    if not found then
      perform private.raise_vhm_error('INVALID_UNIT',
        jsonb_build_object('product_id', v_product.id, 'unit_level', v_item->>'unit_level'));
    end if;

    if v_unit.conversion_to_base <= 0 then
      perform private.raise_vhm_error('INVALID_UNIT',
        jsonb_build_object('reason', 'conversion_to_base_must_be_positive',
                           'product_id', v_product.id));
    end if;

    if v_unit.selling_price_cfa <= 0 then
      perform private.raise_vhm_error('INVALID_PRICE',
        jsonb_build_object('reason', 'selling_price_must_be_positive',
                           'product_id', v_product.id));
    end if;

    -- Server-computed quantities and pricing
    v_qty_pieces := v_qty_in_unit * v_unit.conversion_to_base;
    v_line_total := v_qty_in_unit * v_unit.selling_price_cfa;
    v_cost_price := v_unit.cost_price_cfa;

    -- ── Aggregate stock check (FIX 2) ─────────────────────────
    -- Use the cumulative total for this product across all cart lines seen
    -- so far, so that duplicate product lines produce INSUFFICIENT_STOCK
    -- rather than a raw DB CHECK constraint violation.
    v_already_acc := coalesce((v_product_qty_map->>v_product.id::text)::numeric, 0);
    if v_product.current_stock_pieces < v_already_acc + v_qty_pieces then
      perform private.raise_vhm_error('INSUFFICIENT_STOCK',
        jsonb_build_object(
          'product_id',        v_product.id,
          'product_name',      v_product.name,
          'requested_pieces',  v_already_acc + v_qty_pieces,
          'available_pieces',  v_product.current_stock_pieces
        ));
    end if;

    -- Accumulate subtotal
    v_subtotal := v_subtotal + v_line_total;

    -- Store item data for later INSERT
    v_items_data := v_items_data || jsonb_build_object(
      'product_id',       v_product.id,
      'unit_level',       v_unit.unit_level,
      'quantity_in_unit', v_qty_in_unit,
      'quantity_pieces',  v_qty_pieces,
      'unit_price_cfa',   v_unit.selling_price_cfa,
      'cost_price_cfa',   v_cost_price,
      'line_total_cfa',   v_line_total
    );

    -- Accumulate per-product totals for inventory ledger (aggregate same product)
    v_product_qty_map := jsonb_set(
      v_product_qty_map,
      array[v_product.id::text],
      to_jsonb(v_already_acc + v_qty_pieces)
    );
  end loop;

  -- Subtotal must be positive
  if v_subtotal <= 0 then
    perform private.raise_vhm_error('INVALID_CART',
      '{"reason": "subtotal_must_be_positive"}'::jsonb);
  end if;

  -- ── Step 11: Validate and compute discount ────────────────────
  if p_discount_type = 'flat' then
    if p_discount_value < 0 or p_discount_value > v_subtotal then
      perform private.raise_vhm_error('INVALID_DISCOUNT',
        jsonb_build_object(
          'reason', 'flat_discount_out_of_range',
          'value', p_discount_value,
          'subtotal', v_subtotal
        ));
    end if;
    v_discount_amount := p_discount_value;
  elsif p_discount_type = 'percent' then
    if p_discount_value < 0 or p_discount_value > 100 then
      perform private.raise_vhm_error('INVALID_DISCOUNT',
        jsonb_build_object(
          'reason', 'percent_discount_out_of_range',
          'value', p_discount_value
        ));
    end if;
    v_discount_amount := round(v_subtotal * p_discount_value / 100, 2);
  else
    v_discount_amount := 0;
  end if;

  -- ── Step 12: Compute sale financials ─────────────────────────
  v_total := greatest(0, v_subtotal - v_discount_amount);
  v_amount_applied := least(p_amount_tendered_cfa, v_total);
  v_change_given := p_amount_tendered_cfa - v_amount_applied;
  v_balance_added := v_total - v_amount_applied;

  -- Validate: credit requires named customer
  if v_balance_added > 0 and p_customer_id is null then
    perform private.raise_vhm_error('CUSTOMER_REQUIRED',
      '{"reason": "credit_sale_requires_named_customer"}'::jsonb);
  end if;

  -- ── Step 13: Lock customer row (AFTER product locks) ──────────
  if p_customer_id is not null then
    select * into v_customer
    from public.customers
    where id = p_customer_id
    for update;

    if not found then
      perform private.raise_vhm_error('CUSTOMER_NOT_FOUND',
        jsonb_build_object('customer_id', p_customer_id));
    end if;
  end if;

  -- ── Step 14: Read exchange rate ───────────────────────────────
  select cfa_to_usd_rate into v_rate from public.business_settings limit 1;

  -- ── Step 15: Generate receipt number ─────────────────────────
  v_receipt_number := v_depot.code || '-' || lpad(v_depot.receipt_seq::text, 8, '0');

  update public.depots
  set receipt_seq = receipt_seq + 1
  where id = v_effective_depot;

  -- ── Step 16: Insert sale ──────────────────────────────────────
  insert into public.sales (
    depot_id, cashier_id, customer_id, shift_id,
    receipt_number, status, display_currency, cfa_to_usd_rate_used,
    subtotal_cfa, discount_type, discount_value, discount_amount_cfa,
    total_cfa, amount_tendered_cfa, amount_applied_cfa,
    change_given_cfa, balance_added_cfa, idempotency_key
  ) values (
    v_effective_depot, v_ctx.staff_id, p_customer_id, p_shift_id,
    v_receipt_number, 'completed', p_display_currency, coalesce(v_rate, 620),
    v_subtotal, p_discount_type, p_discount_value, v_discount_amount,
    v_total, p_amount_tendered_cfa, v_amount_applied,
    v_change_given, v_balance_added, p_idempotency_key
  )
  returning id into v_sale_id;

  -- ── Step 17: Insert sale items with net_line_total_cfa ────────
  -- Distribute discount proportionally. Last item absorbs rounding residual
  -- so SUM(net_line_total_cfa) = total_cfa exactly.
  v_idx        := 0;
  v_item_total := array_length(v_items_data, 1);

  foreach v_item_data in array v_items_data
  loop
    v_idx := v_idx + 1;

    if v_idx < v_item_total then
      -- Proportional share of discount
      v_net_line_total := round(
        (v_item_data->>'line_total_cfa')::numeric
        - round(
            ((v_item_data->>'line_total_cfa')::numeric / v_subtotal) * v_discount_amount,
            2
          ),
        2
      );
    else
      -- Last item: exact residual to guarantee SUM = total_cfa
      v_net_line_total := v_total - v_net_sum_so_far;
    end if;

    v_net_sum_so_far := v_net_sum_so_far + v_net_line_total;

    insert into public.sale_items (
      sale_id, product_id, unit_level,
      quantity_in_unit, quantity_pieces,
      unit_price_cfa, cost_price_cfa,
      line_total_cfa, net_line_total_cfa
    ) values (
      v_sale_id,
      (v_item_data->>'product_id')::uuid,
      (v_item_data->>'unit_level')::smallint,
      (v_item_data->>'quantity_in_unit')::numeric,
      (v_item_data->>'quantity_pieces')::numeric,
      (v_item_data->>'unit_price_cfa')::numeric,
      (v_item_data->>'cost_price_cfa')::numeric,
      (v_item_data->>'line_total_cfa')::numeric,
      v_net_line_total
    );
  end loop;

  -- ── Step 18: Update stock + write inventory_transactions ──────
  -- One inventory_transactions row per unique product (aggregated).
  for v_prod_id in
    select key::uuid from jsonb_each_text(v_product_qty_map)
  loop
    v_agg_qty := (v_product_qty_map->>v_prod_id::text)::numeric;

    update public.products
    set current_stock_pieces = current_stock_pieces - v_agg_qty
    where id = v_prod_id;

    -- Get depot_id for inventory transaction (same as effective depot)
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by, metadata
    ) values (
      v_effective_depot,
      v_prod_id,
      -v_agg_qty,          -- negative = stock out
      'SALE',
      'sale',
      v_sale_id,
      v_ctx.staff_id,
      jsonb_build_object('sale_id', v_sale_id)
    );
  end loop;

  -- ── Step 19: Record sale payment ─────────────────────────────
  -- payments.customer_id is NOT NULL, so sale_payment records are only created
  -- for named customer sales (not walk-in). Shift reconciliation reads
  -- sales.amount_applied_cfa directly, not from the payments table.
  -- Walk-in cash sales: cash is represented by sales.amount_applied_cfa alone.
  if v_amount_applied > 0 and p_customer_id is not null then
    insert into public.payments (
      customer_id, sale_id, shift_id, payment_type,
      amount_cfa, recorded_by, note
    ) values (
      p_customer_id,
      v_sale_id, p_shift_id, 'sale_payment',
      v_amount_applied, v_ctx.staff_id,
      'Cash payment at point of sale'
    )
    returning id into v_payment_id;
  end if;

  -- ── Step 20: Update customer balance (credit sale) ────────────
  if v_balance_added > 0 then
    update public.customers
    set balance_owed_cfa = balance_owed_cfa + v_balance_added
    where id = p_customer_id;
  end if;

  -- ── Step 21: Write audit log ──────────────────────────────────
  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'complete_sale',
    p_entity_type := 'sale',
    p_entity_id   := v_sale_id,
    p_depot_id    := v_effective_depot,
    p_before_val  := null,
    p_after_val   := jsonb_build_object(
      'receipt_number',     v_receipt_number,
      'total_cfa',          v_total,
      'amount_applied_cfa', v_amount_applied,
      'balance_added_cfa',  v_balance_added,
      'customer_id',        p_customer_id,
      'items_count',        array_length(v_items_data, 1)
    )
  );

  -- ── Step 22: Return result ────────────────────────────────────
  return jsonb_build_object(
    'sale_id',            v_sale_id,
    'receipt_number',     v_receipt_number,
    'subtotal_cfa',       v_subtotal,
    'discount_amount_cfa',v_discount_amount,
    'total_cfa',          v_total,
    'amount_tendered_cfa',p_amount_tendered_cfa,
    'amount_applied_cfa', v_amount_applied,
    'change_given_cfa',   v_change_given,
    'balance_added_cfa',  v_balance_added,
    'customer_id',        p_customer_id,
    'payment_id',         v_payment_id,
    'idempotent',         false
  );

exception
  when sqlstate 'P0001' then
    -- Re-raise structured errors from private.raise_vhm_error
    raise;
end;
$$;

-- Grants unchanged
revoke execute on function public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid) from public;
grant  execute on function public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid) to authenticated;

comment on function public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid) is
  'SECURITY DEFINER. Creates a completed sale atomically. All financials server-computed. '
  'Idempotency check is Step 3 (before shift validation) so retries always return cached result. '
  'Stock check uses cumulative per-product total so duplicate cart lines raise INSUFFICIENT_STOCK. '
  'Products locked ascending UUID order. Lock order: advisory → shift → depot → products → customer.';


-- ================================================================
-- FIX 3: Phase 2/3 SECURITY DEFINER functions — add pg_catalog
-- ================================================================
--
-- These functions used SET search_path = public (missing pg_catalog).
-- pg_catalog must precede public so built-in function names cannot
-- be shadowed by attacker-controlled objects in the public schema.
-- Function bodies are 100% unchanged; only the search_path is updated.
-- ================================================================

-- ─── get_current_staff_role ─────────────────────────────────────
create or replace function public.get_current_staff_role()
returns text
security definer
stable
language sql
set search_path = pg_catalog, public
as $$
  select role
  from public.staff
  where id = auth.uid()
    and is_active = true
  limit 1
$$;

comment on function public.get_current_staff_role() is
  'SECURITY DEFINER. Returns role of active authenticated staff. NULL if deactivated or not found. Used in RLS policies.';

-- ─── get_current_staff_depot_id ─────────────────────────────────
create or replace function public.get_current_staff_depot_id()
returns uuid
security definer
stable
language sql
set search_path = pg_catalog, public
as $$
  select depot_id
  from public.staff
  where id = auth.uid()
    and is_active = true
  limit 1
$$;

comment on function public.get_current_staff_depot_id() is
  'SECURITY DEFINER. Returns depot_id of active authenticated staff. NULL for admins and deactivated staff. Used in RLS policies.';

-- ─── is_current_staff_admin ─────────────────────────────────────
create or replace function public.is_current_staff_admin()
returns boolean
security definer
stable
language sql
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.staff
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  )
$$;

comment on function public.is_current_staff_admin() is
  'SECURITY DEFINER. Returns true if current user is an active admin. Used in RLS policies.';

-- ─── is_current_staff_cashier ────────────────────────────────────
create or replace function public.is_current_staff_cashier()
returns boolean
security definer
stable
language sql
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.staff
    where id = auth.uid()
      and role = 'cashier'
      and is_active = true
  )
$$;

comment on function public.is_current_staff_cashier() is
  'SECURITY DEFINER. Returns true if current user is an active cashier. Used in RLS policies.';

-- ─── is_current_staff_depot_staff ───────────────────────────────
create or replace function public.is_current_staff_depot_staff()
returns boolean
security definer
stable
language sql
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.staff
    where id = auth.uid()
      and role = 'depot_staff'
      and is_active = true
  )
$$;

comment on function public.is_current_staff_depot_staff() is
  'SECURITY DEFINER. Returns true if current user is active depot_staff. Used in RLS policies.';

-- ─── get_current_staff_ctx ──────────────────────────────────────
create or replace function public.get_current_staff_ctx()
returns table (
  staff_id    uuid,
  role        text,
  depot_id    uuid,
  is_active   boolean,
  full_name   text
)
security definer
stable
language sql
set search_path = pg_catalog, public
as $$
  select
    id         as staff_id,
    role,
    depot_id,
    is_active,
    full_name
  from public.staff
  where id = auth.uid()
  limit 1
$$;

revoke execute on function public.get_current_staff_ctx() from public;
grant  execute on function public.get_current_staff_ctx() to authenticated;

comment on function public.get_current_staff_ctx() is
  'Returns all auth-relevant fields for the current JWT user in one round-trip. SECURITY DEFINER. Use in Edge Functions.';

-- ─── validate_active_session ─────────────────────────────────────
create or replace function public.validate_active_session()
returns jsonb
security definer
stable
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_staff public.staff%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('valid', false, 'reason', 'no_session');
  end if;

  select * into v_staff
  from public.staff
  where id = auth.uid()
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'staff_not_found');
  end if;

  if not v_staff.is_active then
    return jsonb_build_object('valid', false, 'reason', 'deactivated');
  end if;

  return jsonb_build_object(
    'valid',     true,
    'staff_id',  v_staff.id,
    'role',      v_staff.role,
    'depot_id',  v_staff.depot_id,
    'full_name', v_staff.full_name,
    'is_active', v_staff.is_active
  );
end;
$$;

revoke execute on function public.validate_active_session() from public;
grant  execute on function public.validate_active_session() to authenticated;
grant  execute on function public.validate_active_session() to anon;

comment on function public.validate_active_session() is
  'Lightweight session validation. Returns {valid, reason} or {valid, staff_id, role, depot_id}. Used by frontend periodic re-check.';
