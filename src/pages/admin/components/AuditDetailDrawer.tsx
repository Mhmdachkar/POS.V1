import { Drawer } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { formatDateTime } from '@/lib/formatters'
import type { AuditLogRow } from '@/hooks/useAuditLog'
import { useAuditEventUnits } from '@/hooks/useAuditEventUnits'
import { useDepotOptions } from '@/hooks/useInventory'
import {
  auditActionLabel,
  auditActorLine,
  auditDepotLine,
  auditDetailChanges,
  auditHeroMetric,
} from '@/lib/auditPresentation'
import { ADMIN } from '@/lib/bilingual/admin'
import { BiTableHeader } from '@/lib/bilingual/ui'
import { cn } from '@/lib/cn'
import { t } from '@/lib/bilingual/types'

interface AuditDetailDrawerProps {
  row: AuditLogRow | null
  onClose: () => void
}

export function AuditDetailDrawer({ row, onClose }: AuditDetailDrawerProps) {
  const { data: depots } = useDepotOptions()
  const { data: units } = useAuditEventUnits(row)
  const depotName = row?.depot_id
    ? depots?.find((d) => d.id === row.depot_id)?.name ?? null
    : null

  const hero = row ? auditHeroMetric(row, units ?? null) : null
  const changes = row ? auditDetailChanges(row, units ?? null) : []

  return (
    <Drawer
      open={row != null}
      onClose={onClose}
      title={row ? <BilingualText {...auditActionLabel(row.action)} variant="body" /> : undefined}
      description={
        row ? (
          <span className="text-text-secondary">
            {formatDateTime(row.occurred_at)}
            {' · '}
            {t(auditActorLine(row))}
            {' · '}
            {t(auditDepotLine(row.depot_id, depotName))}
          </span>
        ) : undefined
      }
    >
      {row && (
        <div className="space-y-5 p-5 pt-0">
          {/* Hero metric card — big number at a glance */}
          {hero && (
            <div
              className={cn(
                'rounded-xl border px-4 py-3',
                hero.isPositive === true
                  ? 'border-success/30 bg-success-bg'
                  : hero.isPositive === false
                  ? 'border-danger/30 bg-danger-bg'
                  : 'border-border bg-surface-muted',
              )}
            >
              <p
                className={cn(
                  'text-2xl font-bold tabular-nums leading-tight',
                  hero.isPositive === true
                    ? 'text-success-foreground'
                    : hero.isPositive === false
                    ? 'text-danger-foreground'
                    : 'text-text-primary',
                )}
              >
                <BilingualText {...hero.value} variant="body" layout="inline" />
              </p>
              {hero.sub && (
                <p className="mt-1 text-sm text-text-secondary">
                  <BilingualText {...hero.sub} variant="caption" layout="inline" />
                </p>
              )}
            </div>
          )}

          {/* What changed — stacked label + value rows */}
          {changes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
                <BiTableHeader {...ADMIN.auditChangesSummary} />
              </p>
              <ul className="space-y-3">
                {changes.map((line) => (
                  <li key={line.label.fr} className="space-y-0.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      <BilingualText {...line.label} variant="caption" layout="inline" />
                    </p>
                    <p
                      className={cn(
                        'text-sm font-medium tabular-nums',
                        line.isPositive === true
                          ? 'text-success-foreground'
                          : line.isPositive === false
                          ? 'text-danger-foreground'
                          : 'text-text-primary',
                      )}
                    >
                      <BilingualText {...line.value} variant="body" layout="inline" />
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}
