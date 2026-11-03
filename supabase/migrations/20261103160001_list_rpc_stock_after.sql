-- One round trip for the inventory page and the sale drawer.
-- New inventory movements store the stock left afterward. Older rows stay empty. Nothing is deleted or backfilled.

alter table public.inventory_transactions
  add column if not exists stock_after numeric(14,4);

comment on column public.inventory_transactions.stock_after is
  'Pieces on hand for this product after this movement. Filled on insert from products.current_stock_pieces. Older rows stay null.';

create or replace function private.inventory_txn_set_stock_after()
returns trigger
language plpgsql
as $$
begin
  if new.stock_after is null then
    select p.current_stock_pieces
      into new.stock_after
    from public.products p
    where p.id = new.product_id;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_txn_set_stock_after on public.inventory_transactions;
create trigger inventory_txn_set_stock_after
  before insert on public.inventory_transactions
  for each row
  execute function private.inventory_txn_set_stock_after();

create or replace function public.list_inventory_page(
  p_depot_id uuid default null,
  p_search text default null,
  p_category_id uuid default null,
  p_stock_status text default 'all',
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx private.caller_ctx;
  v_depot uuid;
  v_search text;
  v_status text;
  v_limit integer;
  v_offset integer;
  v_count integer;
  v_rows jsonb;
begin
  v_ctx := private.get_caller_ctx(array['cashier', 'depot_staff', 'admin']);
  v_search := nullif(btrim(coalesce(p_search, '')), '');
  v_status := coalesce(nullif(btrim(coalesce(p_stock_status, '')), ''), 'all');
  v_limit := greatest(1, least(coalesce(p_limit, 30), 2000));
  v_offset := greatest(0, coalesce(p_offset, 0));

  if v_status not in ('all', 'out_of_stock', 'low_stock', 'healthy') then
    perform private.raise_vhm_error('INVALID_INPUT',
      jsonb_build_object('reason', 'stock_status_invalid', 'value', v_status));
  end if;

  if v_ctx.role = 'admin' then
    v_depot := p_depot_id;
  else
    if v_ctx.depot_id is null then
      perform private.raise_vhm_error('INVALID_DEPOT', '{"reason":"depot_required"}'::jsonb);
    end if;
    v_depot := v_ctx.depot_id;
  end if;

  select count(*)::integer
    into v_count
  from public.products p
  where (v_depot is null or p.depot_id = v_depot)
    and (p_category_id is null or p.category_id = p_category_id)
    and (
      v_search is null
      or p.name ilike '%' || v_search || '%'
      or exists (
        select 1
        from public.product_units u
        where u.product_id = p.id
          and u.serial_number ilike '%' || v_search || '%'
      )
    )
    and (
      v_status = 'all'
      or (v_status = 'out_of_stock' and p.track_low_stock and p.current_stock_pieces <= 0)
      or (v_status = 'low_stock' and p.is_low_stock)
      or (v_status = 'healthy' and p.current_stock_pieces > 0 and p.is_low_stock = false)
    );

  select coalesce(jsonb_agg(row.item order by row.sort_name), '[]'::jsonb)
    into v_rows
  from (
    select p.name as sort_name, jsonb_build_object(
      'id', p.id,
      'depot_id', p.depot_id,
      'category_id', p.category_id,
      'name', p.name,
      'photo_url', p.photo_url,
      'current_stock_pieces', p.current_stock_pieces,
      'track_low_stock', p.track_low_stock,
      'low_stock_threshold', p.low_stock_threshold,
      'is_low_stock', p.is_low_stock,
      'is_active', p.is_active,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'product_units', coalesce((
        select jsonb_agg(jsonb_build_object(
          'unit_level', u.unit_level,
          'unit_name', u.unit_name,
          'serial_number', u.serial_number,
          'conversion_to_base', u.conversion_to_base,
          'relative_quantity', u.relative_quantity,
          'cost_price_cfa', u.cost_price_cfa,
          'selling_price_cfa', u.selling_price_cfa
        ) order by u.unit_level)
        from public.product_units u
        where u.product_id = p.id
      ), '[]'::jsonb),
      'categories', (
        select jsonb_build_object('name', c.name)
        from public.categories c
        where c.id = p.category_id
      )
    ) as item
    from public.products p
    where (v_depot is null or p.depot_id = v_depot)
      and (p_category_id is null or p.category_id = p_category_id)
      and (
        v_search is null
        or p.name ilike '%' || v_search || '%'
        or exists (
          select 1
          from public.product_units u
          where u.product_id = p.id
            and u.serial_number ilike '%' || v_search || '%'
        )
      )
      and (
        v_status = 'all'
        or (v_status = 'out_of_stock' and p.track_low_stock and p.current_stock_pieces <= 0)
        or (v_status = 'low_stock' and p.is_low_stock)
        or (v_status = 'healthy' and p.current_stock_pieces > 0 and p.is_low_stock = false)
      )
    order by p.name
    offset v_offset
    limit v_limit
  ) row;

  return jsonb_build_object('count', v_count, 'rows', v_rows);
end;
$$;

revoke execute on function public.list_inventory_page(uuid, text, uuid, text, integer, integer) from public;
grant execute on function public.list_inventory_page(uuid, text, uuid, text, integer, integer) to authenticated;

create or replace function public.get_sale_detail(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ctx private.caller_ctx;
  v_sale public.sales%rowtype;
  v_sale_json jsonb;
  v_items jsonb;
  v_returns jsonb;
  v_payments jsonb;
begin
  v_ctx := private.get_caller_ctx(array['cashier', 'depot_staff', 'admin']);

  if p_sale_id is null then
    perform private.raise_vhm_error('SALE_NOT_FOUND', '{"reason":"sale_id_required"}'::jsonb);
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id;

  if not found then
    perform private.raise_vhm_error('SALE_NOT_FOUND',
      jsonb_build_object('sale_id', p_sale_id));
  end if;

  if v_ctx.role <> 'admin' and v_sale.depot_id is distinct from v_ctx.depot_id then
    perform private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object('sale_depot', v_sale.depot_id, 'caller_depot', v_ctx.depot_id));
  end if;

  select to_jsonb(s) || jsonb_build_object(
    'customers', (
      select jsonb_build_object(
        'name', c.name,
        'phone', c.phone,
        'balance_owed_cfa', c.balance_owed_cfa
      )
      from public.customers c
      where c.id = s.customer_id
    ),
    'staff', (
      select jsonb_build_object('full_name', st.full_name, 'role', st.role)
      from public.staff st
      where st.id = s.cashier_id
    ),
    'sale_fulfillments', (
      select jsonb_build_object(
        'status', f.status,
        'released_at', f.released_at,
        'released_by', f.released_by,
        'depot_id', f.depot_id,
        'created_at', f.created_at,
        'released_by_staff', (
          select jsonb_build_object('full_name', rel.full_name)
          from public.staff rel
          where rel.id = f.released_by
        )
      )
      from public.sale_fulfillments f
      where f.sale_id = s.id
    ),
    'shifts', (
      select jsonb_build_object(
        'opened_at', sh.opened_at,
        'closed_at', sh.closed_at,
        'status', sh.status
      )
      from public.shifts sh
      where sh.id = s.shift_id
    )
  )
  into v_sale_json
  from public.sales s
  where s.id = p_sale_id;

  select coalesce(jsonb_agg(item.payload order by item.sort_id), '[]'::jsonb)
    into v_items
  from (
    select si.id as sort_id,
      to_jsonb(si) || jsonb_build_object(
        'products', jsonb_build_object(
          'name', pr.name,
          'product_units', coalesce((
            select jsonb_agg(jsonb_build_object(
              'unit_level', u.unit_level,
              'unit_name', u.unit_name,
              'serial_number', u.serial_number
            ) order by u.unit_level)
            from public.product_units u
            where u.product_id = si.product_id
          ), '[]'::jsonb)
        )
      ) as payload
    from public.sale_items si
    join public.products pr on pr.id = si.product_id
    where si.sale_id = p_sale_id
  ) item;

  select coalesce(jsonb_agg(ret.payload order by ret.created_at), '[]'::jsonb)
    into v_returns
  from (
    select sr.created_at,
      to_jsonb(sr) || jsonb_build_object(
        'sale_return_items', coalesce((
          select jsonb_agg(to_jsonb(sri) order by sri.id)
          from public.sale_return_items sri
          where sri.return_id = sr.id
        ), '[]'::jsonb)
      ) as payload
    from public.sale_returns sr
    where sr.sale_id = p_sale_id
  ) ret;

  if v_ctx.role = 'depot_staff' then
    v_payments := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(to_jsonb(pay) order by pay.recorded_at), '[]'::jsonb)
      into v_payments
    from public.payments pay
    where pay.sale_id = p_sale_id;
  end if;

  return jsonb_build_object(
    'sale', v_sale_json,
    'items', v_items,
    'returns', v_returns,
    'payments', v_payments
  );
end;
$$;

revoke execute on function public.get_sale_detail(uuid) from public;
grant execute on function public.get_sale_detail(uuid) to authenticated;
