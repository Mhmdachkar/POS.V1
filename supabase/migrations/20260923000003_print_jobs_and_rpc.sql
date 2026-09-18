-- ================================================================
-- VHM POS — Phase 18C: print_jobs + claim/ack/requeue + release_sale_fulfillment
-- ================================================================

create table public.print_jobs (
  id                 uuid primary key default gen_random_uuid(),
  sale_id            uuid not null references public.sales(id) on delete cascade,
  depot_id           uuid not null references public.depots(id),
  destination        text not null check (destination in ('cashier', 'depot')),
  document_type      text not null check (document_type in ('customer_receipt', 'depot_order')),
  status             text not null default 'queued'
    check (status in ('queued', 'claimed', 'sent', 'failed')),
  payload            jsonb not null,
  created_at         timestamptz not null default now(),
  claimed_at         timestamptz,
  claimed_by_agent   text,
  attempted_at       timestamptz,
  printed_at         timestamptz,
  error_detail       text,
  attempt_count      int not null default 0,
  unique (sale_id, destination, document_type)
);

create index print_jobs_claim_idx
  on public.print_jobs (depot_id, destination, status, created_at);

comment on table public.print_jobs is
  'Durable print queue. Created at end of complete_sale after all sale_items exist.';

-- Build jsonb snapshot for receipt + depot order rendering.
create or replace function private.build_print_payload_for_sale(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_sale record;
  v_business_name text;
  v_items jsonb;
begin
  select
    s.*,
    d.name as depot_name,
    d.code as depot_code,
    st.full_name as cashier_name,
    c.name as customer_name,
    c.phone as customer_phone
  into v_sale
  from public.sales s
  join public.depots d on d.id = s.depot_id
  join public.staff st on st.id = s.cashier_id
  left join public.customers c on c.id = s.customer_id
  where s.id = p_sale_id;

  if not found then
    return null;
  end if;

  select coalesce(bs.business_name, 'VHM POS') into v_business_name
  from public.business_settings bs
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', si.product_id,
      'product_name', p.name,
      'unit_name', pu.unit_name,
      'unit_level', si.unit_level,
      'quantity_in_unit', si.quantity_in_unit,
      'quantity_pieces', si.quantity_pieces,
      'unit_price_cfa', si.unit_price_cfa,
      'line_total_cfa', si.line_total_cfa,
      'net_line_total_cfa', si.net_line_total_cfa
    ) order by si.id
  ), '[]'::jsonb)
  into v_items
  from public.sale_items si
  join public.products p on p.id = si.product_id
  join public.product_units pu
    on pu.product_id = si.product_id and pu.unit_level = si.unit_level
  where si.sale_id = p_sale_id;

  return jsonb_build_object(
    'business_name', v_business_name,
    'depot_name', v_sale.depot_name,
    'depot_code', v_sale.depot_code,
    'sale_id', p_sale_id,
    'receipt_number', v_sale.receipt_number,
    'created_at', v_sale.created_at,
    'status', v_sale.status,
    'cashier_name', v_sale.cashier_name,
    'customer_name', v_sale.customer_name,
    'customer_phone', v_sale.customer_phone,
    'display_currency', v_sale.display_currency,
    'subtotal_cfa', v_sale.subtotal_cfa,
    'discount_type', v_sale.discount_type,
    'discount_value', v_sale.discount_value,
    'discount_amount_cfa', v_sale.discount_amount_cfa,
    'total_cfa', v_sale.total_cfa,
    'amount_tendered_cfa', v_sale.amount_tendered_cfa,
    'amount_applied_cfa', v_sale.amount_applied_cfa,
    'change_given_cfa', v_sale.change_given_cfa,
    'balance_added_cfa', v_sale.balance_added_cfa,
    'items', v_items
  );
end;
$$;

create or replace function private.create_print_jobs_for_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_sale record;
  v_payload jsonb;
begin
  select s.id, s.depot_id, s.status into v_sale
  from public.sales s
  where s.id = p_sale_id;

  if not found or v_sale.status = 'voided' then
    return;
  end if;

  v_payload := private.build_print_payload_for_sale(p_sale_id);
  if v_payload is null then
    return;
  end if;

  insert into public.print_jobs (
    sale_id, depot_id, destination, document_type, status, payload
  ) values
    (p_sale_id, v_sale.depot_id, 'cashier', 'customer_receipt', 'queued', v_payload),
    (p_sale_id, v_sale.depot_id, 'depot', 'depot_order', 'queued', v_payload)
  on conflict (sale_id, destination, document_type) do nothing;
end;
$$;

-- ─── release_sale_fulfillment ───────────────────────────────────
create or replace function public.release_sale_fulfillment(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx private.caller_ctx;
  v_sale record;
  v_f public.sale_fulfillments%rowtype;
begin
  v_ctx := private.get_caller_ctx(array['depot_staff', 'admin']);

  if p_sale_id is null then
    perform private.raise_vhm_error('SALE_NOT_FOUND', '{"reason":"sale_id_required"}'::jsonb);
  end if;

  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    perform private.raise_vhm_error('SALE_NOT_FOUND',
      jsonb_build_object('reason', 'not_found', 'sale_id', p_sale_id));
  end if;

  if v_sale.status = 'voided' then
    perform private.raise_vhm_error('SALE_NOT_FOUND',
      jsonb_build_object('reason', 'sale_voided', 'sale_id', p_sale_id));
  end if;

  if v_ctx.role = 'depot_staff' and v_sale.depot_id != v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('sale_depot', v_sale.depot_id, 'caller_depot', v_ctx.depot_id));
  end if;

  select * into v_f from public.sale_fulfillments where sale_id = p_sale_id for update;
  if not found then
    perform private.raise_vhm_error('SALE_NOT_FOUND',
      jsonb_build_object('reason', 'fulfillment_missing', 'sale_id', p_sale_id));
  end if;

  if v_f.status = 'released' then
    return jsonb_build_object(
      'sale_id', p_sale_id,
      'status', 'released',
      'released_at', v_f.released_at,
      'released_by', v_f.released_by,
      'idempotent', true
    );
  end if;

  update public.sale_fulfillments
  set status = 'released',
      released_at = now(),
      released_by = v_ctx.staff_id
  where sale_id = p_sale_id
  returning * into v_f;

  perform private.write_audit(
    p_actor_id    := v_ctx.staff_id,
    p_action      := 'release_sale_fulfillment',
    p_entity_type := 'sale_fulfillment',
    p_entity_id   := p_sale_id,
    p_depot_id    := v_sale.depot_id,
    p_before_val  := jsonb_build_object('status', 'pending'),
    p_after_val   := jsonb_build_object(
      'status', 'released',
      'released_at', v_f.released_at,
      'released_by', v_f.released_by
    )
  );

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'status', 'released',
    'released_at', v_f.released_at,
    'released_by', v_f.released_by,
    'idempotent', false
  );
exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.release_sale_fulfillment(uuid) from public;
grant execute on function public.release_sale_fulfillment(uuid) to authenticated;

-- ─── claim_print_jobs ───────────────────────────────────────────
create or replace function public.claim_print_jobs(
  p_destination text,
  p_depot_id    uuid,
  p_agent_id    text,
  p_limit       int default 5
)
returns setof public.print_jobs
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx private.caller_ctx;
  v_lim int;
  v_job public.print_jobs%rowtype;
begin
  v_ctx := private.get_caller_ctx(array['cashier', 'depot_staff', 'admin']);

  if p_destination is null or p_destination not in ('cashier', 'depot') then
    perform private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'invalid_destination', 'value', p_destination));
  end if;

  if p_depot_id is null then
    perform private.raise_vhm_error('INVALID_DEPOT', '{"reason":"depot_id_required"}'::jsonb);
  end if;

  if p_agent_id is null or length(trim(p_agent_id)) = 0 then
    perform private.raise_vhm_error('INVALID_INPUT', '{"reason":"agent_id_required"}'::jsonb);
  end if;

  if v_ctx.role = 'cashier' and p_destination <> 'cashier' then
    perform private.raise_vhm_error('UNAUTHORIZED', '{"reason":"cashier_cannot_claim_depot_jobs"}'::jsonb);
  end if;

  if v_ctx.role = 'depot_staff' and p_destination <> 'depot' then
    perform private.raise_vhm_error('UNAUTHORIZED', '{"reason":"depot_staff_cannot_claim_cashier_jobs"}'::jsonb);
  end if;

  if v_ctx.role <> 'admin' and p_depot_id <> v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('requested', p_depot_id, 'caller', v_ctx.depot_id));
  end if;

  v_lim := greatest(1, least(coalesce(p_limit, 5), 20));

  for v_job in
    select *
    from public.print_jobs pj
    where pj.depot_id = p_depot_id
      and pj.destination = p_destination
      and (
        pj.status = 'queued'
        or (
          pj.status = 'claimed'
          and pj.claimed_at is not null
          and pj.claimed_at < now() - interval '2 minutes'
        )
      )
    order by pj.created_at
    limit v_lim
    for update skip locked
  loop
    update public.print_jobs
    set status = 'claimed',
        claimed_at = now(),
        claimed_by_agent = p_agent_id,
        attempted_at = now(),
        attempt_count = attempt_count + 1
    where id = v_job.id
    returning * into v_job;

    return next v_job;
  end loop;

  return;
end;
$$;

revoke execute on function public.claim_print_jobs(text, uuid, text, int) from public;
grant execute on function public.claim_print_jobs(text, uuid, text, int) to authenticated;

-- ─── ack_print_job ──────────────────────────────────────────────
create or replace function public.ack_print_job(
  p_job_id uuid,
  p_ok     boolean,
  p_error  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx private.caller_ctx;
  v_job public.print_jobs%rowtype;
begin
  v_ctx := private.get_caller_ctx(array['cashier', 'depot_staff', 'admin']);

  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then
    perform private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'job_not_found', 'job_id', p_job_id));
  end if;

  if v_ctx.role = 'cashier' and v_job.destination <> 'cashier' then
    perform private.raise_vhm_error('UNAUTHORIZED', '{"reason":"cashier_cannot_ack_depot_job"}'::jsonb);
  end if;

  if v_ctx.role = 'depot_staff' and v_job.destination <> 'depot' then
    perform private.raise_vhm_error('UNAUTHORIZED', '{"reason":"depot_staff_cannot_ack_cashier_job"}'::jsonb);
  end if;

  if v_ctx.role <> 'admin' and v_job.depot_id <> v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('job_depot', v_job.depot_id, 'caller_depot', v_ctx.depot_id));
  end if;

  if p_ok then
    update public.print_jobs
    set status = 'sent',
        printed_at = now(),
        error_detail = null
    where id = p_job_id
    returning * into v_job;
  else
    update public.print_jobs
    set status = 'failed',
        error_detail = left(coalesce(p_error, 'print_failed'), 500)
    where id = p_job_id
    returning * into v_job;
  end if;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'printed_at', v_job.printed_at,
    'error_detail', v_job.error_detail
  );
exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.ack_print_job(uuid, boolean, text) from public;
grant execute on function public.ack_print_job(uuid, boolean, text) to authenticated;

-- ─── requeue_print_job ──────────────────────────────────────────
create or replace function public.requeue_print_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx private.caller_ctx;
  v_job public.print_jobs%rowtype;
begin
  v_ctx := private.get_caller_ctx(array['cashier', 'depot_staff', 'admin']);

  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then
    perform private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'job_not_found', 'job_id', p_job_id));
  end if;

  if v_ctx.role = 'cashier' and v_job.destination <> 'cashier' then
    perform private.raise_vhm_error('UNAUTHORIZED', '{"reason":"cashier_cannot_requeue_depot_job"}'::jsonb);
  end if;

  if v_ctx.role = 'depot_staff' and v_job.destination <> 'depot' then
    perform private.raise_vhm_error('UNAUTHORIZED', '{"reason":"depot_staff_cannot_requeue_cashier_job"}'::jsonb);
  end if;

  if v_ctx.role <> 'admin' and v_job.depot_id <> v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('job_depot', v_job.depot_id, 'caller_depot', v_ctx.depot_id));
  end if;

  update public.print_jobs
  set status = 'queued',
      claimed_at = null,
      claimed_by_agent = null,
      attempted_at = null,
      printed_at = null,
      error_detail = null,
      payload = private.build_print_payload_for_sale(v_job.sale_id)
  where id = p_job_id
  returning * into v_job;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'sale_id', v_job.sale_id
  );
exception
  when sqlstate 'P0001' then raise;
end;
$$;

revoke execute on function public.requeue_print_job(uuid) from public;
grant execute on function public.requeue_print_job(uuid) to authenticated;

-- ─── RLS print_jobs ─────────────────────────────────────────────
alter table public.print_jobs enable row level security;

create policy "print_jobs_select_admin"
  on public.print_jobs for select
  using (public.is_current_staff_admin());

create policy "print_jobs_select_cashier"
  on public.print_jobs for select
  using (
    public.is_current_staff_cashier()
    and depot_id = public.get_current_staff_depot_id()
    and destination = 'cashier'
  );

create policy "print_jobs_select_depot_staff"
  on public.print_jobs for select
  using (
    public.is_current_staff_depot_staff()
    and depot_id = public.get_current_staff_depot_id()
    and destination = 'depot'
  );
