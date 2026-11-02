-- Sync customers.balance_owed_cfa from customer_ledger after money RPCs.
-- Caps payment collection and return credit reversal at displayed ledger
-- debt (greatest(0, running)), the same figure the UI shows.
-- Idempotent CREATE OR REPLACE. Does not write historical sales.

CREATE OR REPLACE FUNCTION private.customer_ledger_running_cfa(p_customer_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $$
  SELECT x.running_balance_cfa
  FROM (
    SELECT
      cl.running_balance_cfa,
      row_number() OVER () AS rn,
      count(*) OVER () AS n
    FROM public.customer_ledger(p_customer_id) cl
  ) x
  WHERE x.n > 0 AND x.rn = x.n;
$$;

CREATE OR REPLACE FUNCTION private.customer_payable_debt_cfa(p_customer_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $$
  SELECT greatest(
    0,
    round(
      COALESCE(
        private.customer_ledger_running_cfa(p_customer_id),
        (SELECT c.balance_owed_cfa FROM public.customers c WHERE c.id = p_customer_id),
        0
      ),
      2
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.sync_customer_balance_owed(p_customer_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_owed numeric;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_owed := private.customer_payable_debt_cfa(p_customer_id);
  UPDATE public.customers
  SET balance_owed_cfa = v_owed
  WHERE id = p_customer_id;
  RETURN v_owed;
END;
$$;

REVOKE ALL ON FUNCTION private.customer_ledger_running_cfa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.customer_payable_debt_cfa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_customer_balance_owed(uuid) FROM PUBLIC;

-- Displayed solde must use the last ledger row in function order, not
-- occurred_at/id DESC (same-timestamp sale+cash / return+cash_refund).
CREATE OR REPLACE FUNCTION public.customer_displayed_balance_cfa(p_customer_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_last numeric;
  v_owed numeric;
BEGIN
  -- Last row in customer_ledger function order (not occurred_at DESC).
  SELECT x.running_balance_cfa
  INTO v_last
  FROM (
    SELECT
      cl.running_balance_cfa,
      row_number() OVER () AS rn,
      count(*) OVER () AS n
    FROM public.customer_ledger(p_customer_id) cl
  ) x
  WHERE x.n > 0 AND x.rn = x.n;

  IF FOUND THEN
    RETURN COALESCE(v_last, 0);
  END IF;

  SELECT c.balance_owed_cfa INTO v_owed
  FROM public.customers c
  WHERE c.id = p_customer_id;

  RETURN COALESCE(v_owed, 0);
END;
$$;


CREATE OR REPLACE FUNCTION public.record_payment(
  p_customer_id uuid,
  p_amount_cfa numeric,
  p_shift_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx private.caller_ctx;
  v_customer public.customers%ROWTYPE;
  v_payment_id uuid;
  v_new_balance numeric;
  v_depot_id uuid;
  v_receipt_number text;
  v_payable numeric;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  IF p_customer_id IS NULL THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      '{"reason": "customer_id_required"}'::jsonb);
  END IF;

  IF p_amount_cfa IS NULL OR p_amount_cfa <= 0 THEN
    PERFORM private.raise_vhm_error('INVALID_AMOUNT',
      jsonb_build_object('reason', 'amount_must_be_positive', 'value', p_amount_cfa));
  END IF;

  PERFORM private.validate_shift(
    p_shift_id,
    COALESCE(
      v_ctx.depot_id,
      (SELECT depot_id FROM public.shifts WHERE id = p_shift_id)
    )
  );

  SELECT depot_id INTO v_depot_id FROM public.shifts WHERE id = p_shift_id;
  v_depot_id := COALESCE(v_depot_id, v_ctx.depot_id);
  IF v_depot_id IS NULL THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('reason', 'depot_required_for_payment_number'));
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
      jsonb_build_object('customer_id', p_customer_id));
  END IF;

  v_payable := private.customer_payable_debt_cfa(p_customer_id);
  IF p_amount_cfa > v_payable THEN
    PERFORM private.raise_vhm_error('PAYMENT_EXCEEDS_BALANCE',
      jsonb_build_object(
        'customer_id', p_customer_id,
        'amount_cfa', p_amount_cfa,
        'balance_owed_cfa', v_customer.balance_owed_cfa,
        'payable_cfa', v_payable
      ));
  END IF;

  v_receipt_number := private.allocate_customer_payment_number(v_depot_id);

  INSERT INTO public.payments (
    customer_id, sale_id, shift_id, payment_type,
    amount_cfa, recorded_by, note, receipt_number
  ) VALUES (
    p_customer_id, NULL, p_shift_id, 'customer_payment',
    p_amount_cfa, v_ctx.staff_id, p_note, v_receipt_number
  )
  RETURNING id INTO v_payment_id;

  v_new_balance := private.sync_customer_balance_owed(p_customer_id);

  PERFORM private.write_audit(
    p_actor_id := v_ctx.staff_id,
    p_action := 'record_payment',
    p_entity_type := 'payment',
    p_entity_id := v_payment_id,
    p_depot_id := v_ctx.depot_id,
    p_before_val := jsonb_build_object(
      'balance_owed_cfa', v_customer.balance_owed_cfa
    ),
    p_after_val := jsonb_build_object(
      'payment_id', v_payment_id,
      'amount_cfa', p_amount_cfa,
      'new_balance', v_new_balance,
      'customer_id', p_customer_id,
      'receipt_number', v_receipt_number
    )
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'customer_id', p_customer_id,
    'amount_cfa', p_amount_cfa,
    'new_balance_owed_cfa', v_new_balance,
    'receipt_number', v_receipt_number
  );
EXCEPTION
  WHEN sqlstate 'P0001' THEN RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_payment(uuid, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.record_payment(uuid, numeric, uuid, text) IS
  'Caps collection at displayed ledger debt. Syncs balance_owed_cfa from customer_ledger after insert.';


create or replace function public.process_return(
  p_sale_id         uuid,
  p_items           jsonb,          -- [{sale_item_id, quantity_in_unit, refund_amount_cfa?}] — NO quantity_pieces
  p_reason          text    default null,
  p_cash_refund_cfa numeric default 0,     -- proposed cash portion (server validates total)
  p_shift_id        uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx                    private.caller_ctx;
  v_sale                   public.sales%rowtype;
  v_customer               public.customers%rowtype;
  v_return_id              uuid;

  -- Per-item processing
  v_ri                     jsonb;
  v_sale_item              public.sale_items%rowtype;
  v_return_qty_in_unit     numeric;
  v_return_qty_pieces      numeric;
  v_already_returned_pieces numeric;
  v_returnable_pieces      numeric;
  v_already_returned_refund numeric;
  v_is_final_return        boolean;
  v_remaining_refundable   numeric;
  v_custom_refund          numeric;
  v_item_refund            numeric;
  v_total_refund           numeric := 0;
  v_payable                numeric;
  v_taken                  numeric;
  v_refund_pool            numeric;
  v_already_sale_refunded  numeric;
  v_line_basis             numeric;
  v_sale_remaining         numeric;

  -- Product locks
  v_product_ids            uuid[];
  v_item_data              jsonb[] := array[]::jsonb[];

  -- Balance calculation
  v_previous_balance_adj   numeric;
  v_remaining_credit       numeric;
  v_balance_adjustment     numeric;
  v_cash_refunded          numeric;
  v_ledger_payable         numeric;

  -- New sale status
  v_new_status             text;
  v_total_items_count      int;
  v_fully_returned_count   int;

  -- Return item count
  v_item_count             int;
  v_idata                  jsonb;
begin
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  -- ── Input validation ──────────────────────────────────────────
  if p_sale_id is null then
    perform private.raise_vhm_error('SALE_NOT_FOUND', '{"reason":"sale_id_required"}'::jsonb);
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    perform private.raise_vhm_error('CART_EMPTY', '{"reason":"return_items_required"}'::jsonb);
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) elem
    group by elem->>'sale_item_id'
    having count(*) > 1
  ) then
    perform private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'duplicate_sale_item_id'));
  end if;
  if p_cash_refund_cfa < 0 then
    perform private.raise_vhm_error('INVALID_AMOUNT',
      '{"reason":"cash_refund_cannot_be_negative"}'::jsonb);
  end if;

  -- ── Shift validation (acquires shift FOR UPDATE) ──────────────
  -- LOCK ORDER: shift FIRST
  perform private.validate_shift(p_shift_id,
    coalesce(v_ctx.depot_id,
      (select depot_id from public.shifts where id = p_shift_id)));

  -- ── Lock sale row ─────────────────────────────────────────────
  -- LOCK ORDER: sale SECOND (before products and customer)
  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    perform private.raise_vhm_error('SALE_NOT_FOUND',
      jsonb_build_object('sale_id', p_sale_id));
  end if;

  -- Depot isolation
  if v_ctx.role = 'cashier' and v_sale.depot_id != v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('sale_depot', v_sale.depot_id, 'caller_depot', v_ctx.depot_id));
  end if;

  -- Status checks
  if v_sale.status = 'voided' then
    perform private.raise_vhm_error('SALE_VOIDED',
      jsonb_build_object('sale_id', p_sale_id));
  end if;
  if v_sale.status = 'returned' then
    perform private.raise_vhm_error('SALE_FULLY_RETURNED',
      jsonb_build_object('sale_id', p_sale_id));
  end if;

  -- Payable total vs cash+credit actually taken. Cap refunds at the lesser.
  v_payable := coalesce(v_sale.admin_override_total_cfa, v_sale.total_cfa);
  v_taken := v_sale.amount_applied_cfa + v_sale.balance_added_cfa;
  v_refund_pool := least(greatest(v_payable, 0), greatest(v_taken, 0));

  select coalesce(sum(sri.refund_amount_cfa), 0)
  into v_already_sale_refunded
  from public.sale_return_items sri
  join public.sale_returns sr on sr.id = sri.return_id
  where sr.sale_id = p_sale_id;

  -- ── Collect product IDs for locking (ascending UUID order) ────
  -- LOCK ORDER: products THIRD (ascending UUID)
  select array_agg(distinct (si.product_id) order by si.product_id)
  into v_product_ids
  from public.sale_items si
  where si.id = any(
    select (elem->>'sale_item_id')::uuid from jsonb_array_elements(p_items) elem
  );

  -- Lock all products in ascending order
  perform 1 from public.products
  where id = any(v_product_ids)
  order by id
  for update;

  -- ── Validate and compute each return item ─────────────────────
  v_item_count := 0;
  for v_ri in select * from jsonb_array_elements(p_items)
  loop
    v_item_count := v_item_count + 1;
    v_return_qty_in_unit := (v_ri->>'quantity_in_unit')::numeric;

    if v_return_qty_in_unit is null or v_return_qty_in_unit <= 0 then
      perform private.raise_vhm_error('INVALID_QUANTITY',
        jsonb_build_object('reason', 'quantity_in_unit_must_be_positive'));
    end if;

    -- Fetch original sale item
    select * into v_sale_item
    from public.sale_items
    where id = (v_ri->>'sale_item_id')::uuid
      and sale_id = p_sale_id;

    if not found then
      perform private.raise_vhm_error('SALE_NOT_FOUND',
        jsonb_build_object('sale_item_id', v_ri->>'sale_item_id',
                           'reason', 'sale_item_not_found_in_sale'));
    end if;

    -- Server-derive return quantity in pieces from frozen sale conversion ratio
    v_return_qty_pieces := v_return_qty_in_unit
      * (v_sale_item.quantity_pieces / v_sale_item.quantity_in_unit);

    -- Check how many pieces of this item have already been returned
    select coalesce(sum(sri.quantity_pieces), 0)
    into v_already_returned_pieces
    from public.sale_return_items sri
    join public.sale_returns sr on sr.id = sri.return_id
    where sri.sale_item_id = v_sale_item.id
      and sr.sale_id = p_sale_id;

    v_returnable_pieces := v_sale_item.quantity_pieces - v_already_returned_pieces;

    if v_return_qty_pieces > v_returnable_pieces + 0.001 then   -- 0.001 tolerance for float
      perform private.raise_vhm_error('RETURN_QTY_EXCEEDED',
        jsonb_build_object(
          'sale_item_id',       v_sale_item.id,
          'requested_pieces',   v_return_qty_pieces,
          'returnable_pieces',  v_returnable_pieces
        ));
    end if;

    -- Check if this is the final return of this sale item
    -- (within tolerance for floating-point comparison)
    v_is_final_return := (v_return_qty_pieces >= v_returnable_pieces - 0.001);

    -- Line share of the payable/taken pool (B1). Residual against line_basis.
    select coalesce(sum(sri.refund_amount_cfa), 0)
    into v_already_returned_refund
    from public.sale_return_items sri
    join public.sale_returns sr on sr.id = sri.return_id
    where sri.sale_item_id = v_sale_item.id
      and sr.sale_id = p_sale_id;

    if v_sale.total_cfa > 0 then
      v_line_basis := round(
        (v_sale_item.net_line_total_cfa / v_sale.total_cfa) * v_refund_pool,
        2
      );
    elsif v_sale.subtotal_cfa > 0 then
      v_line_basis := round(
        (v_sale_item.line_total_cfa / v_sale.subtotal_cfa) * v_refund_pool,
        2
      );
    else
      v_line_basis := 0;
    end if;

    v_sale_remaining := greatest(v_refund_pool - v_already_sale_refunded - v_total_refund, 0);
    v_remaining_refundable := least(
      greatest(v_line_basis - v_already_returned_refund, 0),
      v_sale_remaining
    );

    -- Default amount for the selected qty (also the maximum custom refund).
    if v_is_final_return then
      v_item_refund := v_remaining_refundable;
    else
      v_item_refund := round(
        (v_return_qty_in_unit / v_sale_item.quantity_in_unit) * v_line_basis,
        2
      );
      v_item_refund := least(v_item_refund, v_remaining_refundable);
    end if;

    -- Optional client override: restore stock at full qty, refund a lower amount.
    if v_ri ? 'refund_amount_cfa'
       and (v_ri->>'refund_amount_cfa') is not null
       and btrim(v_ri->>'refund_amount_cfa') <> '' then
      begin
        v_custom_refund := round((v_ri->>'refund_amount_cfa')::numeric, 2);
      exception when invalid_text_representation then
        perform private.raise_vhm_error('INVALID_AMOUNT',
          jsonb_build_object(
            'reason', 'refund_amount_invalid',
            'sale_item_id', v_sale_item.id
          ));
      end;
      if v_custom_refund < 0 then
        perform private.raise_vhm_error('INVALID_AMOUNT',
          jsonb_build_object(
            'reason', 'refund_amount_cannot_be_negative',
            'sale_item_id', v_sale_item.id
          ));
      end if;
      if v_custom_refund > v_item_refund + 0.01 then
        perform private.raise_vhm_error('INVALID_AMOUNT',
          jsonb_build_object(
            'reason', 'refund_exceeds_line',
            'sale_item_id', v_sale_item.id,
            'proposed', v_custom_refund,
            'max_refund', v_item_refund
          ));
      end if;
      v_item_refund := least(greatest(v_custom_refund, 0), v_item_refund);
    end if;

    v_total_refund := v_total_refund + v_item_refund;

    if v_already_sale_refunded + v_total_refund > v_refund_pool + 0.01 then
      perform private.raise_vhm_error('INVALID_AMOUNT',
        jsonb_build_object(
          'reason', 'refund_exceeds_collected',
          'requested', v_already_sale_refunded + v_total_refund,
          'collected', v_refund_pool
        ));
    end if;

    -- Stash for INSERT phase
    v_item_data := v_item_data || jsonb_build_object(
      'sale_item_id',      v_sale_item.id,
      'product_id',        v_sale_item.product_id,
      'quantity_in_unit',  v_return_qty_in_unit,
      'quantity_pieces',   v_return_qty_pieces,
      'refund_amount_cfa', v_item_refund
    );
  end loop;

  -- ── Compute balance adjustment (pooled model, C1, multi-return safe) ──
  -- LOCK ORDER: customer FOURTH (after all product locks)
  if v_sale.customer_id is not null and v_sale.balance_added_cfa > 0 then
    select * into v_customer
    from public.customers
    where id = v_sale.customer_id
    for update;

    if not found then
      perform private.raise_vhm_error('CUSTOMER_NOT_FOUND',
        jsonb_build_object('customer_id', v_sale.customer_id));
    end if;

    -- Sum of balance already recovered across all previous returns on this sale
    select coalesce(sum(sr.balance_adjustment_cfa), 0)
    into v_previous_balance_adj
    from public.sale_returns sr
    where sr.sale_id = p_sale_id;

    -- Remaining credit that can still be reversed (cannot exceed sale's original credit)
    v_remaining_credit := greatest(v_sale.balance_added_cfa - v_previous_balance_adj, 0);

    -- POOLED BALANCE RULE: cap at displayed ledger debt (same as UI), not owed.
    --   1. the total refund amount
    --   2. the remaining reversible credit from this sale
    --   3. greatest(0, ledger running) so the server cannot reverse more than the UI shows
    v_ledger_payable := private.customer_payable_debt_cfa(v_customer.id);
    v_balance_adjustment := least(v_total_refund, v_remaining_credit, v_ledger_payable);
  else
    v_balance_adjustment := 0;
    v_customer := null;
  end if;

  v_cash_refunded := v_total_refund - v_balance_adjustment;

  -- Validate client-proposed cash refund matches server computation
  -- Allow a 1 CFA tolerance for display rounding
  if abs(p_cash_refund_cfa - v_cash_refunded) > 1 then
    perform private.raise_vhm_error('INVALID_AMOUNT',
      jsonb_build_object(
        'reason',            'cash_refund_does_not_match_computed',
        'proposed_cash',     p_cash_refund_cfa,
        'computed_cash',     v_cash_refunded,
        'total_refund',      v_total_refund,
        'balance_adjustment',v_balance_adjustment
      ));
  end if;

  -- Use server-computed cash amount (ignore client proposal if within tolerance)
  -- p_cash_refund_cfa is validated but v_cash_refunded is the authoritative value

  -- ── Insert sale_return header ─────────────────────────────────
  insert into public.sale_returns (
    sale_id, depot_id, shift_id, processed_by, reason,
    refund_amount_cfa, balance_adjustment_cfa, cash_refunded_cfa
  ) values (
    p_sale_id, v_sale.depot_id, p_shift_id, v_ctx.staff_id, p_reason,
    v_total_refund, v_balance_adjustment, v_cash_refunded
  )
  returning id into v_return_id;

  -- ── Insert sale_return_items + restore stock + write ledger ───
  foreach v_idata in array v_item_data
  loop
    insert into public.sale_return_items (
      return_id, sale_item_id,
      quantity_in_unit, quantity_pieces, refund_amount_cfa
    ) values (
      v_return_id,
      (v_idata->>'sale_item_id')::uuid,
      (v_idata->>'quantity_in_unit')::numeric,
      (v_idata->>'quantity_pieces')::numeric,
      (v_idata->>'refund_amount_cfa')::numeric
    );

    -- Restore stock
    update public.products
    set current_stock_pieces = current_stock_pieces + (v_idata->>'quantity_pieces')::numeric
    where id = (v_idata->>'product_id')::uuid;

    -- Inventory ledger — RETURN row (positive = stock in)
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by, metadata
    ) values (
      v_sale.depot_id,
      (v_idata->>'product_id')::uuid,
      (v_idata->>'quantity_pieces')::numeric,    -- positive = stock back
      'RETURN',
      'sale_return',
      v_return_id,
      v_ctx.staff_id,
      jsonb_build_object('sale_id', p_sale_id, 'reason', p_reason)
    );
  end loop;

  -- ── Sync owed from ledger (includes this return + cash_refund) ─
  if v_sale.customer_id is not null then
    perform private.sync_customer_balance_owed(v_sale.customer_id);
  end if;

  -- ── Determine new sale status ─────────────────────────────────
  -- Count total distinct sale items vs fully-returned sale items
  select count(*) into v_total_items_count
  from public.sale_items
  where sale_id = p_sale_id;

  select count(*) into v_fully_returned_count
  from public.sale_items si
  where si.sale_id = p_sale_id
    and si.quantity_pieces <= (
      select coalesce(sum(sri.quantity_pieces), 0)
      from public.sale_return_items sri
      join public.sale_returns sr on sr.id = sri.return_id
      where sri.sale_item_id = si.id
        and sr.sale_id = p_sale_id
    );

  v_new_status := case
    when v_fully_returned_count >= v_total_items_count then 'returned'
    else 'partially_returned'
  end;

  update public.sales set status = v_new_status where id = p_sale_id;

  -- ── Write audit log ───────────────────────────────────────────
  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'process_return',
    p_entity_type := 'sale_return',
    p_entity_id   := v_return_id,
    p_depot_id    := v_sale.depot_id,
    p_before_val  := jsonb_build_object(
      'sale_status',     v_sale.status,
      'customer_balance', case when v_customer.id is not null then v_customer.balance_owed_cfa else null end
    ),
    p_after_val   := jsonb_build_object(
      'return_id',           v_return_id,
      'new_sale_status',     v_new_status,
      'refund_amount_cfa',   v_total_refund,
      'balance_adjustment',  v_balance_adjustment,
      'cash_refunded_cfa',   v_cash_refunded,
      'items_returned',      v_item_count
    )
  );

  return jsonb_build_object(
    'return_id',              v_return_id,
    'sale_id',                p_sale_id,
    'new_sale_status',        v_new_status,
    'refund_amount_cfa',      v_total_refund,
    'balance_adjustment_cfa', v_balance_adjustment,
    'cash_refunded_cfa',      v_cash_refunded
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.process_return(uuid, jsonb, text, numeric, uuid) from public;
grant execute on function public.process_return(uuid, jsonb, text, numeric, uuid) to authenticated;

comment on function public.process_return(uuid, jsonb, text, numeric, uuid) is
  'SECURITY DEFINER. Return refunds are a line share of payable, capped at collected. Credit reversal caps at displayed ledger debt. Owed is synced from customer_ledger.';

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_depot_id              uuid,
  p_customer_id           uuid     DEFAULT NULL,
  p_cart_items            jsonb    DEFAULT '[]',
  p_amount_tendered_cfa   numeric  DEFAULT 0,
  p_display_currency      text     DEFAULT 'CFA',
  p_discount_type         text     DEFAULT NULL,
  p_discount_value        numeric  DEFAULT NULL,
  p_shift_id              uuid     DEFAULT NULL,
  p_idempotency_key       uuid     DEFAULT NULL,
  p_override_total_cfa    numeric  DEFAULT NULL,  -- admin-only
  p_price_exception_reason text    DEFAULT NULL,
  p_document_date         date     DEFAULT NULL,
  p_external_ref          text     DEFAULT NULL,
  p_proforma_id           uuid     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_ctx              private.caller_ctx;
  v_depot            public.depots%rowtype;
  v_effective_depot  uuid;
  v_item             jsonb;
  v_product          public.products%rowtype;
  v_unit             public.product_units%rowtype;
  v_qty_in_unit      numeric;
  v_qty_pieces       numeric;
  v_line_total       numeric;
  v_cost_price       numeric;
  v_unit_price       numeric;
  v_line_discount    numeric;
  v_document_date    date;
  v_external_ref     text;
  v_product_ids      uuid[];
  v_product_qty_map  jsonb := '{}'::jsonb;
  v_subtotal         numeric := 0;
  v_discount_amount  numeric := 0;
  v_total            numeric := 0;    -- calculated total (pre-override)
  v_final_total      numeric := 0;    -- authoritative total (post-override if any)
  v_amount_applied   numeric := 0;
  v_change_given     numeric := 0;
  v_balance_added    numeric := 0;
  v_rate             numeric;
  v_items_data       jsonb[] := array[]::jsonb[];
  v_item_count       int;
  v_net_line_total   numeric;
  v_net_sum_so_far   numeric := 0;
  v_sale_id          uuid;
  v_payment_id       uuid;
  v_receipt_number   text;
  v_item_data        jsonb;
  v_existing_sale    record;
  v_customer         public.customers%rowtype;
  v_prod_id          uuid;
  v_agg_qty          numeric;
  v_already_acc      numeric;
  v_result           jsonb;
  v_idx              int;
  v_item_total       int;
  v_price_reason     text;
BEGIN
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  -- ── Admin-only override guard ──────────────────────────────────
  IF p_override_total_cfa IS NOT NULL AND v_ctx.role != 'admin' THEN
    PERFORM private.raise_vhm_error('NOT_AUTHORIZED',
      jsonb_build_object('reason', 'total_override_requires_admin_role',
                         'role', v_ctx.role));
  END IF;

  -- ── Override must be >= 0 ──────────────────────────────────────
  IF p_override_total_cfa IS NOT NULL AND p_override_total_cfa < 0 THEN
    PERFORM private.raise_vhm_error('INVALID_AMOUNT',
      jsonb_build_object('reason', 'override_total_cannot_be_negative',
                         'value', p_override_total_cfa));
  END IF;

  IF v_ctx.role = 'cashier' THEN
    v_effective_depot := v_ctx.depot_id;
  ELSE
    v_effective_depot := p_depot_id;
    IF v_effective_depot IS NULL THEN
      PERFORM private.raise_vhm_error('INVALID_DEPOT',
        '{"reason": "admin_must_supply_depot_id"}'::jsonb);
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_idempotency_key::text, 0)
    );
    SELECT id, receipt_number, subtotal_cfa, discount_amount_cfa,
           total_cfa, amount_applied_cfa, change_given_cfa, balance_added_cfa,
           admin_override_total_cfa
    INTO v_existing_sale
    FROM public.sales
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'sale_id',                  v_existing_sale.id,
        'receipt_number',           v_existing_sale.receipt_number,
        'subtotal_cfa',             v_existing_sale.subtotal_cfa,
        'discount_amount_cfa',      v_existing_sale.discount_amount_cfa,
        'total_cfa',                v_existing_sale.total_cfa,
        'admin_override_total_cfa', v_existing_sale.admin_override_total_cfa,
        'amount_applied_cfa',       v_existing_sale.amount_applied_cfa,
        'change_given_cfa',         v_existing_sale.change_given_cfa,
        'balance_added_cfa',        v_existing_sale.balance_added_cfa,
        'idempotent',               true
      );
    END IF;
  END IF;

  IF p_display_currency NOT IN ('CFA', 'USD') THEN
    PERFORM private.raise_vhm_error('INVALID_CURRENCY',
      jsonb_build_object('value', p_display_currency));
  END IF;

  IF p_amount_tendered_cfa < 0 THEN
    PERFORM private.raise_vhm_error('INVALID_AMOUNT',
      '{"reason": "amount_tendered_cannot_be_negative"}'::jsonb);
  END IF;

  IF p_cart_items IS NULL OR jsonb_array_length(p_cart_items) = 0 THEN
    PERFORM private.raise_vhm_error('CART_EMPTY', NULL);
  END IF;

  IF p_discount_type IS NOT NULL AND p_discount_type NOT IN ('flat', 'percent') THEN
    PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
      jsonb_build_object('reason', 'invalid_discount_type', 'value', p_discount_type));
  END IF;
  IF (p_discount_type IS NULL) != (p_discount_value IS NULL) THEN
    PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
      '{"reason": "discount_type_and_value_must_both_be_set_or_both_null"}'::jsonb);
  END IF;

  PERFORM private.validate_shift(p_shift_id, v_effective_depot);

  SELECT * INTO v_depot
  FROM public.depots
  WHERE id = v_effective_depot
  FOR UPDATE;

  IF NOT FOUND OR NOT v_depot.is_active THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('depot_id', v_effective_depot, 'reason', 'not_found_or_inactive'));
  END IF;

  v_item_count := jsonb_array_length(p_cart_items);

  SELECT array_agg(DISTINCT (item->>'product_id')::uuid ORDER BY (item->>'product_id')::uuid)
  INTO v_product_ids
  FROM jsonb_array_elements(p_cart_items) AS item;

  IF v_product_ids IS NOT NULL THEN
    PERFORM 1
    FROM public.products
    WHERE id = ANY(v_product_ids)
    ORDER BY id
    FOR UPDATE;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
  LOOP
    IF (v_item->>'quantity_in_unit') IS NULL THEN
      PERFORM private.raise_vhm_error('INVALID_QUANTITY',
        '{"reason": "quantity_in_unit_required"}'::jsonb);
    END IF;
    v_qty_in_unit := (v_item->>'quantity_in_unit')::numeric;
    IF v_qty_in_unit <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_QUANTITY',
        jsonb_build_object('reason', 'quantity_must_be_positive', 'value', v_qty_in_unit));
    END IF;

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

    -- Charged unit price: catalog by default; admin may override per line.
    v_unit_price := v_unit.selling_price_cfa;
    v_line_discount := 0;

    IF (v_item ? 'unit_price_cfa') AND (v_item->>'unit_price_cfa') IS NOT NULL THEN
      IF v_ctx.role != 'admin' THEN
        PERFORM private.raise_vhm_error('NOT_AUTHORIZED',
          jsonb_build_object('reason', 'line_price_override_requires_admin'));
      END IF;
      v_unit_price := (v_item->>'unit_price_cfa')::numeric;
      IF v_unit_price < 0 THEN
        PERFORM private.raise_vhm_error('INVALID_PRICE',
          jsonb_build_object('reason', 'unit_price_must_be_non_negative',
                             'product_id', v_product.id, 'value', v_unit_price));
      END IF;
    ELSIF v_unit.selling_price_cfa <= 0 THEN
      PERFORM private.raise_vhm_error('INVALID_PRICE',
        jsonb_build_object('reason', 'selling_price_must_be_positive',
                           'product_id', v_product.id));
    END IF;

    IF (v_item ? 'line_discount_cfa') AND (v_item->>'line_discount_cfa') IS NOT NULL THEN
      IF v_ctx.role != 'admin' THEN
        PERFORM private.raise_vhm_error('NOT_AUTHORIZED',
          jsonb_build_object('reason', 'line_discount_requires_admin'));
      END IF;
      v_line_discount := coalesce((v_item->>'line_discount_cfa')::numeric, 0);
      IF v_line_discount < 0 THEN
        PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
          jsonb_build_object('reason', 'line_discount_must_be_non_negative',
                             'value', v_line_discount));
      END IF;
    END IF;

    IF v_unit_price <= 0 AND v_ctx.role != 'admin' THEN
      PERFORM private.raise_vhm_error('INVALID_PRICE',
        jsonb_build_object('reason', 'selling_price_must_be_positive',
                           'product_id', v_product.id));
    END IF;

    v_qty_pieces := v_qty_in_unit * v_unit.conversion_to_base;
    IF v_line_discount > round(v_qty_in_unit * v_unit_price, 2) THEN
      PERFORM private.raise_vhm_error('INVALID_DISCOUNT',
        jsonb_build_object('reason', 'line_discount_exceeds_line_gross',
                           'discount', v_line_discount,
                           'gross', round(v_qty_in_unit * v_unit_price, 2)));
    END IF;
    v_line_total := round(v_qty_in_unit * v_unit_price, 2) - v_line_discount;
    IF v_line_total < 0 THEN
      PERFORM private.raise_vhm_error('INVALID_AMOUNT',
        jsonb_build_object('reason', 'line_total_negative', 'product_id', v_product.id));
    END IF;
    v_cost_price := v_unit.cost_price_cfa;

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

    v_subtotal := v_subtotal + v_line_total;

    v_items_data := v_items_data || jsonb_build_object(
      'product_id',       v_product.id,
      'unit_level',       v_unit.unit_level,
      'quantity_in_unit', v_qty_in_unit,
      'quantity_pieces',  v_qty_pieces,
      'unit_price_cfa',     v_unit_price,
      'cost_price_cfa',     v_cost_price,
      'line_discount_cfa',  v_line_discount,
      'line_total_cfa',     v_line_total
    );

    v_product_qty_map := jsonb_set(
      v_product_qty_map,
      array[v_product.id::text],
      to_jsonb(v_already_acc + v_qty_pieces)
    );
  END LOOP;

  IF v_subtotal <= 0 THEN
    PERFORM private.raise_vhm_error('INVALID_CART',
      '{"reason": "subtotal_must_be_positive"}'::jsonb);
  END IF;

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

  -- Calculated total (pre-override)
  v_total := greatest(0, v_subtotal - v_discount_amount);

  v_price_reason := nullif(btrim(coalesce(p_price_exception_reason, '')), '');

  -- B3: override must be 1..calculated total, with a stored reason.
  IF p_override_total_cfa IS NOT NULL THEN
    IF p_override_total_cfa < 1 OR p_override_total_cfa > v_total THEN
      PERFORM private.raise_vhm_error('INVALID_AMOUNT',
        jsonb_build_object(
          'reason', 'override_total_out_of_range',
          'value', p_override_total_cfa,
          'calculated_total', v_total
        ));
    END IF;
    IF v_price_reason IS NULL THEN
      PERFORM private.raise_vhm_error('INVALID_INPUT',
        jsonb_build_object('reason', 'override_requires_reason'));
    END IF;
  ELSIF v_total = 0 THEN
    IF v_ctx.role != 'admin' THEN
      PERFORM private.raise_vhm_error('UNAUTHORIZED',
        jsonb_build_object('reason', 'zero_total_requires_admin'));
    END IF;
    IF v_price_reason IS NULL THEN
      PERFORM private.raise_vhm_error('INVALID_INPUT',
        jsonb_build_object('reason', 'zero_total_requires_reason'));
    END IF;
  ELSE
    v_price_reason := NULL;
  END IF;

  -- Authoritative final total (override if admin provided one)
  v_final_total := COALESCE(p_override_total_cfa, v_total);

  -- Cash arithmetic uses the final authoritative total
  v_amount_applied := least(p_amount_tendered_cfa, v_final_total);
  v_change_given   := p_amount_tendered_cfa - v_amount_applied;
  v_balance_added  := v_final_total - v_amount_applied;

  IF v_balance_added > 0 AND p_customer_id IS NULL THEN
    PERFORM private.raise_vhm_error('CUSTOMER_REQUIRED',
      '{"reason": "credit_sale_requires_named_customer"}'::jsonb);
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT * INTO v_customer
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
        jsonb_build_object('customer_id', p_customer_id));
    END IF;

    IF NOT v_customer.is_active THEN
      PERFORM private.raise_vhm_error('CUSTOMER_NOT_FOUND',
        jsonb_build_object(
          'reason',      'customer_is_inactive',
          'customer_id', p_customer_id
        ));
    END IF;
  END IF;

  -- document_date: print/header only; Abidjan calendar; not future; max 30 days back.
  v_document_date := coalesce(
    p_document_date,
    (timezone('Africa/Abidjan', now()))::date
  );
  IF p_document_date IS NOT NULL AND v_ctx.role != 'admin' THEN
    PERFORM private.raise_vhm_error('NOT_AUTHORIZED',
      jsonb_build_object('reason', 'document_date_requires_admin'));
  END IF;
  IF v_document_date > (timezone('Africa/Abidjan', now()))::date THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'document_date_in_future', 'value', v_document_date));
  END IF;
  IF v_document_date < (timezone('Africa/Abidjan', now()))::date - 30 THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'document_date_too_old', 'value', v_document_date));
  END IF;

  v_external_ref := nullif(btrim(coalesce(p_external_ref, '')), '');
  IF v_external_ref IS NOT NULL AND v_ctx.role != 'admin' THEN
    PERFORM private.raise_vhm_error('NOT_AUTHORIZED',
      jsonb_build_object('reason', 'external_ref_requires_admin'));
  END IF;
  IF v_external_ref IS NOT NULL AND char_length(v_external_ref) > 64 THEN
    PERFORM private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'external_ref_too_long'));
  END IF;

  SELECT cfa_to_usd_rate INTO v_rate FROM public.business_settings LIMIT 1;

  v_receipt_number := v_depot.code || '-' || lpad(v_depot.receipt_seq::text, 8, '0');

  UPDATE public.depots
  SET receipt_seq = receipt_seq + 1
  WHERE id = v_effective_depot;

  INSERT INTO public.sales (
    depot_id, cashier_id, customer_id, shift_id,
    receipt_number, status, display_currency, cfa_to_usd_rate_used,
    subtotal_cfa, discount_type, discount_value, discount_amount_cfa,
    total_cfa, admin_override_total_cfa, price_exception_reason,
    amount_tendered_cfa, amount_applied_cfa,
    change_given_cfa, balance_added_cfa, idempotency_key,
    document_date, external_ref
  ) VALUES (
    v_effective_depot, v_ctx.staff_id, p_customer_id, p_shift_id,
    v_receipt_number, 'completed', p_display_currency, coalesce(v_rate, 620),
    v_subtotal, p_discount_type, p_discount_value, v_discount_amount,
    v_total, p_override_total_cfa, v_price_reason,
    p_amount_tendered_cfa, v_amount_applied,
    v_change_given, v_balance_added, p_idempotency_key,
    v_document_date, v_external_ref
  )
  RETURNING id INTO v_sale_id;

  IF p_proforma_id IS NOT NULL THEN
    PERFORM private.mark_proforma_converted(p_proforma_id, v_sale_id, v_effective_depot);
    UPDATE public.sales SET proforma_id = p_proforma_id WHERE id = v_sale_id;
  END IF;

  -- Write sale_items with discount pro-rated against CALCULATED total (v_total)
  -- so that line-level accounting is internally consistent.
  -- The override is an order-level adjustment; individual lines use catalog prices.
  v_idx        := 0;
  v_item_total := array_length(v_items_data, 1);

  FOREACH v_item_data IN ARRAY v_items_data
  LOOP
    v_idx := v_idx + 1;

    IF v_subtotal <= 0 THEN
      v_net_line_total := 0;
    ELSIF v_idx < v_item_total THEN
      v_net_line_total := round(
        (v_item_data->>'line_total_cfa')::numeric
        - round(
            ((v_item_data->>'line_total_cfa')::numeric / v_subtotal) * v_discount_amount,
            2
          ),
        2
      );
    ELSE
      -- Last item absorbs rounding residual (net lines sum to calculated v_total)
      v_net_line_total := v_total - v_net_sum_so_far;
    END IF;

    v_net_sum_so_far := v_net_sum_so_far + v_net_line_total;

    INSERT INTO public.sale_items (
      sale_id, product_id, unit_level,
      quantity_in_unit, quantity_pieces,
      unit_price_cfa, cost_price_cfa,
      line_discount_cfa,
      line_total_cfa, net_line_total_cfa
    ) VALUES (
      v_sale_id,
      (v_item_data->>'product_id')::uuid,
      (v_item_data->>'unit_level')::smallint,
      (v_item_data->>'quantity_in_unit')::numeric,
      (v_item_data->>'quantity_pieces')::numeric,
      (v_item_data->>'unit_price_cfa')::numeric,
      (v_item_data->>'cost_price_cfa')::numeric,
      coalesce((v_item_data->>'line_discount_cfa')::numeric, 0),
      (v_item_data->>'line_total_cfa')::numeric,
      v_net_line_total
    );
  END LOOP;

  -- Update stock
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
      -v_agg_qty,
      'SALE',
      'sale',
      v_sale_id,
      v_ctx.staff_id,
      jsonb_build_object('sale_id', v_sale_id)
    );
  END LOOP;

  -- Customer payment record uses the final total amounts
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

  -- Owed = greatest(0, ledger running). Same source as the UI.
  IF p_customer_id IS NOT NULL THEN
    PERFORM private.sync_customer_balance_owed(p_customer_id);
  END IF;

  -- Phase 18C: enqueue print jobs
  PERFORM private.create_print_jobs_for_sale(v_sale_id);

  -- Audit: record both calculated total and override if applied
  PERFORM private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'complete_sale',
    p_entity_type := 'sale',
    p_entity_id   := v_sale_id,
    p_depot_id    := v_effective_depot,
    p_before_val  := null,
    p_after_val   := jsonb_build_object(
      'receipt_number',           v_receipt_number,
      'calculated_total_cfa',     v_total,
      'admin_override_total_cfa', p_override_total_cfa,
      'final_total_cfa',          v_final_total,
      'amount_applied_cfa',       v_amount_applied,
      'balance_added_cfa',        v_balance_added,
      'customer_id',              p_customer_id,
      'items_count',              array_length(v_items_data, 1),
      'override_actor',           CASE WHEN p_override_total_cfa IS NOT NULL
                                       THEN v_ctx.staff_id ELSE NULL END,
      'price_exception_reason',   v_price_reason
    )
  );

  RETURN jsonb_build_object(
    'sale_id',                  v_sale_id,
    'receipt_number',           v_receipt_number,
    'subtotal_cfa',             v_subtotal,
    'discount_amount_cfa',      v_discount_amount,
    'total_cfa',                v_total,
    'admin_override_total_cfa', p_override_total_cfa,
    'amount_tendered_cfa',      p_amount_tendered_cfa,
    'amount_applied_cfa',       v_amount_applied,
    'change_given_cfa',         v_change_given,
    'balance_added_cfa',        v_balance_added,
    'customer_id',              p_customer_id,
    'payment_id',               v_payment_id,
    'idempotent',               false
  );

EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid, numeric, text, date, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid, numeric, text, date, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.complete_sale(uuid, uuid, jsonb, numeric, text, text, numeric, uuid, uuid, numeric, text, date, text, uuid) IS
  'complete_sale: optional p_proforma_id. Customer owed is synced from customer_ledger after insert.';

create or replace function public.void_sale(
  p_sale_id  uuid,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx              private.caller_ctx;
  v_sale             public.sales%rowtype;
  v_customer         public.customers%rowtype;
  v_payment          public.payments%rowtype;
  v_product_ids      uuid[];
  v_si               public.sale_items%rowtype;
  v_balance_reversal numeric := 0;
  v_items_restored   jsonb[] := array[]::jsonb[];
begin
  -- ── Authenticate & authorize ──────────────────────────────────
  v_ctx := private.get_caller_ctx(array['cashier', 'admin']);

  if p_sale_id is null then
    perform private.raise_vhm_error('SALE_NOT_FOUND', '{"reason":"sale_id_required"}'::jsonb);
  end if;

  -- ── Lock sale row (FIRST lock) ────────────────────────────────
  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    perform private.raise_vhm_error('SALE_NOT_FOUND',
      jsonb_build_object('sale_id', p_sale_id));
  end if;

  -- Depot isolation
  if v_ctx.role = 'cashier' and v_sale.depot_id != v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('sale_depot', v_sale.depot_id, 'caller_depot', v_ctx.depot_id));
  end if;

  -- Only completed sales can be voided
  if v_sale.status = 'voided' then
    perform private.raise_vhm_error('SALE_VOIDED',
      jsonb_build_object('sale_id', p_sale_id, 'reason', 'already_voided'));
  end if;
  if v_sale.status in ('partially_returned', 'returned') then
    perform private.raise_vhm_error('SALE_FULLY_RETURNED',
      jsonb_build_object(
        'sale_id', p_sale_id,
        'status',  v_sale.status,
        'reason',  'cannot_void_sale_with_returns'
      ));
  end if;

  -- ── Lock all products (ascending UUID order — SECOND lock set) ─
  select array_agg(distinct si.product_id order by si.product_id)
  into v_product_ids
  from public.sale_items si
  where si.sale_id = p_sale_id;

  perform 1 from public.products
  where id = any(v_product_ids)
  order by id
  for update;

  -- ── Restore stock + write inventory_transactions per item ──────
  for v_si in
    select * from public.sale_items where sale_id = p_sale_id
  loop
    update public.products
    set current_stock_pieces = current_stock_pieces + v_si.quantity_pieces
    where id = v_si.product_id;

    -- VOID row in inventory ledger (positive = stock returned to shelf)
    insert into public.inventory_transactions (
      depot_id, product_id, quantity_pieces,
      transaction_type, reference_type, reference_id,
      created_by, metadata
    ) values (
      v_sale.depot_id, v_si.product_id, v_si.quantity_pieces,
      'VOID', 'void', p_sale_id,
      v_ctx.staff_id,
      jsonb_build_object('voided_sale_id', p_sale_id, 'reason', p_reason)
    );

    v_items_restored := v_items_restored || jsonb_build_object(
      'product_id',    v_si.product_id,
      'quantity_pieces', v_si.quantity_pieces
    );
  end loop;

  -- ── Lock customer (THIRD lock — after products) ───────────────
  -- Owed is synced after status = voided so the ledger excludes this sale.
  if v_sale.customer_id is not null then
    select * into v_customer
    from public.customers
    where id = v_sale.customer_id
    for update;
  end if;

  -- ── Reverse sale_payment (if one exists) ─────────────────────
  -- Only customer+cash sales have a sale_payment record.
  -- Walk-in cash sales have no payment record (cash in sales.amount_applied_cfa only).
  select * into v_payment
  from public.payments
  where sale_id = p_sale_id
    and payment_type = 'sale_payment'
    and is_reversed = false;

  if found then
    update public.payments
    set
      is_reversed = true,
      reversed_at = now(),
      reversed_by = v_ctx.staff_id
    where id = v_payment.id;

    -- Explicit cash-reversal audit entry (separate from void_sale entry below)
    -- Makes the cash consequence independently queryable from audit_log
    -- without needing to join through voided sales.
    perform private.write_audit(
      p_actor_id    := v_ctx.staff_id,
      p_action      := 'void_sale_cash_reversal',
      p_entity_type := 'payment',
      p_entity_id   := v_payment.id,
      p_depot_id    := v_sale.depot_id,
      p_before_val  := jsonb_build_object(
        'is_reversed', false,
        'amount_cfa',  v_payment.amount_cfa,
        'shift_id',    v_payment.shift_id,
        'sale_id',     p_sale_id
      ),
      p_after_val   := jsonb_build_object(
        'is_reversed', true,
        'reversed_at', now(),
        'reversed_by', v_ctx.staff_id,
        'reason',      p_reason
      )
    );
  end if;

  -- ── Update sale status ────────────────────────────────────────
  update public.sales set status = 'voided' where id = p_sale_id;

  if v_sale.customer_id is not null then
    v_balance_reversal := coalesce(v_customer.balance_owed_cfa, 0)
      - private.sync_customer_balance_owed(v_sale.customer_id);
  end if;

  -- ── Write main void audit entry ───────────────────────────────
  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'void_sale',
    p_entity_type := 'sale',
    p_entity_id   := p_sale_id,
    p_depot_id    := v_sale.depot_id,
    p_before_val  := jsonb_build_object(
      'status',           v_sale.status,
      'total_cfa',        v_sale.total_cfa,
      'amount_applied_cfa', v_sale.amount_applied_cfa,
      'balance_added_cfa',  v_sale.balance_added_cfa
    ),
    p_after_val   := jsonb_build_object(
      'status',              'voided',
      'voided_at',           now(),
      'voided_by',           v_ctx.staff_id,
      'reason',              p_reason,
      'stock_restored_items', array_length(v_items_restored, 1),
      'balance_reversed',    v_balance_reversal,
      'payment_reversed',    v_payment.id is not null
    )
  );

  return jsonb_build_object(
    'sale_id',              p_sale_id,
    'voided_at',            now(),
    'stock_restored_items', v_items_restored,
    'balance_reversed_cfa', v_balance_reversal,
    'payment_reversed',     v_payment.id is not null
  );

exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.void_sale(uuid, text) from public;
grant execute on function public.void_sale(uuid, text) to authenticated;

comment on function public.void_sale(uuid, text) is
  'SECURITY DEFINER. Voids a completed sale. Restores stock, reverses payment, adjusts customer balance. Writes 1 or 2 audit entries depending on whether a sale_payment record exists.';
