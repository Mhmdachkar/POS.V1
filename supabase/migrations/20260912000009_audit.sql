-- ================================================================
-- VHM POS — Migration 009: Audit Log
-- ================================================================
--
-- The audit_log is an append-only table.
-- No UPDATE or DELETE policies are granted on this table.
-- Even admins cannot modify audit records (RLS enforces this).
-- Writes go only through Edge Function RPCs using service_role.
--
-- Indexed for the most common admin queries:
--   - "What did actor X do?" → actor_id
--   - "What happened to entity Y?" → entity_type + entity_id
--   - "All activity in depot Z?" → depot_id + occurred_at
--   - "All recent activity?" → occurred_at DESC
-- ================================================================

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references staff(id),     -- null for system-generated events
  action        text not null,                  -- e.g. 'create_sale', 'void_sale', 'adjust_stock'
  entity_type   text not null,                  -- e.g. 'sale', 'product', 'customer', 'payment'
  entity_id     uuid,                           -- the PK of the affected row
  depot_id      uuid references depots(id),     -- null for admin-level actions
  before_value  jsonb,                          -- snapshot of relevant state before change
  after_value   jsonb,                          -- snapshot of relevant state after change
  occurred_at   timestamptz not null default now()
);

-- Single-column indexes
create index audit_log_actor_idx       on audit_log (actor_id);
create index audit_log_depot_idx       on audit_log (depot_id);
create index audit_log_entity_idx      on audit_log (entity_type, entity_id);
create index audit_log_occurred_at_idx on audit_log (occurred_at desc);
create index audit_log_action_idx      on audit_log (action);

-- Composite for "all activity in a depot, newest first"
create index audit_log_depot_time_idx  on audit_log (depot_id, occurred_at desc);

comment on table audit_log is
  'Append-only. No UPDATE/DELETE policies. All writes via Edge Functions with service_role. Indexed for common admin queries.';

comment on column audit_log.actor_id is
  'Staff who performed the action. NULL for system events (e.g. auto-close). References staff(id).';

comment on column audit_log.before_value is
  'JSONB snapshot of relevant fields before the change. Not always the full row — only fields relevant to the action.';
