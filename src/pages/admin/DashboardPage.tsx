import { AlertTriangle, LayoutDashboard, Package, Users, Wallet } from 'lucide-react'
import { Card, EmptyState, Skeleton, StatCard } from '@/components/ui'
import { formatCFA, formatDateTime, formatPieces } from '@/lib/formatters'
import { useDashboardSummary } from '@/hooks/useDashboard'
import { useDepotStore } from '@/stores/depotStore'

export function DashboardPage() {
  const depotId = useDepotStore((s) => s.currentDepotId)
  const depotName = useDepotStore((s) => s.currentDepotName)
  const { data, isLoading, isError } = useDashboardSummary(depotId)

  if (isLoading) {
    return (
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <EmptyState icon={<LayoutDashboard className="h-8 w-8" />} title="Failed to load dashboard" />
      </div>
    )
  }

  const maxHourly = Math.max(1, ...data.hourly_sales.map((h) => Number(h.sales_cfa)))

  return (
    <div className="p-6 space-y-6 overflow-auto">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Today</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {depotId ? depotName ?? 'Selected depot' : 'All depots'} · West Africa calendar day (Africa/Abidjan)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Sales" value={formatCFA(Number(data.sales_cfa))} />
        <StatCard label="Gross profit" value={formatCFA(Number(data.gross_profit_cfa))} />
        <StatCard label="Transactions" value={String(data.txn_count)} />
        <StatCard label="Average sale" value={formatCFA(Number(data.avg_sale_cfa))} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-sm font-semibold text-text-primary mb-3">Sales today</h2>
          {data.hourly_sales.length === 0 ? (
            <p className="text-sm text-text-muted">No sales yet today.</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {Array.from({ length: 24 }, (_, hour) => {
                const row = data.hourly_sales.find((h) => Number(h.hour) === hour)
                const value = Number(row?.sales_cfa ?? 0)
                const height = Math.max(value > 0 ? 8 : 2, (value / maxHourly) * 100)
                return (
                  <div key={hour} className="flex-1 flex flex-col items-center justify-end h-full" title={`${hour}:00 · ${formatCFA(value)}`}>
                    <div className="w-full bg-primary/70 rounded-sm" style={{ height: `${height}%` }} />
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-text-primary mb-3">Top products</h2>
          {data.top_products.length === 0 ? (
            <p className="text-sm text-text-muted">No net sales yet today.</p>
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
        <h2 className="text-sm font-semibold text-text-primary mb-3">Action required</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase mb-2 flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" /> Low stock
            </p>
            {data.action_required.low_stock.length === 0 ? (
              <p className="text-sm text-text-muted">None</p>
            ) : (
              <ul className="space-y-1">
                {data.action_required.low_stock.map((item) => (
                  <li key={item.product_id} className="text-sm flex justify-between gap-2">
                    <span className="truncate">{item.name}</span>
                    <span className="tabular-nums text-warning-foreground">{formatPieces(Number(item.current_stock_pieces))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-3">
            <p className="text-sm text-text-primary flex items-center gap-2">
              <Users className="h-4 w-4 text-text-secondary" />
              {data.action_required.outstanding_balances_count} customer{data.action_required.outstanding_balances_count !== 1 ? 's' : ''} with balance
            </p>
            <p className="text-sm text-text-primary flex items-center gap-2">
              <Wallet className="h-4 w-4 text-text-secondary" />
              Rate {Number(data.action_required.exchange_rate.cfa_to_usd_rate)} CFA / USD
              <span className="text-text-muted text-xs">
                {formatDateTime(data.action_required.exchange_rate.rate_updated_at)}
              </span>
            </p>
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Shift discrepancies today
              </p>
              {data.action_required.shift_discrepancies.length === 0 ? (
                <p className="text-sm text-text-muted">None</p>
              ) : (
                <ul className="space-y-1">
                  {data.action_required.shift_discrepancies.map((s) => (
                    <li key={s.shift_id} className="text-sm tabular-nums text-danger">
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
