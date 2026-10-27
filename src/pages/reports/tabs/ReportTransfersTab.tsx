import { useMemo, useState } from 'react'
import { BiEmptyTitle, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { EmptyState, Skeleton } from '@/components/ui'
import { formatReportDateTime } from '@/lib/formatters'
import { useTransfersList } from '@/hooks/useTransfers'
import { TransferDetailDrawer } from '@/pages/transfers/components/TransferDetailDrawer'
import { ReportSection } from '../components/ReportSection'
import type { TransferStatus } from '@/types/database'
import { t } from '@/lib/bilingual/types'


interface ReportTransfersTabProps {
  depotId: string | null
}

export function ReportTransfersTab({ depotId }: ReportTransfersTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data, isLoading, isError } = useTransfersList({
    involvingDepotId: depotId,
    status: null,
    page: 0,
    pageSize: 100,
  })

  const rows = data?.data ?? []

  const byStatus = useMemo(() => {
    const m = new Map<TransferStatus, number>()
    for (const t of rows) {
      m.set(t.status, (m.get(t.status) ?? 0) + 1)
    }
    return m
  }, [rows])

  return (
    <div className="space-y-8">
      <ReportSection title={<BiSectionTitle {...REPORTS.summaryByStatus} />}>
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted">{t(TRANSFERS.noTransfers)}</p>
        ) : (
          <ul className="flex flex-wrap gap-3 text-sm">
            {Array.from(byStatus.entries()).map(([status, count]) => (
              <li key={status} className="px-3 py-1.5 rounded-md border border-border bg-surface">
                <span className="font-medium capitalize">{status}</span>: {count}
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title={<BiSectionTitle {...REPORTS.transfers} />}>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : isError ? (
          <EmptyState title={<BiEmptyTitle {...TRANSFERS.failedToLoad} />} />
        ) : rows.length === 0 ? (
          <EmptyState title={<BiEmptyTitle {...TRANSFERS.noTransfers} />} />
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md text-sm">
            {rows.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className="flex w-full flex-wrap justify-between gap-2 px-3 py-2 hover:bg-surface-alt text-left"
                >
                  <span className="capitalize font-medium">{t.status}</span>
                  <span>{t.from_depot_name} → {t.to_depot_name}</span>
                  <span className="text-text-muted">{formatReportDateTime(t.created_at)}</span>
                  <span className="text-text-muted">{t.item_count} items</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <TransferDetailDrawer transferId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}
