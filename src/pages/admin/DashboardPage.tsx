import { AlertTriangle, LayoutDashboard, Package, Users, Wallet } from 'lucide-react'
import { BiEmptyTitle, BiPageTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { ADMIN } from '@/lib/bilingual/admin'
import { COMMON } from '@/lib/bilingual/common'
import { STOCK_STATUS } from '@/lib/bilingual/status'
import { Card, EmptyState, Skeleton, StatCard, StockStatusBadge } from '@/components/ui'
import { formatCFA, formatDateTime, formatPieces } from '@/lib/formatters'
import { useDashboardSummary } from '@/hooks/useDashboard'
import { useStockAlerts, type StockAlertItem } from '@/hooks/useStockAlerts'
import { useDepotStore } from '@/stores/depotStore'
import { bilingualPlain, t } from '@/lib/bilingual/types'
import { SalesTodayChart } from './components/SalesTodayChart'

function formatAlertLine(item: StockAlertItem) {
  const remaining = `${formatPieces(item.currentStockPieces)} ${t(ADMIN.pcsRemaining)}`
  if (item.kind === 'out_of_stock') {
    return `${item.productName} — ${item.depotName} — ${remaining}`
  }
  const threshold =
    item.threshold == null ? '' : ` — ${t(ADMIN.thresholdLabel)} ${formatPieces(item.threshold)}`
  return `${item.productName} — ${item.depotName} — ${remaining}${threshold}`
}

function AlertList({
  title,
  items,
  count,
  empty,
  status,
}: {
  title: React.ReactNode
  items: StockAlertItem[]
  count: number
  empty: React.ReactNode
  status: 'low_stock' | 'out_of_stock'
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-secondary uppercase mb-2 flex items-center gap-1.5">
        <Package className="h-3.5 w-3.5" />
        {title}
        {count > 0 ? (
          <span className="tabular-nums text-text-muted font-medium normal-case">({count})</span>
        ) : null}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.productId}`}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <span className="min-w-0 text-text-primary leading-snug">
                {formatAlertLine(item)}
              </span>
              <StockStatusBadge status={status} />
            </li>
          ))}
        </ul>
      )}
      {count > items.length && (
        <p className="text-xs text-text-muted mt-2">
          <BilingualText {...ADMIN.showingOf(items.length, count)} variant="caption" />
        </p>
      )}
    </div>
  )
}

export function DashboardPage() {
  const depotId = useDepotStore((s) => s.currentDepotId)
  const depotName = useDepotStore((s) => s.currentDepotName)
  const { data, isLoading, isError } = useDashboardSummary(depotId)
  const {
    data: alerts,
    isLoading: loadingAlerts,
    isError: alertsError,
  } = useStockAlerts(depotId)

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="p-3 sm:p-6">
        <EmptyState icon={<LayoutDashboard className="h-8 w-8" />} title={<BiEmptyTitle {...ADMIN.failedDashboard} />} />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-6 space-y-6 min-h-0 w-full">
      <div>
        <h1 className="text-title text-text-primary">
          <BiPageTitle {...ADMIN.dashboardToday} />
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {depotId ? (
            depotName ?? <BilingualText {...ADMIN.selectedDepot} variant="caption" />
          ) : (
            <BilingualText {...COMMON.allDepots} variant="caption" />
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={<BiTableHeader {...ADMIN.statSales} />} value={formatCFA(Number(data.sales_cfa))} />
        <StatCard label={<BiTableHeader {...ADMIN.statGrossProfit} />} value={formatCFA(Number(data.gross_profit_cfa))} />
        <StatCard label={<BiTableHeader {...ADMIN.statTransactions} />} value={String(data.txn_count)} />
        <StatCard label={<BiTableHeader {...ADMIN.statAverageSale} />} value={formatCFA(Number(data.avg_sale_cfa))} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <SalesTodayChart hourlySales={data.hourly_sales} />
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-text-primary mb-3">
            <BiTableHeader {...ADMIN.topProducts} />
          </h2>
          {data.top_products.length === 0 ? (
            <p className="text-sm text-text-muted">
              <BilingualText {...ADMIN.noNetSalesToday} variant="caption" />
            </p>
          ) : (
            <div className="space-y-2">
              {data.top_products.map((p) => (
                <div key={p.product_id} className="flex justify-between text-sm">
                  <span className="text-text-primary truncate pr-3">{p.name}</span>
                  <span className="tabular-nums text-text-secondary">{formatPieces(Number(p.net_pieces))}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-text-primary mb-3">
          <BiTableHeader {...ADMIN.actionRequired} />
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-5">
            {loadingAlerts ? (
              <div className="space-y-2" role="status" aria-label={bilingualPlain(COMMON.loading)}>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : alertsError ? (
              <p className="text-sm text-text-primary">
                <BilingualText {...ADMIN.failedStockAlerts} variant="body" />
              </p>
            ) : (
              <>
                <AlertList
                  title={<BiTableHeader {...STOCK_STATUS.low_stock} />}
                  items={alerts?.lowStock ?? []}
                  count={alerts?.lowStockCount ?? 0}
                  empty={<BilingualText {...ADMIN.noLowStock} variant="caption" />}
                  status="low_stock"
                />
                <AlertList
                  title={<BiTableHeader {...STOCK_STATUS.out_of_stock} />}
                  items={alerts?.outOfStock ?? []}
                  count={alerts?.outOfStockCount ?? 0}
                  empty={<BilingualText {...ADMIN.noOutOfStock} variant="caption" />}
                  status="out_of_stock"
                />
              </>
            )}
          </div>
          <div className="space-y-3">
            <p
              className={`text-sm flex items-center gap-2 ${
                data.action_required.outstanding_balances_count > 0
                  ? 'text-warning-foreground'
                  : 'text-text-primary'
              }`}
            >
              <Users
                className={`h-4 w-4 ${
                  data.action_required.outstanding_balances_count > 0
                    ? 'text-warning-foreground'
                    : 'text-text-secondary'
                }`}
              />
              <BilingualText
                {...ADMIN.customersWithBalance(data.action_required.outstanding_balances_count)}
                variant="body"
                frClassName={
                  data.action_required.outstanding_balances_count > 0
                    ? 'text-warning-foreground'
                    : undefined
                }
              />
            </p>
            <p className="text-sm text-text-primary flex items-center gap-2">
              <Wallet className="h-4 w-4 text-text-secondary" />
              <BilingualText
                {...ADMIN.exchangeRateLine(Number(data.action_required.exchange_rate.cfa_to_usd_rate))}
                variant="body"
                layout="inline"
              />
              <span className="text-text-muted text-xs">
                {formatDateTime(data.action_required.exchange_rate.rate_updated_at)}
              </span>
            </p>
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                <BiTableHeader {...ADMIN.shiftDiscrepanciesToday} />
              </p>
              {data.action_required.shift_discrepancies.length === 0 ? (
                <p className="text-sm text-text-muted">
                  <BilingualText {...ADMIN.noneLabel} variant="caption" />
                </p>
              ) : (
                <ul className="space-y-1">
                  {data.action_required.shift_discrepancies.map((s) => (
                    <li key={s.shift_id} className="text-sm tabular-nums text-danger-foreground">
                      {formatCFA(Number(s.discrepancy_cfa))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
