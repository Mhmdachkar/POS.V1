import { Drawer } from '@/components/ui'
import { formatDateTime } from '@/lib/formatters'
import type { AuditLogRow } from '@/hooks/useAuditLog'

interface AuditDetailDrawerProps {
  row: AuditLogRow | null
  onClose: () => void
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-secondary uppercase mb-1">{label}</p>
      <pre className="text-xs bg-surface-muted rounded-md p-3 overflow-auto max-h-64 border border-border">
        {value == null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

export function AuditDetailDrawer({ row, onClose }: AuditDetailDrawerProps) {
  return (
    <Drawer
      open={row != null}
      onClose={onClose}
      title="Audit event"
      description={row ? `${row.action} · ${formatDateTime(row.occurred_at)}` : undefined}
    >
      {row && (
        <div className="space-y-4 p-5 pt-0">
          <dl className="grid grid-cols-1 gap-2 text-sm">
            <div>
              <dt className="text-text-muted">Actor</dt>
              <dd className="text-text-primary">
                {row.actor_name ?? 'System'}
                {row.actor_username ? ` (@${row.actor_username})` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Action</dt>
              <dd className="font-mono text-text-primary">{row.action}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Entity</dt>
              <dd className="text-text-primary">
                {row.entity_type}
                {row.entity_id ? ` · ${row.entity_id}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Depot</dt>
              <dd className="text-text-primary">{row.depot_id ?? 'Global / all depots'}</dd>
            </div>
          </dl>
          <JsonBlock label="Before" value={row.before_value} />
          <JsonBlock label="After" value={row.after_value} />
        </div>
      )}
    </Drawer>
  )
}
