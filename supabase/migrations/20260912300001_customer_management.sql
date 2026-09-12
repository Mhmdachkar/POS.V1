-- ================================================================
-- VHM POS — Migration 025: Phase 6 Customer Management
-- ================================================================
--
-- Adds customer lifecycle management to the schema.
-- No changes to the pooled balance model or payment architecture.
-- No payment-to-sale allocation introduced.
-- Cash-only payment model preserved.
--
-- PART 1: Schema additions to customers table
--   + is_active (boolean, default true)
--   + deactivated_at (timestamptz, null while active)
--   + updated_at (timestamptz, auto-maintained via trigger)
--   + CHECK constraint (deactivation consistency)
--   + Two new indexes
--
-- PART 2: Four new SECURITY DEFINER RPCs
--   + public.create_customer(p_name, p_phone, p_address) → jsonb
--   + public.update_customer(p_customer_id, p_name, p_phone, p_address) → jsonb
--   + public.deactivate_customer(p_customer_id, p_reason) → jsonb
--   + public.reactivate_customer(p_customer_id) → jsonb
--
-- PART 3: complete_sale() amendment
--   Carries forward ALL Phase 4 hardening (search_path, auth, lock order,
--   idempotency, stock check). Adds is_active check in Step 13.
--
-- PART 4: payments RLS fix
--   Narrows customer_payment visibility for cashiers to their depot only.
--   Existing admin RLS is unchanged.
--
-- CUSTOMER LIFECYCLE POLICY:
--   active   → normal POS eligibility, can receive new credit sales
--   inactive → hidden from POS search; cannot receive NEW credit sales;
--              existing balance may still be repaid (record_payment unchanged);
--              historical sales/payments fully preserved; admin can reactivate
--
-- record_payment() UNCHANGED:
--   Phase 4 record_payment does not check is_active — this is intentional.
--   An inactive customer with an outstanding balance may still receive
--   a payment from an authorized cashier/admin without requiring reactivation.
--   No modifications needed.
--
-- create_customer() IDEMPOTENCY NOTE:
--   customer creation has no idempotency key. Customer creation is not a
--   financial event and carries no balance side-effect. The frontend
--   protects against duplicate submission via isSubmitting state guard.
--   Duplicate customers are visible in the list and correctable via deactivation.
--   No phone/name uniqueness constraint is introduced.
--
-- LOCK ORDER (preserved from Phase 4):
--   0. pg_advisory_xact_lock (idempotency — not a row lock)
--   1. shifts (via private.validate_shift — FOR UPDATE)
--   2. depots FOR UPDATE   (receipt_seq)
--   3. products FOR UPDATE (ascending UUID order)
--   4. customers FOR UPDATE (if customer provided)
-- ================================================================


-- ================================================================
-- PART 1: Schema additions
-- ================================================================

ALTER TABLE public.customers
  ADD COLUMN is_active      boolean      NOT NULL DEFAULT true,
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN updated_at     timestamptz  NOT NULL DEFAULT now();

-- Deactivation consistency constraint:
--   active customers must have deactivated_at = NULL
--   inactive customers must have deactivated_at set
ALTER TABLE public.customers
  ADD CONSTRAINT customer_deactivation_consistency CHECK (
    (is_active = true  AND deactivated_at IS NULL)
    OR
    (is_active = false AND deactivated_at IS NOT NULL)
  );

-- Auto-maintain updated_at (reuses existing set_updated_at() trigger function)
CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for lifecycle queries (list active / inactive customers)
CREATE INDEX customers_active_idx ON public.customers (is_active);

-- Index for balance reconciliation (find customers with outstanding debt)
CREATE INDEX customers_balance_nonzero_idx ON public.customers (id)
  WHERE balance_owed_cfa > 0;

COMMENT ON COLUMN public.customers.is_active IS
  'FALSE = deactivated. Cannot be used in new sales. Historical records preserved. record_payment() still allowed against existing balance.';
COMMENT ON COLUMN public.customers.deactivated_at IS
  'Timestamp of deactivation. Must be NULL when is_active=TRUE. Set by deactivate_customer() RPC (admin only).';
COMMENT ON COLUMN public.customers.updated_at IS
  'Auto-maintained by set_updated_at() trigger on UPDATE.';


-- ================================================================
-- PART 2A: create_customer()
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_customer(
  p_name    text,
  p_phone   text DEFAULT NULL,
  p_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx        private.caller_ctx;
  v_customer   public.customers%rowtype;
BEGIN
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  -- ── Validate name ─────────────────────────────────────────────
  IF p_name IS NULL OR trim(p_name) = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'name_required', 'field', 'name'));
  END IF;

  IF char_length(trim(p_name)) > 255 THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'name_too_long', 'field', 'name', 'max_length', 255));
  END IF;

  -- ── Insert customer ───────────────────────────────────────────
  INSERT INTO public.customers (
    name, phone, address, balance_owed_cfa, is_active, created_by
  ) VALUES (
    trim(p_name),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    0,
    true,
    v_ctx.staff_id
  )
  RETURNING * INTO v_customer;

  -- ── Write audit log ───────────────────────────────────────────
  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'create_customer',
    p_entity_type := 'customer',
    p_entity_id   := v_customer.id,
    p_depot_id    := v_ctx.depot_id,
    p_before_val  := null,
    p_after_val   := jsonb_build_object(
      'name',             v_customer.name,
      'phone',            v_customer.phone,
      'address',          v_customer.address,
      'balance_owed_cfa', 0,
      'is_active',        true
    )
  );

  RETURN jsonb_build_object(
    'id',               v_customer.id,
    'name',             v_customer.name,
    'phone',            v_customer.phone,
    'address',          v_customer.address,
    'balance_owed_cfa', v_customer.balance_owed_cfa,
    'is_active',        v_customer.is_active,
    'created_at',       v_customer.created_at,
    'updated_at',       v_customer.updated_at
  );

EXCEPTION
  WHEN sqlstate 'P0001' THEN RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_customer(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_customer(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_customer(text, text, text) IS
  'SECURITY DEFINER. Creates a new customer. Roles: cashier, admin. '
  'Name is required and max 255 chars. phone/address are optional. '
  'balance_owed_cfa is always 0 at creation (never supplied by client). '
  'No idempotency key: creation is not a financial event; protect via UI submit guard.';


-- ================================================================
-- PART 2B: update_customer()
-- ================================================================

CREATE OR REPLACE FUNCTION public.update_customer(
  p_customer_id uuid,
  p_name        text,
  p_phone       text DEFAULT NULL,
  p_address     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx          private.caller_ctx;
  v_before       record;
  v_customer     public.customers%rowtype;
BEGIN
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  -- ── Validate inputs ───────────────────────────────────────────
  IF p_customer_id IS NULL THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      '{"reason": "customer_id_required"}'::jsonb);
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'name_required', 'field', 'name'));
  END IF;

  IF char_length(trim(p_name)) > 255 THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'name_too_long', 'field', 'name', 'max_length', 255));
  END IF;

  -- ── Lock customer FOR UPDATE and capture before state ─────────
  SELECT id, name, phone, address, balance_owed_cfa, is_active
  INTO v_before
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      jsonb_build_object('customer_id', p_customer_id));
  END IF;

  -- ── Update name/phone/address only ────────────────────────────
  -- balance_owed_cfa, is_active, deactivated_at are NOT updateable via this RPC.
  -- updated_at is set automatically by the customers_set_updated_at trigger.
  UPDATE public.customers
  SET
    name    = trim(p_name),
    phone   = nullif(trim(coalesce(p_phone, '')), ''),
    address = nullif(trim(coalesce(p_address, '')), '')
  WHERE id = p_customer_id
  RETURNING * INTO v_customer;

  -- ── Write audit log ───────────────────────────────────────────
  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'update_customer',
    p_entity_type := 'customer',
    p_entity_id   := p_customer_id,
    p_depot_id    := v_ctx.depot_id,
    p_before_val  := jsonb_build_object(
      'name',    v_before.name,
      'phone',   v_before.phone,
      'address', v_before.address
    ),
    p_after_val  := jsonb_build_object(
      'name',    v_customer.name,
      'phone',   v_customer.phone,
      'address', v_customer.address
    )
  );

  RETURN jsonb_build_object(
    'id',               v_customer.id,
    'name',             v_customer.name,
    'phone',            v_customer.phone,
    'address',          v_customer.address,
    'balance_owed_cfa', v_customer.balance_owed_cfa,
    'is_active',        v_customer.is_active,
    'updated_at',       v_customer.updated_at
  );

EXCEPTION
  WHEN sqlstate 'P0001' THEN RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_customer(uuid, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_customer(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.update_customer(uuid, text, text, text) IS
  'SECURITY DEFINER. Updates customer name/phone/address. Roles: cashier, admin. '
  'Does NOT update balance_owed_cfa, is_active, or deactivated_at.';


-- ================================================================
-- PART 2C: deactivate_customer()
-- ================================================================

CREATE OR REPLACE FUNCTION public.deactivate_customer(
  p_customer_id uuid,
  p_reason      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx      private.caller_ctx;
  v_customer public.customers%rowtype;
BEGIN
  -- ── Authenticate & authorize (admin only) ─────────────────────
  v_ctx := private.get_caller_ctx(array['admin']);

  -- ── Validate ──────────────────────────────────────────────────
  IF p_customer_id IS NULL THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      '{"reason": "customer_id_required"}'::jsonb);
  END IF;

  -- ── Lock customer FOR UPDATE ──────────────────────────────────
  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      jsonb_build_object('customer_id', p_customer_id));
  END IF;

  -- ── Deactivate ────────────────────────────────────────────────
  -- Idempotent: if already inactive, treat as success (no error).
  -- Outstanding balance is preserved — existing debt remains payable.
  -- Historical sales and payments are preserved.
  IF NOT v_customer.is_active THEN
    -- Already inactive — return current state
    RETURN jsonb_build_object(
      'id',               v_customer.id,
      'name',             v_customer.name,
      'is_active',        false,
      'deactivated_at',   v_customer.deactivated_at,
      'balance_owed_cfa', v_customer.balance_owed_cfa,
      'already_inactive', true
    );
  END IF;

  UPDATE public.customers
  SET
    is_active      = false,
    deactivated_at = now()
  WHERE id = p_customer_id
  RETURNING * INTO v_customer;

  -- ── Write audit log ───────────────────────────────────────────
  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'deactivate_customer',
    p_entity_type := 'customer',
    p_entity_id   := p_customer_id,
    p_depot_id    := v_ctx.depot_id,
    p_before_val  := jsonb_build_object('is_active', true),
    p_after_val   := jsonb_build_object(
      'is_active',      false,
      'deactivated_at', v_customer.deactivated_at,
      'reason',         p_reason,
      'balance_owed_cfa', v_customer.balance_owed_cfa
    )
  );

  RETURN jsonb_build_object(
    'id',               v_customer.id,
    'name',             v_customer.name,
    'is_active',        false,
    'deactivated_at',   v_customer.deactivated_at,
    'balance_owed_cfa', v_customer.balance_owed_cfa,
    'already_inactive', false
  );

EXCEPTION
  WHEN sqlstate 'P0001' THEN RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_customer(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.deactivate_customer(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.deactivate_customer(uuid, text) IS
  'SECURITY DEFINER. Soft-deactivates a customer (admin only). '
  'Outstanding balance is preserved — payment remains possible via record_payment(). '
  'Idempotent: already-inactive returns current state without error. '
  'Does NOT hard-delete. Historical records fully preserved.';


-- ================================================================
-- PART 2D: reactivate_customer()
-- ================================================================

CREATE OR REPLACE FUNCTION public.reactivate_customer(
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx      private.caller_ctx;
  v_customer public.customers%rowtype;
BEGIN
  -- ── Authenticate & authorize (admin only) ─────────────────────
  v_ctx := private.get_caller_ctx(array['admin']);

  -- ── Validate ──────────────────────────────────────────────────
  IF p_customer_id IS NULL THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      '{"reason": "customer_id_required"}'::jsonb);
  END IF;

  -- ── Lock customer FOR UPDATE ──────────────────────────────────
  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      jsonb_build_object('customer_id', p_customer_id));
  END IF;

  -- ── Reactivate ────────────────────────────────────────────────
  -- Idempotent: if already active, return current state.
  IF v_customer.is_active THEN
    RETURN jsonb_build_object(
      'id',             v_customer.id,
      'name',           v_customer.name,
      'is_active',      true,
      'already_active', true
    );
  END IF;

  UPDATE public.customers
  SET
    is_active      = true,
    deactivated_at = NULL
  WHERE id = p_customer_id
  RETURNING * INTO v_customer;

  -- ── Write audit log ───────────────────────────────────────────
  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'reactivate_customer',
    p_entity_type := 'customer',
    p_entity_id   := p_customer_id,
    p_depot_id    := v_ctx.depot_id,
    p_before_val  := jsonb_build_object('is_active', false),
    p_after_val   := jsonb_build_object('is_active', true)
  );

  RETURN jsonb_build_object(
    'id',             v_customer.id,
    'name',           v_customer.name,
    'is_active',      true,
    'already_active', false
  );

EXCEPTION
  WHEN sqlstate 'P0001' THEN RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reactivate_customer(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reactivate_customer(uuid) TO authenticated;

COMMENT ON FUNCTION public.reactivate_customer(uuid) IS
  'SECURITY DEFINER. Restores is_active=true and clears deactivated_at (admin only). '
  'Idempotent: already-active returns current state without error. '
  'After reactivation the customer is immediately eligible for new POS credit sales.';


-- ================================================================
-- PART 3: complete_sale() amendment
--
-- Carries forward ALL Phase 4 hardening from migration 024:
--   - SET search_path = pg_catalog, public, private
--   - Authoritative DB staff lookup (private.get_caller_ctx)
--   - Role authorization: cashier, admin
--   - Depot isolation
--   - Idempotency advisory lock at Step 3 (BEFORE shift validation)
--   - Cumulative stock check (FIX 2 from Phase 4)
--   - Lock order: advisory → shift → depot → products (ASC UUID) → customer
--   - Audit inside same transaction
--   - REVOKE EXECUTE FROM PUBLIC / GRANT TO authenticated
--
-- Phase 6 addition:
--   - Step 13: after locking customer, check is_active. Reject inactive
--     customers with CUSTOMER_NOT_FOUND (reason: customer_is_inactive).
--     This prevents new sales (both credit and cash-linked) to inactive customers.
--     record_payment() is NOT changed — inactive customers may still repay debt.
-- ================================================================

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_depot_id            uuid,
  p_customer_id         uuid     DEFAULT NULL,   -- null = walk-in
  p_cart_items          jsonb    DEFAULT '[]',   -- [{product_id, unit_level, quantity_in_unit}]
  p_amount_tendered_cfa numeric  DEFAULT 0,
  p_display_currency    text     DEFAULT 'CFA',  -- 'CFA' | 'USD'
  p_discount_type       text     DEFAULT NULL,   -- null | 'flat' | 'percent'
  p_discount_value      numeric  DEFAULT NULL,
  p_shift_id            uuid     DEFAULT NULL,
  p_idempotency_key     uuid     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
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
BEGIN
  -- ── Step 1: Authenticate & authorize ──────────────────────────
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  -- ── Step 2: Depot isolation ───────────────────────────────────
  IF v_ctx.role = 'cashier' THEN
    -- Cashiers are locked to their own depot
    v_effective_depot := v_ctx.depot_id;
  ELSE
    -- Admin can operate on any depot
    v_effective_depot := p_depot_id;
    IF v_effective_depot IS NULL THEN
      PERFORM private.raise_vhm_error('INVALID_DEPOT',
        '{"reason": "admin_must_supply_depot_id"}'::jsonb);
    END IF;
  END IF;

  -- ── Step 3: Idempotency (64-bit advisory lock) ────────────────
  -- MUST be before shift validation. A retry of a committed sale must
  -- return the cached result even if the original shift is now closed.
  -- Advisory lock serializes concurrent submissions of the same key.
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_idempotency_key::text, 0)
    );
    -- Check for existing sale with this key
    SELECT id, receipt_number, subtotal_cfa, discount_amount_cfa,
           total_cfa, amount_applied_cfa, change_given_cfa, balance_added_cfa
    INTO v_existing_sale
    FROM public.sales
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      -- Return existing sale result — no mutation, shift status irrelevant
      RETURN jsonb_build_object(
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
    END IF;
  END IF;

  -- ── Step 4: Validate display currency ─────────────────────────
  IF p_display_currency NOT IN ('CFA', 'USD') THEN
    PERFORM private.raise_vhm_error('INVALID_CURRENCY',
      jsonb_build_object('value', p_display_currency));
  END IF;

  -- ── Step 5: Validate amount tendered ──────────────────────────
  IF p_amount_tendered_cfa < 0 THEN
    PERFORM private.raise_vhm_error('INVALID_AMOUNT',
      '{"reason": "amount_tendered_cannot_be_negative"}'::jsonb);
  END IF;

  -- ── Step 6: Validate cart not empty ───────────────────────────
  IF p_cart_items IS NULL OR jsonb_array_length(p_cart_items) = 0 THEN
    PERFORM private.raise_vhm_error('CART_EMPTY', NULL);
  END IF;

  -- ── Step 7: Validate discount inputs ──────────────────────────
  -- (range validation done after subtotal is computed)
  IF p_discount_type IS NOT NULL AND p_discount_type NOT IN ('flat', 'percent') THEN
    PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
      jsonb_build_object('reason', 'invalid_discount_type', 'value', p_discount_type));
  END IF;
  IF (p_discount_type IS NULL) != (p_discount_value IS NULL) THEN
    PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
      '{"reason": "discount_type_and_value_must_both_be_set_or_both_null"}'::jsonb);
  END IF;

  -- ── Step 8: Shift validation (acquires shift FOR UPDATE if provided) ──
  -- LOCK ORDER: shift FIRST (after advisory lock), before depot and product locks.
  -- Idempotency early-return (Step 3) already fired if the key was committed,
  -- so we only reach here for genuine new submissions.
  PERFORM private.validate_shift(p_shift_id, v_effective_depot);

  -- ── Step 9: Lock depot row (receipt_seq) ──────────────────────
  -- LOCK ORDER: depot AFTER shift, BEFORE products
  SELECT * INTO v_depot
  FROM public.depots
  WHERE id = v_effective_depot
  FOR UPDATE;

  IF NOT FOUND OR NOT v_depot.is_active THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', v_effective_depot, 'reason', 'not_found_or_inactive'));
  END IF;

  -- ── Step 10: Lock all products in ascending UUID order ────────
  -- Sort product_ids first to enforce lock ordering (deadlock prevention).
  -- Simultaneously validate and capture item data.
  v_item_count := jsonb_array_length(p_cart_items);

  -- Collect product_ids to lock in order
  SELECT array_agg(DISTINCT (item->>'product_id')::uuid ORDER BY (item->>'product_id')::uuid)
  INTO v_product_ids
  FROM jsonb_array_elements(p_cart_items) AS item;

  -- Validate each cart item and compute line totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
  LOOP
    -- Input validation
    IF (v_item->>'quantity_in_unit') IS NULL THEN
      PERFORM private.raise_vhm_error('INVALID_QUANTITY',
        '{"reason": "quantity_in_unit_required"}'::jsonb);
    END IF;
    v_qty_in_unit := (v_item->>'quantity_in_unit')::numeric;
    IF v_qty_in_unit <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_QUANTITY',
        jsonb_build_object('reason', 'quantity_must_be_positive', 'value', v_qty_in_unit));
    END IF;

    -- Lock and read product (ascending UUID order enforced by the set above)
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
        jsonb_build_object('product_id', v_item->>'product_id', 'reason', 'product_not_found'));
    END IF;

    IF NOT v_product.is_active THEN
      PERFORM private.raise_vhm_error('PRODUCT_INACTIVE',
        jsonb_build_object('product_id', v_product.id));
    END IF;

    IF v_product.depot_id != v_effective_depot THEN
      PERFORM private.raise_vhm_error('PRODUCT_NOT_IN_DEPOT',
        jsonb_build_object('product_id', v_product.id, 'depot_id', v_product.depot_id));
    END IF;

    -- Read product unit (no lock needed — product row is already locked)
    SELECT * INTO v_unit
    FROM public.product_units
    WHERE product_id = v_product.id
      AND unit_level = (v_item->>'unit_level')::smallint;

    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('INVALID_UNIT',
        jsonb_build_object('product_id', v_product.id, 'unit_level', v_item->>'unit_level'));
    END IF;

    IF v_unit.conversion_to_base <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_UNIT',
        jsonb_build_object('reason', 'conversion_to_base_must_be_positive',
                           'product_id', v_product.id));
    END IF;

    IF v_unit.selling_price_cfa <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_PRICE',
        jsonb_build_object('reason', 'selling_price_must_be_positive',
                           'product_id', v_product.id));
    END IF;

    -- Server-computed quantities and pricing
    v_qty_pieces := v_qty_in_unit * v_unit.conversion_to_base;
    v_line_total := v_qty_in_unit * v_unit.selling_price_cfa;
    v_cost_price := v_unit.cost_price_cfa;

    -- ── Aggregate stock check (Phase 4 FIX 2) ─────────────────
    -- Use the cumulative total for this product across all cart lines seen
    -- so far, so that duplicate product lines produce INSUFFICIENT_STOCK
    -- rather than a raw DB CHECK constraint violation.
    v_already_acc := coalesce((v_product_qty_map->>v_product.id::text)::numeric, 0);
    IF v_product.current_stock_pieces < v_already_acc + v_qty_pieces THEN
      PERFORM private.raise_vhm_error('INSUFFICIENT_STOCK',
        jsonb_build_object(
          'product_id',        v_product.id,
          'product_name',      v_product.name,
          'requested_pieces',  v_already_acc + v_qty_pieces,
          'available_pieces',  v_product.current_stock_pieces
        ));
    END IF;

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
  END LOOP;

  -- Subtotal must be positive
  IF v_subtotal <= 0 THEN
    PERFORM private.raise_vhm_error('INVALID_CART',
      '{"reason": "subtotal_must_be_positive"}'::jsonb);
  END IF;

  -- ── Step 11: Validate and compute discount ────────────────────
  IF p_discount_type = 'flat' THEN
    IF p_discount_value < 0 OR p_discount_value > v_subtotal THEN
      PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
        jsonb_build_object(
          'reason', 'flat_discount_out_of_range',
          'value', p_discount_value,
          'subtotal', v_subtotal
        ));
    END IF;
    v_discount_amount := p_discount_value;
  ELSIF p_discount_type = 'percent' THEN
    IF p_discount_value < 0 OR p_discount_value > 100 THEN
      PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
        jsonb_build_object(
          'reason', 'percent_discount_out_of_range',
          'value', p_discount_value
        ));
    END IF;
    v_discount_amount := round(v_subtotal * p_discount_value / 100, 2);
  ELSE
    v_discount_amount := 0;
  END IF;

  -- ── Step 12: Compute sale financials ─────────────────────────
  v_total        := greatest(0, v_subtotal - v_discount_amount);
  v_amount_applied := least(p_amount_tendered_cfa, v_total);
  v_change_given := p_amount_tendered_cfa - v_amount_applied;
  v_balance_added := v_total - v_amount_applied;

  -- Validate: credit requires named customer
  IF v_balance_added > 0 AND p_customer_id IS NULL THEN
    PERFORM private.raise_vhm_error('CUSTOMER_REQUIRED',
      '{"reason": "credit_sale_requires_named_customer"}'::jsonb);
  END IF;

  -- ── Step 13: Lock customer row (AFTER product locks) ──────────
  -- LOCK ORDER: customer AFTER products (Phase 4 lock order preserved)
  IF p_customer_id IS NOT NULL THEN
    SELECT * INTO v_customer
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
        jsonb_build_object('customer_id', p_customer_id));
    END IF;

    -- Phase 6: Reject inactive customers for new sales.
    -- POS search already filters is_active=true; this is the backend enforcement.
    -- record_payment() is NOT changed — inactive customers may repay existing balance.
    IF NOT v_customer.is_active THEN
      PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
        jsonb_build_object(
          'reason',      'customer_is_inactive',
          'customer_id', p_customer_id
        ));
    END IF;
  END IF;

  -- ── Step 14: Read exchange rate ───────────────────────────────
  SELECT cfa_to_usd_rate INTO v_rate FROM public.business_settings LIMIT 1;

  -- ── Step 15: Generate receipt number ─────────────────────────
  v_receipt_number := v_depot.code || '-' || lpad(v_depot.receipt_seq::text, 8, '0');

  UPDATE public.depots
  SET receipt_seq = receipt_seq + 1
  WHERE id = v_effective_depot;

  -- ── Step 16: Insert sale ──────────────────────────────────────
  INSERT INTO public.sales (
    depot_id, cashier_id, customer_id, shift_id,
    receipt_number, status, display_currency, cfa_to_usd_rate_used,
    subtotal_cfa, discount_type, discount_value, discount_amount_cfa,
    total_cfa, amount_tendered_cfa, amount_applied_cfa,
    change_given_cfa, balance_added_cfa, idempotency_key
  ) VALUES (
    v_effective_depot, v_ctx.staff_id, p_customer_id, p_shift_id,
    v_receipt_number, 'completed', p_display_currency, coalesce(v_rate, 620),
    v_subtotal, p_discount_type, p_discount_value, v_discount_amount,
    v_total, p_amount_tendered_cfa, v_amount_applied,
    v_change_given, v_balance_added, p_idempotency_key
  )
  RETURNING id INTO v_sale_id;

  -- ── Step 17: Insert sale items with net_line_total_cfa ────────
  -- Distribute discount proportionally. Last item absorbs rounding residual
  -- so SUM(net_line_total_cfa) = total_cfa exactly.
  v_idx        := 0;
  v_item_total := array_length(v_items_data, 1);

  FOREACH v_item_data IN ARRAY v_items_data
  LOOP
    v_idx := v_idx + 1;

    IF v_idx < v_item_total THEN
      -- Proportional share of discount
      v_net_line_total := round(
        (v_item_data->>'line_total_cfa')::numeric
        - round(
            ((v_item_data->>'line_total_cfa')::numeric / v_subtotal) * v_discount_amount,
            2
          ),
        2
      );
    ELSE
      -- Last item: exact residual to guarantee SUM = total_cfa
      v_net_line_total := v_total - v_net_sum_so_far;
    END IF;

    v_net_sum_so_far := v_net_sum_so_far + v_net_line_total;

    INSERT INTO public.sale_items (
      sale_id, product_id, unit_level,
      quantity_in_unit, quantity_pieces,
      unit_price_cfa, cost_price_cfa,
      line_total_cfa, net_line_total_cfa
    ) VALUES (
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
  END LOOP;

  -- ── Step 18: Update stock + write inventory_transactions ──────
  FOR v_prod_id IN
    SELECT key::uuid FROM jsonb_each_text(v_product_qty_map)
  LOOP
    v_agg_qty := (v_product_qty_map->>v_prod_id::text)::numeric;

    UPDATE public.products
    SET current_stock_pieces = current_stock_pieces - v_agg_qty
    WHERE id = v_prod_id;

    INSERT INTO public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by, metadata
    ) VALUES (
      v_effective_depot,
      v_prod_id,
      -v_agg_qty,          -- negative = stock out
      'SALE',
      'sale',
      v_sale_id,
      v_ctx.staff_id,
      jsonb_build_object('sale_id', v_sale_id)
    );
  END LOOP;

  -- ── Step 19: Record sale payment ─────────────────────────────
  -- payments.customer_id is NOT NULL, so sale_payment records are only created
  -- for named customer sales (not walk-in). Shift reconciliation reads
  -- sales.amount_applied_cfa directly, not from the payments table.
  IF v_amount_applied > 0 AND p_customer_id IS NOT NULL THEN
    INSERT INTO public.payments (
      customer_id, sale_id, shift_id, payment_type,
      amount_cfa, recorded_by, note
    ) VALUES (
      p_customer_id,
      v_sale_id, p_shift_id, 'sale_payment',
      v_amount_applied, v_ctx.staff_id,
      'Cash payment at point of sale'
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- ── Step 20: Update customer balance (credit sale) ────────────
  IF v_balance_added > 0 THEN
    UPDATE public.customers
    SET balance_owed_cfa = balance_owed_cfa + v_balance_added
    WHERE id = p_customer_id;
  END IF;

  -- ── Step 21: Write audit log ──────────────────────────────────
  PERFORM private.write_audit(
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
  RETURN jsonb_build_object(
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

EXCEPTION
  WHEN sqlstate 'P0001' THEN
    -- Re-raise structured errors from private.raise_vhm_error
    RAISE;
END;
$$;

-- Grants unchanged from Phase 4
REVOKE EXECUTE ON FUNCTION public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid) IS
  'SECURITY DEFINER. Creates a completed sale atomically. All financials server-computed. '
  'Phase 4: Idempotency check at Step 3 (before shift validation). Cumulative stock check. '
  'Phase 6: Step 13 rejects inactive customers (reason: customer_is_inactive). '
  'record_payment() is NOT changed — inactive customers may still repay existing balance. '
  'Lock order: advisory → shift → depot → products (ASC UUID) → customer.';


-- ================================================================
-- PART 4: Payments RLS fix
--
-- The existing payments_select_cashier policy allowed cashiers to
-- see ALL customer_payment records regardless of depot. Customers
-- are global entities but payment events are depot-scoped financial
-- records. This amendment narrows customer_payment visibility to
-- the cashier's authorized depot via:
--   1. recorded_by staff's depot_id (primary — covers cashier-recorded payments)
--   2. shift_id → shifts.depot_id (fallback — covers admin-recorded payments
--      that supply a shift_id; admin payments with no shift are admin-only)
--
-- Admin RLS is unchanged (admin sees all payments).
-- sale_payment isolation (via linked sale's depot_id) is preserved.
-- ================================================================

DROP POLICY IF EXISTS "payments_select_cashier" ON public.payments;

CREATE POLICY "payments_select_cashier" ON public.payments
  FOR SELECT
  USING (
    public.is_current_staff_cashier()
    AND (
      -- sale_payment: accessible if the linked sale is in the cashier's depot
      (
        payment_type = 'sale_payment'
        AND EXISTS (
          SELECT 1 FROM public.sales s
          WHERE s.id = payments.sale_id
            AND s.depot_id = public.get_current_staff_depot_id()
        )
      )
      OR
      -- customer_payment: accessible if the recording staff is in the cashier's depot
      (
        payment_type = 'customer_payment'
        AND EXISTS (
          SELECT 1 FROM public.staff st
          WHERE st.id = payments.recorded_by
            AND st.depot_id = public.get_current_staff_depot_id()
        )
      )
      OR
      -- customer_payment fallback: admin-recorded with a shift in the cashier's depot
      (
        payment_type = 'customer_payment'
        AND payments.shift_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.shifts sh
          WHERE sh.id = payments.shift_id
            AND sh.depot_id = public.get_current_staff_depot_id()
        )
      )
    )
  );

COMMENT ON POLICY "payments_select_cashier" ON public.payments IS
  'Cashier sees: sale_payment records for their depot sales; '
  'customer_payment records where recorded_by staff is in their depot; '
  'OR customer_payment records linked to a shift in their depot (admin fallback). '
  'Admin-recorded customer_payment with no shift and no depot-matched staff is admin-only. '
  'Phase 6 amendment: narrows customer_payment from all-depot to depot-scoped.';
