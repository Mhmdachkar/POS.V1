-- ================================================================
-- VHM POS — Phase 18C: sale_fulfillments
-- ================================================================

create table public.sale_fulfillments (
  sale_id      uuid primary key references public.sales(id) on delete cascade,
  depot_id     uuid not null references public.depots(id),
  status       text not null default 'pending'
    check (status in ('pending', 'released')),
  released_at  timestamptz,
  released_by  uuid references public.staff(id),
  created_at   timestamptz not null default now(),
  constraint released_requires_actor
    check (
      (status = 'pending' and released_at is null and released_by is null)
      or (status = 'released' and released_at is not null and released_by is not null)
    )
);

create index sale_fulfillments_depot_status_idx
  on public.sale_fulfillments (depot_id, status, created_at desc);

comment on table public.sale_fulfillments is
  'Depot order release tracking. Separate from sales.status (immutable sales row).';

-- Pending fulfillment for each new sale (no line payload needed).
create or replace function private.trg_sale_fulfillment_on_sale_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.sale_fulfillments (sale_id, depot_id, status)
  values (new.id, new.depot_id, 'pending')
  on conflict (sale_id) do nothing;
  return new;
end;
$$;

create trigger sale_fulfillment_after_sale_insert
  after insert on public.sales
  for each row
  execute function private.trg_sale_fulfillment_on_sale_insert();

-- Backfill historical sales
insert into public.sale_fulfillments (sale_id, depot_id, status)
select s.id, s.depot_id, 'pending'
from public.sales s
where s.status <> 'voided'
on conflict (sale_id) do nothing;

alter table public.sale_fulfillments enable row level security;

create policy "sale_fulfillments_select_admin"
  on public.sale_fulfillments for select
  using (public.is_current_staff_admin());

create policy "sale_fulfillments_select_cashier"
  on public.sale_fulfillments for select
  using (
    public.is_current_staff_cashier()
    and depot_id = public.get_current_staff_depot_id()
  );

create policy "sale_fulfillments_select_depot_staff"
  on public.sale_fulfillments for select
  using (
    public.is_current_staff_depot_staff()
    and depot_id = public.get_current_staff_depot_id()
  );
