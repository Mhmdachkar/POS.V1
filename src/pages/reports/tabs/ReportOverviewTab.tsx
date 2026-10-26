import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BiModalTitle as BiSectionTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import type { AdminCustomersReport, AdminInventoryReport, AdminSalesReport } from '@/types/rpc'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'
import { formatCFA, formatPieces } from '@/lib/formatters'
import { t } from '@/lib/bilingual/types'


function cfaTooltipValue(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  return formatCFA(Number.isFinite(n) ? n : 0)
}

interface ReportOverviewTabProps {
  sales: AdminSalesReport
  inventory?: AdminInventoryReport
  customers?: AdminCustomersReport
}

export function ReportOverviewTab({ sales, inventory, customers }: ReportOverviewTabProps) {
  const daily = sales.daily_series.map((d) => ({
    date: d.date.slice(5),
    gross: Number(d.sales_activity_cfa),
    returns: Number(d.returns_activity_cfa),
    net: Number(d.net_sales_cfa),
  }))

  const byDepot = sales.by_depot.map((d) => ({
    name: d.depot_name,
    net: Number(d.net_sales_cfa),
  }))

  const byCategory = sales.by_category.map((c) => ({
    name: c.category_name ?? t(REPORTS.uncategorized),
    gross: Number(c.sales_activity_cfa),
  }))

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <ReportMetric label={<BiTableHeader {...REPORTS.grossSales} />} amount={Number(sales.sales_activity_cfa)} />
        <ReportMetric label={<BiTableHeader {...REPORTS.returnsMetric} />} amount={Number(sales.returns_activity_cfa)} danger />
        <ReportMetric label={<BiTableHeader {...REPORTS.netSales} />} amount={Number(sales.net_sales_cfa)} />
        <ReportMetric label={<BiTableHeader {...REPORTS.cogs} />} amount={Number(sales.cogs_cfa)} />
        <ReportMetric label={<BiTableHeader {...REPORTS.grossProfit} />} amount={Number(sales.gross_profit_cfa)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="uppercase tracking-wide">
            <BiTableHeader {...REPORTS.completedSales} />
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums">{sales.transaction_count}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="uppercase tracking-wide">
            <BiTableHeader {...REPORTS.unitsSold} />
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatPieces(Number(sales.units_sold))}</p>
        </div>
        <ReportMetric label={<BiTableHeader {...REPORTS.averageSale} />} amount={Number(sales.average_sale_cfa)} />
        <ReportMetric
          label={<BiTableHeader {...REPORTS.voided} />}
          amount={Number(sales.voided_amount_cfa)}
          secondaryText={t(REPORTS.voidedCount(sales.voided_count))}
          danger={sales.voided_count > 0}
        />
        <ReportMetric
          label={<BiTableHeader {...REPORTS.noShiftSales} />}
          amount={Number(sales.no_shift_amount_cfa)}
          secondaryText={t(REPORTS.noShiftCount(sales.no_shift_count))}
        />
        {customers && (
          <ReportMetric
            label={<BiTableHeader {...REPORTS.customerPayments} />}
            amount={Number(customers.payment_activity_cfa)}
            secondaryText={t(REPORTS.paymentCount(customers.payment_activity_count))}
          />
        )}
      </div>

      {daily.length > 0 && (
        <ReportSection title={<BiSectionTitle {...REPORTS.dailyTrend} />}>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCFA(v).replace(/\s/g, '')} />
                <Tooltip formatter={cfaTooltipValue} />
                <Legend />
                <Line type="monotone" dataKey="gross" name={t(REPORTS.chartGross)} stroke="var(--color-primary)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="returns" name={t(REPORTS.chartReturns)} stroke="var(--color-danger)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="net" name={t(REPORTS.chartNet)} stroke="var(--color-success)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ReportSection>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {byDepot.length > 0 && (
          <ReportSection title={<BiSectionTitle {...REPORTS.netSalesByDepot} />}>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDepot} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={cfaTooltipValue} />
                  <Bar dataKey="net" fill="var(--color-primary)" name={t(REPORTS.chartNetSalesBar)} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ReportSection>
        )}
        {byCategory.length > 0 && (
          <ReportSection title={<BiSectionTitle {...REPORTS.grossSalesByCategory} />}>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={cfaTooltipValue} />
                  <Bar dataKey="gross" fill="var(--color-primary)" name={t(REPORTS.chartGrossBar)} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ReportSection>
        )}
      </div>

      {inventory && (
        <ReportSection title={<BiSectionTitle {...REPORTS.inventoryAttention} />}>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div className="rounded-lg border border-border bg-surface px-4 py-3">
              <div className="uppercase tracking-wide">
                <BiTableHeader {...REPORTS.lowStock} />
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-warning-foreground">{inventory.low_stock_count}</p>
              <p className="text-xs text-text-muted mt-1">
                <BiTableHeader {...REPORTS.skusBelowThresholdShort} />
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface px-4 py-3">
              <div className="uppercase tracking-wide">
                <BiTableHeader {...REPORTS.outOfStock} />
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-danger-foreground">{inventory.out_of_stock_count}</p>
            </div>
          </div>
        </ReportSection>
      )}
    </div>
  )
}
