import { useMemo, useState } from 'react'
import { BarChart2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Card, EmptyState, Skeleton, StatCard } from '@/components/ui'
import { formatCFA, formatDateTime, formatPieces } from '@/lib/formatters'
import { downloadCsv } from '@/lib/csvExport'
import { resolveReportDateRange, type ReportPreset } from '@/lib/reportDates'
import {
  useCashReport,
  useCustomersReport,
  useInventoryReport,
  useSalesReport,
} from '@/hooks/useReports'
import { useDepotStore } from '@/stores/depotStore'
import { ReportToolbar } from './components/ReportToolbar'

type ReportTab = 'sales' | 'inventory' | 'customers' | 'cash'

const TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'sales', label: 'Sales' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'customers', label: 'Customers' },
  { id: 'cash', label: 'Cash' },
]

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('sales')
  const [preset, setPreset] = useState<ReportPreset>('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const depotId = useDepotStore((s) => s.currentDepotId)

  const range = useMemo(
    () => resolveReportDateRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  )

  const sales = useSalesReport(depotId, range.startDate, range.endDate)
  const inventory = useInventoryReport(depotId, range.startDate, range.endDate)
  const customers = useCustomersReport(depotId, range.startDate, range.endDate)
  const cash = useCashReport(depotId, range.startDate, range.endDate)

  const activeQuery =
    tab === 'sales' ? sales
      : tab === 'inventory' ? inventory
        : tab === 'customers' ? customers
          : cash

  function handleExport() {
    const stamp = `${range.startDate}_${range.endDate}`
    if (tab === 'sales' && sales.data) {
      const d = sales.data
      downloadCsv(
        `sales-report-${stamp}.csv`,
        ['Metric', 'Value'],
        [
          ['Sales activity (CFA)', d.sales_activity_cfa],
          ['Returns activity (CFA)', d.returns_activity_cfa],
          ['Net sales (CFA)', d.net_sales_cfa],
          ['Transactions', d.transaction_count],
          ['Average sale (CFA)', d.average_sale_cfa],
          ['Gross profit (CFA)', d.gross_profit_cfa],
        ],
      )
      if (d.product_performance.length > 0) {
        downloadCsv(
          `sales-products-${stamp}.csv`,
          ['Product', 'Net pieces', 'Net revenue CFA'],
          d.product_performance.map((p) => [p.name, p.net_pieces, p.net_revenue_cfa]),
        )
      }
    } else if (tab === 'inventory' && inventory.data) {
      const d = inventory.data
      downloadCsv(
        `inventory-report-${stamp}.csv`,
        ['Product', 'Depot id', 'Stock pieces', 'Value CFA'],
        d.current_stock.map((r) => [
          r.name,
          r.depot_id,
          r.current_stock_pieces,
          r.value_cfa ?? 0,
        ]),
      )
    } else if (tab === 'customers' && customers.data) {
      const d = customers.data
      downloadCsv(
        `customers-report-${stamp}.csv`,
        ['Metric', 'Value'],
        [
          ['Global outstanding balance (CFA)', d.outstanding_total_cfa],
          ['Customers with balance', d.outstanding_count],
          ['Credit activity (CFA)', d.credit_activity_cfa],
          ['Payment activity (CFA)', d.payment_activity_cfa],
          ['Unattributed payments (CFA)', d.unattributed_payment_activity_cfa],
        ],
      )
    } else if (tab === 'cash' && cash.data) {
      const d = cash.data
      downloadCsv(
        `cash-closed-shifts-${stamp}.csv`,
        ['Shift', 'Closed', 'Expected', 'Actual', 'Discrepancy'],
        d.closed_shifts.map((s) => [
          s.shift_id,
          s.closed_at ?? '',
          s.expected_cash_cfa ?? '',
          s.actual_cash_cfa ?? '',
          s.discrepancy_cfa ?? '',
        ]),
      )
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-surface flex-shrink-0 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Reports</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Historical analytics by depot and calendar period
          </p>
        </div>
        <ReportToolbar
          preset={preset}
          onPresetChange={setPreset}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
          onExport={handleExport}
          exportDisabled={!activeQuery.data}
        />
        <div className="flex gap-1 border-b border-border -mb-px">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeQuery.isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )}
        {activeQuery.isError && (
          <EmptyState icon={<BarChart2 className="h-8 w-8" />} title="Failed to load report" />
        )}

        {tab === 'sales' && sales.data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <StatCard label="Sales activity" value={formatCFA(Number(sales.data.sales_activity_cfa))} />
              <StatCard label="Returns activity" value={formatCFA(Number(sales.data.returns_activity_cfa))} />
              <StatCard label="Net sales" value={formatCFA(Number(sales.data.net_sales_cfa))} />
              <StatCard label="Transactions" value={String(sales.data.transaction_count)} />
              <StatCard label="Average sale" value={formatCFA(Number(sales.data.average_sale_cfa))} />
              <StatCard label="Gross profit" value={formatCFA(Number(sales.data.gross_profit_cfa))} />
            </div>
            <Card className="p-4">
              <h2 className="text-sm font-semibold mb-3">Product performance</h2>
              {sales.data.product_performance.length === 0 ? (
                <p className="text-sm text-text-muted">No net product sales in this period.</p>
              ) : (
                <ul className="space-y-2">
                  {sales.data.product_performance.map((p) => (
                    <li key={p.product_id} className="flex justify-between text-sm gap-4">
                      <span className="truncate">{p.name}</span>
                      <span className="tabular-nums text-text-secondary shrink-0">
                        {formatPieces(Number(p.net_pieces))} · {formatCFA(Number(p.net_revenue_cfa))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="text-sm font-semibold mb-3">Returns in period</h2>
              {sales.data.returns.length === 0 ? (
                <p className="text-sm text-text-muted">None</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {sales.data.returns.map((r) => (
                    <li key={r.return_id} className="flex justify-between gap-2">
                      <span className="text-text-muted">{formatDateTime(r.created_at)}</span>
                      <span className="tabular-nums">{formatCFA(Number(r.refund_amount_cfa))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {tab === 'inventory' && inventory.data && (
          <div className="space-y-6">
            <StatCard label="Current inventory value" value={formatCFA(Number(inventory.data.inventory_value_cfa))} />
            <Card className="p-4">
              <h2 className="text-sm font-semibold mb-3">Period movement (pieces)</h2>
              {inventory.data.period_movement.length === 0 ? (
                <p className="text-sm text-text-muted">No ledger activity in period.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {inventory.data.period_movement.map((m) => (
                    <li key={m.transaction_type} className="flex justify-between">
                      <span>{m.transaction_type}</span>
                      <span className="tabular-nums">{formatPieces(Number(m.quantity_pieces))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="text-sm font-semibold mb-3">Low stock (≤10 pcs)</h2>
              {inventory.data.low_stock.length === 0 ? (
                <p className="text-sm text-text-muted">None</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {inventory.data.low_stock.map((r) => (
                    <li key={`${r.product_id}-${r.depot_id}`} className="flex justify-between gap-2">
                      <span className="truncate">{r.name}</span>
                      <span className="tabular-nums shrink-0">{formatPieces(Number(r.current_stock_pieces))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="text-sm font-semibold mb-3">Out of stock</h2>
              {inventory.data.out_of_stock.length === 0 ? (
                <p className="text-sm text-text-muted">None</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {inventory.data.out_of_stock.map((r) => (
                    <li key={`${r.product_id}-${r.depot_id}`} className="truncate">
                      {r.name}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {tab === 'customers' && customers.data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatCard
                label="Global outstanding balance"
                value={formatCFA(Number(customers.data.outstanding_total_cfa))}
                description={
                  depotId
                    ? 'Pooled across all depots — not a depot balance'
                    : 'Pooled customer credit — not depot-scoped'
                }
              />
              <StatCard label="Customers with balance" value={String(customers.data.outstanding_count)} />
              <StatCard
                label="Credit activity (period)"
                value={formatCFA(Number(customers.data.credit_activity_cfa))}
              />
              <StatCard
                label={depotId ? 'Depot-attributed payments (period)' : 'Payments (period)'}
                value={formatCFA(Number(customers.data.payment_activity_cfa))}
                description={
                  depotId
                    ? 'Only payments with a shift at this depot. Unattributed payments are listed separately.'
                    : undefined
                }
              />
              <StatCard
                label="Unattributed payments (period)"
                value={formatCFA(Number(customers.data.unattributed_payment_activity_cfa))}
                description="No shift — not assigned to any depot"
              />
            </div>
            <Card className="p-4">
              <h2 className="text-sm font-semibold mb-3">Customers with balance (global pool)</h2>
              <ul className="space-y-2 text-sm">
                {customers.data.customers_with_balance.map((c) => (
                  <li key={c.customer_id} className="flex justify-between">
                    <span>{c.name}</span>
                    <span className="tabular-nums">{formatCFA(Number(c.balance_owed_cfa))}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        {tab === 'cash' && cash.data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard label="Closed — expected total" value={formatCFA(Number(cash.data.closed_expected_total_cfa))} />
              <StatCard label="Closed — actual total" value={formatCFA(Number(cash.data.closed_actual_total_cfa))} />
              <StatCard label="Closed — discrepancy total" value={formatCFA(Number(cash.data.closed_discrepancy_total_cfa))} />
            </div>
            <Card className="p-4">
              <h2 className="text-sm font-semibold mb-3">Open shifts</h2>
              {cash.data.open_shifts.length === 0 ? (
                <p className="text-sm text-text-muted">None</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {cash.data.open_shifts.map((s) => (
                    <li key={s.shift_id}>
                      Opened {formatDateTime(s.opened_at)} · float {formatCFA(Number(s.opening_float_cfa))}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="text-sm font-semibold mb-3">Closed shifts in period</h2>
              {cash.data.closed_shifts.length === 0 ? (
                <p className="text-sm text-text-muted">None</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {cash.data.closed_shifts.map((s) => (
                    <li key={s.shift_id} className="flex flex-wrap justify-between gap-2">
                      <span>{formatDateTime(s.closed_at ?? s.opened_at)}</span>
                      <span className="tabular-nums">
                        exp {formatCFA(Number(s.expected_cash_cfa ?? 0))} · disc{' '}
                        {formatCFA(Number(s.discrepancy_cfa ?? 0))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
