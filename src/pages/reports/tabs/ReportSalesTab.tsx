import { useMemo, useState } from 'react'
import { BiEmptyTitle, BiModalTitle as BiSectionTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { COMMON } from '@/lib/bilingual/common'
import { POS } from '@/lib/bilingual/pos'
import { cn } from '@/lib/cn'
import { EmptyState, MoneyDisplay, SaleStatusBadge, Skeleton } from '@/components/ui'
import { formatDateTime } from '@/lib/formatters'
import type { AdminSalesReport } from '@/types/rpc'
import { useSalesList } from '@/hooks/useSales'
import { useDepotOptions } from '@/hooks/useInventory'
import { SaleDetailDrawer } from '@/pages/sales/components/SaleDetailDrawer'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'
import { BreakdownList, BreakdownListPieces } from '../components/BreakdownList'
import { t } from '@/lib/bilingual/types'


interface ReportSalesTabProps {
  sales: AdminSalesReport
  depotId: string | null
  startDate: string
  endDate: string
  cashierId?: string
}

const GRID_WITH_DEPOT =
  'grid-cols-[6.5rem_5.5rem_minmax(4rem,0.85fr)_minmax(4rem,0.75fr)_minmax(4rem,0.85fr)_5rem_minmax(5.5rem,1fr)]'
const GRID_NO_DEPOT =
  'grid-cols-[6.5rem_5.5rem_minmax(4.5rem,0.9fr)_minmax(4.5rem,0.85fr)_5rem_minmax(5.5rem,1fr)]'

function authoritativeSaleTotal(sale: {
  total_cfa: number
  admin_override_total_cfa?: number | null
}): number {
  return sale.admin_override_total_cfa != null
    ? Number(sale.admin_override_total_cfa)
    : Number(sale.total_cfa)
}

export function ReportSalesTab({
  sales,
  depotId,
  startDate,
  endDate,
  cashierId,
}: ReportSalesTabProps) {
  const [page, setPage] = useState(0)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const { data: depots } = useDepotOptions()
  const showDepotColumn = !depotId
  const gridCols = showDepotColumn ? GRID_WITH_DEPOT : GRID_NO_DEPOT

  const depotNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of depots ?? []) m.set(d.id, d.name)
    return m
  }, [depots])

  const { data: listData, isLoading } = useSalesList({
    depotId,
    startDate,
    endDate,
    cashierId: cashierId || undefined,
    page,
    pageSize: 30,
  })

  const rows = listData?.data ?? []
  const total = listData?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 30))

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <ReportMetric label={<BiTableHeader {...REPORTS.grossSales} />} amount={Number(sales.sales_activity_cfa)} />
        <ReportMetric label={<BiTableHeader {...REPORTS.returnsMetric} />} amount={Number(sales.returns_activity_cfa)} />
        <ReportMetric label={<BiTableHeader {...REPORTS.netSales} />} amount={Number(sales.net_sales_cfa)} />
        <ReportMetric label={<BiTableHeader {...REPORTS.grossProfit} />} amount={Number(sales.gross_profit_cfa)} />
        <ReportMetric label={<BiTableHeader {...REPORTS.cogs} />} amount={Number(sales.cogs_cfa)} />
        <ReportMetric label={<BiTableHeader {...REPORTS.averageSale} />} amount={Number(sales.average_sale_cfa)} />
        <ReportMetric
          label={<BiTableHeader {...REPORTS.completedSales} />}
          amount={Number(sales.net_sales_cfa)}
          secondaryText={`${sales.transaction_count} txn`}
        />
        <ReportMetric label="Montant appliqué" amount={Number(sales.amount_applied_cfa)} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <ReportSection title={<BiSectionTitle {...REPORTS.byDepot} />}>
          <BreakdownList
            rows={sales.by_depot.map((d) => ({
              key: d.depot_id,
              label: d.depot_name,
              primary: Number(d.net_sales_cfa),
              secondary: `${d.transaction_count} ventes`,
            }))}
          />
        </ReportSection>
        <ReportSection title={<BiSectionTitle {...REPORTS.byCashier} />}>
          <BreakdownList
            rows={sales.by_cashier.map((c) => ({
              key: c.cashier_id,
              label: c.cashier_name,
              primary: Number(c.sales_activity_cfa),
              secondary: `${c.transaction_count} ventes`,
            }))}
          />
        </ReportSection>
        <ReportSection title={<BiSectionTitle {...REPORTS.byCategory} />}>
          <BreakdownListPieces
            rows={sales.by_category.map((c) => ({
              key: c.category_id ?? 'none',
              label: c.category_name ?? t(REPORTS.uncategorized),
              pieces: Number(c.net_pieces),
              amount: Number(c.sales_activity_cfa),
            }))}
          />
        </ReportSection>
      </div>

      <ReportSection title={<BiSectionTitle {...REPORTS.salesDetail} />}>
        {isLoading && !rows.length ? (
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={<BiEmptyTitle {...REPORTS.noSalesInPeriod} />} />
        ) : (
          <>
            <div className={cn('grid gap-2 px-3 py-2 text-xs font-semibold text-text-secondary border-b border-border', gridCols)}>
              <span>{t(COMMON.receipt)}</span>
              <span>{t(COMMON.date)}</span>
              <span>{t(COMMON.cashier)}</span>
              {showDepotColumn && <span>{t(COMMON.depot)}</span>}
              <span>{t(COMMON.customer)}</span>
              <span className="text-right">{t(COMMON.total)}</span>
              <span className="text-right">{t(COMMON.status)}</span>
            </div>
            <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
              {rows.map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  onClick={() => setSelectedSaleId(sale.id)}
                  className={cn(
                    'grid gap-2 w-full px-3 py-2 text-sm text-left bg-surface hover:bg-surface-alt items-center',
                    gridCols,
                  )}
                >
                  <span className="font-mono text-xs truncate">{sale.receipt_number}</span>
                  <span className="text-xs text-text-muted truncate">{formatDateTime(sale.created_at)}</span>
                  <span className="truncate">{sale.cashier_name ?? '—'}</span>
                  {showDepotColumn && (
                    <span className="truncate text-xs">{depotNameById.get(sale.depot_id) ?? sale.depot_id}</span>
                  )}
                  <span className="truncate">{sale.customer_name ?? t(POS.walkIn)}</span>
                  <MoneyDisplay
                    amount={authoritativeSaleTotal(sale)}
                    size="small"
                    className="justify-self-end"
                  />
                  <span className="justify-self-end">
                    <SaleStatusBadge status={sale.status} />
                  </span>
                </button>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={page <= 0}
                  className="text-sm px-2 py-1 border rounded disabled:opacity-40"
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span className="text-sm text-text-muted self-center">
                  Page {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  className="text-sm px-2 py-1 border rounded disabled:opacity-40"
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </ReportSection>

      <SaleDetailDrawer saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
    </div>
  )
}
