import { useState } from 'react'
import { BiEmptyTitle, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { Link } from 'react-router-dom'
import { EmptyState, Skeleton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { formatReportDateTime } from '@/lib/formatters'
import {
  auditActionCategory,
  auditActorLine,
  auditEventSummary,
} from '@/lib/auditPresentation'
import { useAuditLog, type AuditLogRow } from '@/hooks/useAuditLog'
import { AuditDetailDrawer } from '@/pages/admin/components/AuditDetailDrawer'
import { ReportSection } from '../components/ReportSection'
import { InfoTip } from '../components/InfoTip'
import { cn } from '@/lib/cn'
import { t } from '@/lib/bilingual/types'

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
    pageSize: 200,
  })

  const rows = data?.data ?? []

  return (
    <div className="space-y-6">
      <ReportSection
        title={(
          <span className="inline-flex items-center gap-2">
            <BiSectionTitle {...REPORTS.recentActivity} />
            <InfoTip text={t(REPORTS.auditRecent)} />
            <Link to="/admin/audit" className="text-xs font-normal text-primary hover:underline">{t(REPORTS.openFullAudit)}</Link>
          </span>
        )}
      >
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : isError ? (
          <EmptyState title={<BiEmptyTitle {...REPORTS.failedAuditLog} />} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-text-muted">{t(REPORTS.noDataPeriod)}</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md text-sm">
            {rows.map((r) => {
              const category = auditActionCategory(r.action)
              const borderClass =
                category === 'sale'
                  ? 'border-l-4 border-l-success'
                  : category === 'stock'
                  ? 'border-l-4 border-l-warning'
                  : category === 'destructive'
                  ? 'border-l-4 border-l-danger'
                  : 'border-l-4 border-l-border'
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className={cn(
                      'flex w-full flex-col gap-1 px-3 py-2.5 hover:bg-surface-muted text-left',
                      borderClass,
                    )}
                  >
                    <span className="font-medium text-text-primary leading-snug">
                      <BilingualText {...auditEventSummary(r)} variant="body" layout="inline" />
                    </span>
                    <span className="text-xs text-text-secondary">
                      {formatReportDateTime(r.occurred_at)}
                      {' · '}
                      {t(auditActorLine(r))}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ReportSection>

      <AuditDetailDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
