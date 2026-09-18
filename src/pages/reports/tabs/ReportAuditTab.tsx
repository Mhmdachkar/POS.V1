import { useState } from 'react'
import { BiEmptyTitle, BiModalTitle as BiSectionTitle, BiPageTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { Link } from 'react-router-dom'
import { EmptyState, Skeleton } from '@/components/ui'
import { formatDateTime } from '@/lib/formatters'
import { useAuditLog, type AuditLogRow } from '@/hooks/useAuditLog'
import { AuditDetailDrawer } from '@/pages/admin/components/AuditDetailDrawer'
import { ReportSection } from '../components/ReportSection'

interface ReportAuditTabProps {
  depotId: string | null
  startDate: string
  endDate: string
}

export function ReportAuditTab({ depotId, startDate, endDate }: ReportAuditTabProps) {
  const [selected, setSelected] = useState<AuditLogRow | null>(null)
  const { data, isLoading, isError } = useAuditLog({
    depotId,
    startDate,
    endDate,
    page: 0,
    pageSize: 40,
  })

  const rows = data?.data ?? []

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-secondary">
        Recent audit events for the selected dates.{' '}
        <Link to="/admin/audit" className="text-primary hover:underline">
          Open full audit log
        </Link>
      </p>

      <ReportSection title={<BiSectionTitle {...REPORTS.recentActivity} />}>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : isError ? (
          <EmptyState title={<BiEmptyTitle {...REPORTS.failedAuditLog} />} />
        ) : rows.length === 0 ? (
          <EmptyState title={<BiEmptyTitle {...REPORTS.noAuditInPeriod} />} />
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md text-sm max-h-96 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="flex w-full flex-wrap justify-between gap-2 px-3 py-2 hover:bg-surface-alt text-left"
                >
                  <span className="text-text-muted">{formatDateTime(r.occurred_at)}</span>
                  <span>{r.actor_name ?? r.actor_username ?? '—'}</span>
                  <span className="font-mono text-xs">{r.action}</span>
                  <span className="text-text-muted">{r.entity_type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <AuditDetailDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
