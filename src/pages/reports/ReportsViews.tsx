import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/cn'
import { ReportPageFrame } from './components/ReportPageFrame'
import { ReportSectionState } from './components/ReportSectionState'
import { InfoTip } from './components/InfoTip'
import { ReportRankedTable, type RankedRow } from './components/ReportRankedTable'
import { ReportMetric } from './components/ReportMetric'
import { reportById, type ReportId } from './reportCatalog'
import { useReportSearch } from './useReportSearch'
import {
  useAdminCostReport,
  useCashReport,
  useCustomersReport,
  useInventoryReport,
  useSalesReport,
} from '@/hooks/useReports'
import { ReportReturnsTab } from './tabs/ReportReturnsTab'
import { ReportVoidsTab } from './tabs/ReportVoidsTab'
import { ReportCustomersTab } from './tabs/ReportCustomersTab'
import { ReportShiftsTab } from './tabs/ReportShiftsTab'
import { ReportInventoryTab } from './tabs/ReportInventoryTab'
import { ReportCostTab } from './tabs/ReportCostTab'
import { ReportTransfersTab } from './tabs/ReportTransfersTab'
import { ReportAuditTab } from './tabs/ReportAuditTab'
import { ReportModulePanel } from './components/ReportModulePanel'
import { ReportSection } from './components/ReportSection'
import { MoneyDisplay, PaginationBar } from '@/components/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { COMMON } from '@/lib/bilingual/common'
import { BiModalTitle as BiSectionTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { t } from '@/lib/bilingual/types'
import {
  formatCFA,
  formatCompactMoney,
  formatPercent,
  formatReportPieces,
  formatReportDate,
} from '@/lib/formatters'
import {
  exportReportCsv,
  exportReportPrint,
  exportReportXlsx,
  type ReportTabId,
} from './reportExportHandlers'
import type { AdminSalesReport, InventoryStockRow } from '@/types/rpc'

const LEGACY_TAB: Record<ReportId, ReportTabId> = {
  'sales-summary': 'sales',
  'sales-products': 'products',
  'sales-categories': 'products',
  'sales-cashiers': 'sales',
  'sales-returns': 'returns',
  'sales-voids': 'voids',
  'cash-collections': 'payments',
  'cash-z': 'shifts',
  'customers-receivables': 'customers',
  'stock-inventory': 'inventory',
  'stock-movements': 'inventory',
  'stock-low': 'inventory',
  'stock-cost': 'cost',
  'stock-transfers': 'transfers',
  'control-audit': 'audit',
}

function movementLabel(type: string): string {
  const key: Record<string, typeof REPORTS.moveSale> = {
    SALE: REPORTS.moveSale,
    RETURN: REPORTS.moveReturn,
    RESTOCK: REPORTS.moveRestock,
    ADJUSTMENT: REPORTS.moveAdjustment,
    DAMAGE: REPORTS.moveDamage,
    VOID: REPORTS.moveVoid,
    TRANSFER_IN: REPORTS.moveIn,
    TRANSFER_OUT: REPORTS.moveOut,
  }
  return t(key[type] ?? { fr: type, en: type })
}

function useExport(id: ReportId, extra: Record<string, unknown>) {
  const search = useReportSearch()
  const ctx = {
    tab: LEGACY_TAB[id],
    stamp: `${search.range.startDate}_${search.range.endDate}`,
    startDate: search.range.startDate,
    endDate: search.range.endDate,
    salesFilters: {
      depotId: search.depotId,
      startDate: search.range.startDate,
      endDate: search.range.endDate,
      cashierId: search.cashier || null,
      shiftId: search.service || null,
      categoryId: search.category || null,
      productId: search.product || null,
    },
    ...extra,
  }
  return {
    disabled: extra.sales == null && extra.inventory == null && extra.customers == null && extra.cash == null && extra.cost == null && id !== 'stock-transfers' && id !== 'control-audit',
    csv: () => { void exportReportCsv(ctx as never) },
    xlsx: () => { void exportReportXlsx(ctx as never) },
    print: () => { void exportReportPrint(ctx as never) },
  }
}

function Frame({ id, exp, children }: { id: ReportId; exp: ReturnType<typeof useExport>; children: React.ReactNode }) {
  return (
    <ReportPageFrame
      report={reportById(id)}
      exportDisabled={false}
      onExportCsv={exp.csv}
      onExportXlsx={exp.xlsx}
      onExportPrint={exp.print}
    >
      {children}
    </ReportPageFrame>
  )
}

function SalesKpis({ sales }: { sales: AdminSalesReport }) {
  const net = Number(sales.net_sales_cfa)
  const margin = Number(sales.gross_profit_cfa)
  const marginPct = net === 0 ? null : (margin / net) * 100
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <ReportMetric label={t(REPORTS.grossSales)} amount={Number(sales.sales_activity_cfa)} />
      <ReportMetric label={t(REPORTS.returnsMetric)} amount={-Math.abs(Number(sales.returns_activity_cfa))} danger={Number(sales.returns_activity_cfa) !== 0} />
      <ReportMetric label={t(REPORTS.netSales)} amount={net} emphasis />
      <ReportMetric label={t(REPORTS.cogs)} amount={Number(sales.cogs_cfa)} />
      <ReportMetric
        label={t(REPORTS.grossProfit)}
        amount={margin}
        secondaryText={formatPercent(marginPct)}
      />
    </div>
  )
}

export function SalesSummaryPage() {
  const search = useReportSearch()
  const q = useSalesReport(search.depotId, search.range.startDate, search.range.endDate, true, { p_cashier_id: search.cashier || null })
  const exp = useExport('sales-summary', { sales: q.data })
  const daily = (q.data?.daily_series ?? []).map((d) => ({
    date: formatReportDate(d.date),
    iso: d.date,
    gross: Number(d.sales_activity_cfa),
    returns: Number(d.returns_activity_cfa),
    net: Number(d.net_sales_cfa),
  }))
  return (
    <Frame id="sales-summary" exp={exp}>
      <ReportSectionState isLoading={q.isLoading} isError={q.isError} data={q.data} onRetry={() => { void q.refetch() }}>
        {(sales) => (
          <div className="space-y-6">
            <SalesKpis sales={sales} />
            {daily.length > 1 ? (
              <ReportSection title={<BiSectionTitle {...REPORTS.chartDaily} />}>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis width={80} tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactMoney(Number(v))} />
                      <Tooltip formatter={(v) => formatCFA(Number(v ?? 0))} />
                      <Line type="monotone" dataKey="gross" name={t(REPORTS.chartGross)} stroke="var(--color-primary)" dot={false} />
                      <Line type="monotone" dataKey="returns" name={t(REPORTS.chartReturns)} stroke="var(--color-danger)" dot={false} />
                      <Line type="monotone" dataKey="net" name={t(REPORTS.chartNet)} stroke="var(--color-success)" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ReportSection>
            ) : (
              <p className="text-sm text-text-muted">{t(REPORTS.notEnoughData)}</p>
            )}
            <DailyTable rows={daily} net={Number(sales.net_sales_cfa)} />
          </div>
        )}
      </ReportSectionState>
    </Frame>
  )
}

function DailyTable({ rows, net }: { rows: Array<{ iso: string; date: string; gross: number; returns: number; net: number }>; net: number }) {
  const [page, setPage] = useState(0)
  const pageSize = 25
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const slice = rows.slice(page * pageSize, page * pageSize + pageSize)
  const tot = rows.reduce((s, r) => ({ gross: s.gross + r.gross, returns: s.returns + r.returns, net: s.net + r.net }), { gross: 0, returns: 0, net: 0 })
  if (import.meta.env.DEV && rows.length > 0 && Math.abs(tot.net - net) > 0.51) console.error('[reports] daily net', tot.net, net)
  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-muted text-xs">
          <tr>
            <th className="px-3 py-3 text-left">{t(COMMON.date)}</th>
            <th className="px-3 py-3 text-right">{t(REPORTS.gross)}</th>
            <th className="px-3 py-3 text-right">{t(REPORTS.returnsMetric)}</th>
            <th className="px-3 py-3 text-right">{t(REPORTS.net)}</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((row) => (
            <tr key={row.iso} className="border-t border-border">
              <td className="px-3 py-2">{formatReportDate(row.iso)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCFA(row.gross)}</td>
              <td className={cn('px-3 py-2 text-right tabular-nums', row.returns !== 0 && 'text-danger-foreground')}>{formatCFA(row.returns === 0 ? 0 : -Math.abs(row.returns))}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCFA(row.net)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-surface-muted font-semibold">
            <td className="px-3 py-3">{t(COMMON.total)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{formatCFA(tot.gross)}</td>
            <td className={cn('px-3 py-3 text-right tabular-nums', tot.returns !== 0 && 'text-danger-foreground')}>{formatCFA(tot.returns === 0 ? 0 : -Math.abs(tot.returns))}</td>
            <td className="px-3 py-3 text-right tabular-nums">{formatCFA(tot.net)}</td>
          </tr>
        </tfoot>
      </table>
      <PaginationBar page={page} totalPages={pages} onPageChange={setPage} />
    </div>
  )
}

function RankedPage({ id, rows, net }: { id: ReportId; rows: RankedRow[]; net: number }) {
  const search = useReportSearch()
  const q = useSalesReport(search.depotId, search.range.startDate, search.range.endDate, true, {
    p_cashier_id: search.cashier || null,
    p_category_id: search.category || null,
    p_product_id: search.product || null,
  })
  const exp = useExport(id, { sales: q.data })
  return (
    <Frame id={id} exp={exp}>
      <ReportSectionState isLoading={q.isLoading} isError={q.isError} data={q.data} onRetry={() => { void q.refetch() }}>
        {(sales) => (
          <div className="space-y-6">
            <SalesKpis sales={sales} />
            <ReportRankedTable
              rows={rows.length ? rows : mapRanked(id, sales)}
              netTotal={net || Number(sales.net_sales_cfa)}
              marginTip={id === 'sales-cashiers' ? t(REPORTS.marginShareTip) : undefined}
            />
          </div>
        )}
      </ReportSectionState>
    </Frame>
  )
}

function fitMargin(rows: RankedRow[], target: number): RankedRow[] {
  if (rows.length === 0) return rows
  const sum = rows.reduce((s, r) => s + (r.margin ?? 0), 0)
  const drift = Math.round(target - sum)
  if (drift === 0) return rows
  let idx = 0
  rows.forEach((r, i) => {
    if (Math.abs(r.net) > Math.abs(rows[idx].net)) idx = i
  })
  return rows.map((r, i) => (i === idx ? { ...r, margin: (r.margin ?? 0) + drift } : r))
}

function mapRanked(id: ReportId, sales: AdminSalesReport): RankedRow[] {
  const target = Number(sales.gross_profit_cfa)
  if (id === 'sales-products') {
    return sales.product_performance.map((p) => ({
      id: p.product_id,
      name: p.name,
      gross: Number(p.gross_sales_cfa),
      returns: Number(p.returns_cfa),
      net: Number(p.net_sales_cfa),
      margin: p.gross_profit_cfa == null ? null : Number(p.gross_profit_cfa),
    }))
  }
  if (id === 'sales-categories') {
    const byCat = new Map<string, number>()
    for (const p of sales.product_performance) {
      if (p.gross_profit_cfa == null) continue
      const key = p.category_id ?? 'none'
      byCat.set(key, (byCat.get(key) ?? 0) + Number(p.gross_profit_cfa))
    }
    return fitMargin(sales.by_category.map((c) => {
      const id = c.category_id ?? 'none'
      return {
        id,
        name: c.category_name ?? t(REPORTS.uncategorized),
        gross: Number(c.sales_activity_cfa),
        returns: Number(c.returns_activity_cfa ?? 0),
        net: Number(c.net_sales_cfa ?? c.sales_activity_cfa),
        margin: byCat.get(id) ?? 0,
      }
    }), target)
  }
  const rows = sales.by_cashier.map((c) => ({
    id: c.cashier_id,
    name: c.cashier_name,
    gross: Number(c.sales_activity_cfa),
    returns: Number(c.returns_activity_cfa ?? 0),
    net: Number(c.net_sales_cfa ?? c.sales_activity_cfa),
    margin: 0,
  }))
  const netSum = rows.reduce((s, r) => s + r.net, 0)
  let assigned = 0
  return rows.map((r, i) => {
    if (i === rows.length - 1) return { ...r, margin: target - assigned }
    const share = netSum === 0 ? 0 : Math.round((target * r.net) / netSum)
    assigned += share
    return { ...r, margin: share }
  })
}

export function SalesProductsPage() { return <RankedPage id="sales-products" rows={[]} net={0} /> }
export function SalesCategoriesPage() { return <RankedPage id="sales-categories" rows={[]} net={0} /> }
export function SalesCashiersPage() { return <RankedPage id="sales-cashiers" rows={[]} net={0} /> }

export function SalesReturnsPage() {
  const search = useReportSearch()
  const q = useSalesReport(search.depotId, search.range.startDate, search.range.endDate, true, { p_cashier_id: search.cashier || null, p_shift_id: search.service || null })
  const exp = useExport('sales-returns', { sales: q.data })
  return (
    <Frame id="sales-returns" exp={exp}>
      <ReportSectionState isLoading={q.isLoading} isError={q.isError} data={q.data} onRetry={() => { void q.refetch() }}>
        {(sales) => <ReportReturnsTab sales={sales} />}
      </ReportSectionState>
    </Frame>
  )
}

export function SalesVoidsPage() {
  const search = useReportSearch()
  const q = useSalesReport(search.depotId, search.range.startDate, search.range.endDate, true, { p_cashier_id: search.cashier || null, p_shift_id: search.service || null })
  const exp = useExport('sales-voids', { sales: q.data })
  return (
    <Frame id="sales-voids" exp={exp}>
      <ReportSectionState isLoading={q.isLoading} isError={q.isError} data={q.data} onRetry={() => { void q.refetch() }}>
        {(sales) => (
          <ReportVoidsTab
            sales={sales}
            depotId={search.depotId}
            startDate={search.range.startDate}
            endDate={search.range.endDate}
            cashierId={search.cashier || undefined}
            shiftId={search.service || undefined}
          />
        )}
      </ReportSectionState>
    </Frame>
  )
}

export function CashCollectionsPage() {
  const search = useReportSearch()
  const q = useCustomersReport(search.depotId, search.range.startDate, search.range.endDate)
  const cashQ = useCashReport(search.depotId, search.range.startDate, search.range.endDate)
  const exp = useExport('cash-collections', { customers: q.data, cash: cashQ.data })
  return (
    <Frame id="cash-collections" exp={exp}>
      <ReportSectionState isLoading={q.isLoading} isError={q.isError} data={q.data} onRetry={() => { void q.refetch() }}>
        {() => (
          <div className="space-y-6">
            <ReportModulePanel kind="collections" depotId={search.depotId} startDate={search.range.startDate} endDate={search.range.endDate} cashierId={search.cashier || undefined} />
            {cashQ.data && (
              <ReportMetric
                label={<span className="inline-flex items-center">{t(REPORTS.zExpected)} <InfoTip text={t(REPORTS.zDifference)} /></span>}
                amount={Number(cashQ.data.closed_expected_total_cfa)}
              />
            )}
          </div>
        )}
      </ReportSectionState>
    </Frame>
  )
}

export function CashZPage() {
  const search = useReportSearch()
  const cashQ = useCashReport(search.depotId, search.range.startDate, search.range.endDate)
  const salesQ = useSalesReport(search.depotId, search.range.startDate, search.range.endDate, true)
  const exp = useExport('cash-z', { cash: cashQ.data, sales: salesQ.data })
  return (
    <Frame id="cash-z" exp={exp}>
      <ReportSectionState isLoading={cashQ.isLoading} isError={cashQ.isError} data={cashQ.data} onRetry={() => { void cashQ.refetch() }}>
        {(cash) => (
          <div className="space-y-6">
            <ReportShiftsTab cash={cash} sales={salesQ.data} />
            <ReportModulePanel kind="shifts" depotId={search.depotId} startDate={search.range.startDate} endDate={search.range.endDate} cashierId={search.cashier || undefined} />
          </div>
        )}
      </ReportSectionState>
    </Frame>
  )
}

export function CustomersReceivablesPage() {
  const search = useReportSearch()
  const q = useCustomersReport(search.depotId, search.range.startDate, search.range.endDate)
  const exp = useExport('customers-receivables', { customers: q.data })
  return (
    <Frame id="customers-receivables" exp={exp}>
      <ReportSectionState isLoading={q.isLoading} isError={q.isError} data={q.data} onRetry={() => { void q.refetch() }}>
        {(customers) => (
          <div className="space-y-6">
            <ReportCustomersTab customers={customers} depotScoped={!!search.depotId} />
            <ReportModulePanel kind="ageing" depotId={search.depotId} startDate={search.range.startDate} endDate={search.range.endDate} />
          </div>
        )}
      </ReportSectionState>
    </Frame>
  )
}

function splitTracked(rows: InventoryStockRow[]) {
  return {
    tracked: rows.filter((r) => r.track_low_stock),
    untracked: rows.filter((r) => !r.track_low_stock),
  }
}

export function StockInventoryPage() {
  const search = useReportSearch()
  const q = useInventoryReport(search.depotId, search.range.startDate, search.range.endDate, true, {
    p_category_id: search.category || null,
    p_product_id: search.product || null,
  })
  const exp = useExport('stock-inventory', { inventory: q.data })
  return (
    <Frame id="stock-inventory" exp={exp}>
      <ReportSectionState isLoading={q.isLoading} isError={q.isError} data={q.data} onRetry={() => { void q.refetch() }}>
        {(inventory) => {
          const oos = splitTracked(inventory.current_stock.filter((r) => Number(r.current_stock_pieces) <= 0))
          return (
            <div className="space-y-6">
              <ReportMetric
                label={<BiTableHeader {...REPORTS.currentInventoryValue} />}
                amount={Number(inventory.inventory_value_cfa)}
                secondaryText={(inventory.uncosted_stock_count ?? 0) > 0 ? t(REPORTS.uncostedHint) : undefined}
              />
              <ReportInventoryTab inventory={inventory} showDepotColumn={!search.depotId} />
              <ReportSection title={<span>{t(REPORTS.outOfStock)} — {t(REPORTS.tracked)}</span>}>
                <p className="text-sm tabular-nums">{oos.tracked.length}</p>
              </ReportSection>
              <ReportSection title={<span>{t(REPORTS.outOfStock)} — {t(REPORTS.untracked)}</span>}>
                <p className="text-sm tabular-nums">{oos.untracked.length}</p>
              </ReportSection>
            </div>
          )
        }}
      </ReportSectionState>
    </Frame>
  )
}

export function StockMovementsPage() {
  const search = useReportSearch()
  const q = useInventoryReport(search.depotId, search.range.startDate, search.range.endDate, true, {
    p_category_id: search.category || null,
    p_product_id: search.product || null,
  })
  const exp = useExport('stock-movements', { inventory: q.data })
  return (
    <Frame id="stock-movements" exp={exp}>
      <ReportSectionState isLoading={q.isLoading} isError={q.isError} data={q.data} onRetry={() => { void q.refetch() }}>
        {(inventory) => (
          <div className="space-y-6">
            <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-border">
              {inventory.period_movement.map((m) => (
                <li key={m.transaction_type} className="flex justify-between px-4 py-3 text-sm">
                  <span>{movementLabel(m.transaction_type)}</span>
                  <span className="tabular-nums">{formatReportPieces(Number(m.quantity_pieces))}</span>
                </li>
              ))}
            </ul>
            <ReportModulePanel kind="stock" depotId={search.depotId} startDate={search.range.startDate} endDate={search.range.endDate} />
          </div>
        )}
      </ReportSectionState>
    </Frame>
  )
}

export function StockLowPage() {
  const search = useReportSearch()
  const q = useInventoryReport(search.depotId, search.range.startDate, search.range.endDate, true, {
    p_category_id: search.category || null,
  })
  const exp = useExport('stock-low', { inventory: q.data })
  return (
    <Frame id="stock-low" exp={exp}>
      <ReportSectionState isLoading={q.isLoading} isError={q.isError} data={q.data} onRetry={() => { void q.refetch() }}>
        {(inventory) => {
          const low = splitTracked(inventory.low_stock)
          const oos = splitTracked(inventory.out_of_stock)
          return (
            <div className="grid gap-4 md:grid-cols-2">
              <ReportSection title={<span>{t(REPORTS.lowStock)} — {t(REPORTS.tracked)}</span>}>{low.tracked.length}</ReportSection>
              <ReportSection title={<span>{t(REPORTS.lowStock)} — {t(REPORTS.untracked)}</span>}>{low.untracked.length}</ReportSection>
              <ReportSection title={<span>{t(REPORTS.outOfStock)} — {t(REPORTS.tracked)}</span>}>{oos.tracked.length}</ReportSection>
              <ReportSection title={<span>{t(REPORTS.outOfStock)} — {t(REPORTS.untracked)}</span>}>{oos.untracked.length}</ReportSection>
              <ReportModulePanel kind="low" depotId={search.depotId} startDate={search.range.startDate} endDate={search.range.endDate} />
            </div>
          )
        }}
      </ReportSectionState>
    </Frame>
  )
}

export function StockCostPage() {
  const search = useReportSearch()
  const q = useAdminCostReport({
    p_depot_id: search.depotId,
    p_start_date: search.range.startDate,
    p_end_date: search.range.endDate,
    p_category_id: search.category || null,
    p_product_id: search.product || null,
  })
  const exp = useExport('stock-cost', { cost: q.data })
  return (
    <Frame id="stock-cost" exp={exp}>
      <ReportSectionState isLoading={q.isLoading} isError={q.isError} data={q.data} onRetry={() => { void q.refetch() }}>
        {(cost) => <ReportCostTab cost={cost} showDepotColumn={!search.depotId} />}
      </ReportSectionState>
    </Frame>
  )
}

export function StockTransfersPage() {
  const search = useReportSearch()
  const exp = useExport('stock-transfers', {})
  return (
    <Frame id="stock-transfers" exp={exp}>
      <ReportTransfersTab depotId={search.depotId} />
    </Frame>
  )
}

export function ControlAuditPage() {
  const search = useReportSearch()
  const exp = useExport('control-audit', {})
  return (
    <Frame id="control-audit" exp={exp}>
      <ReportAuditTab depotId={search.depotId} startDate={search.range.startDate} endDate={search.range.endDate} />
    </Frame>
  )
}

