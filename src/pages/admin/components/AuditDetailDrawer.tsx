import { Drawer } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { formatDateTime } from '@/lib/formatters'
import type { AuditLogRow } from '@/hooks/useAuditLog'
import { ADMIN } from '@/lib/bilingual/admin'
import { COMMON } from '@/lib/bilingual/common'
import { BiTableHeader } from '@/lib/bilingual/ui'

interface AuditDetailDrawerProps {
  row: AuditLogRow | null
  onClose: () => void
}

function JsonBlock({ label, value }: { label: React.ReactNode; value: unknown }) {
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
      title={<BiTableHeader {...ADMIN.auditEvent} />}
      description={row ? `${row.action} · ${formatDateTime(row.occurred_at)}` : undefined}
    >
      {row && (
        <div className="space-y-4 p-5 pt-0">
          <dl className="grid grid-cols-1 gap-2 text-sm">
            <div>
              <dt className="text-text-muted">
                <BiTableHeader {...ADMIN.actor} />
              </dt>
              <dd className="text-text-primary">
                {row.actor_name ? (
                  <>
                    {row.actor_name}
                    {row.actor_username ? ` (@${row.actor_username})` : ''}
                  </>
                ) : (
                  <BilingualText {...ADMIN.systemActor} variant="caption" />
                )}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">
                <BiTableHeader {...ADMIN.action} />
              </dt>
              <dd className="font-mono text-text-primary">{row.action}</dd>
            </div>
            <div>
              <dt className="text-text-muted">
                <BiTableHeader {...ADMIN.entity} />
              </dt>
              <dd className="text-text-primary">
                {row.entity_type}
                {row.entity_id ? ` · ${row.entity_id}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">
                <BiTableHeader {...COMMON.depot} />
              </dt>
              <dd className="text-text-primary">
                {row.depot_id ?? (
                  <BilingualText {...ADMIN.globalDepots} variant="caption" />
                )}
              </dd>
            </div>
          </dl>
          <JsonBlock label={<BiTableHeader {...ADMIN.beforeValue} />} value={row.before_value} />
          <JsonBlock label={<BiTableHeader {...ADMIN.afterValue} />} value={row.after_value} />
        </div>
      )}
    </Drawer>
  )
}
