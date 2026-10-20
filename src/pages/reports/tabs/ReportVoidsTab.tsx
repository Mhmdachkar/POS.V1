import { useState } from 'react'
import { BiEmptyTitle, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { cn } from '@/lib/cn'
import { EmptyState, MoneyDisplay, SaleStatusBadge, Skeleton } from '@/components/ui'
import { formatDateTime } from '@/lib/formatters'
import type { AdminSalesReport } from '@/types/rpc'
import { useSalesList } from '@/hooks/useSales'
import { SaleDetailDrawer } from '@/pages/sales/components/SaleDetailDrawer'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'
import { t } from '@/lib/bilingual/types'


interface ReportVoidsTabProps {
  sales: AdminSalesReport
  depotId: string | null
  startDate: string
  endDate: string
  cashierId?: string
  shiftId?: string
}

export function ReportVoidsTab({
  sales,
  depotId,
  startDate,
  endDate,
  cashierId,
  shiftId,
}: ReportVoidsTabProps) {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const { data, isLoading } = useSalesList({
    depotId,
    startDate,
    endDate,
    cashierId: cashierId || undefined,
    shiftId: shiftId || undefined,
    status: 'voided',
    page: 0,
    pageSize: 50,
  })

  const rows = data?.data ?? []

  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-2 gap-3 max-w-lg">
        <ReportMetric
          label={t(REPORTS.voidedReceipts)}
          amount={Number(sales.voided_amount_cfa)}
          secondaryText={t(REPORTS.voidedCount(sales.voided_count))}
          danger
        />
      </div>

      <ReportSection title={<BiSectionTitle {...REPORTS.voidedReceipts} />}>
        {isLoading && !rows.length ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState title={<BiEmptyTitle {...REPORTS.noVoidedInPeriod} />} />
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md">
            {rows.map((sale) => (
              <li key={sale.id}>
                <button
                  type="button"
                  onClick={() => setSelectedSaleId(sale.id)}
                  className={cn(
                    'flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface-alt text-left',
                  )}
                >
                  <span className="font-mono text-xs">{sale.receipt_number}</span>
                  <span className="text-text-muted text-xs">{formatDateTime(sale.created_at)}</span>
                  <span>{sale.cashier_name ?? '—'}</span>
                  <MoneyDisplay amount={sale.total_cfa} size="small" />
                  <SaleStatusBadge status={sale.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <SaleDetailDrawer saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
    </div>
  )
}
