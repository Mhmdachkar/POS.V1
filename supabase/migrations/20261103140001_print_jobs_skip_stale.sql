-- Print agent offline: mark stale queued jobs skipped. Never delete rows.
-- Reprint still uses requeue_print_job, which sets status back to queued.

alter table public.print_jobs drop constraint if exists print_jobs_status_check;
alter table public.print_jobs add constraint print_jobs_status_check
  check (status in ('queued', 'claimed', 'sent', 'failed', 'skipped'));

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

  -- Agent was away: do not burst-print old tickets. Status change only.
  update public.print_jobs
  set status = 'skipped',
      error_detail = 'agent_offline_stale'
  where depot_id = p_depot_id
    and destination = p_destination
    and status = 'queued'
    and created_at < now() - interval '5 minutes';


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
