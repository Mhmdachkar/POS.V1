import { useQuery } from "@tanstack/react-query"
import { rpc } from "@/lib/rpc"
import { Button, MoneyDisplay } from "@/components/ui"
import { COMMON } from "@/lib/bilingual/common"
import { BiButtonInline, BiModalTitle as BiSectionTitle } from "@/lib/bilingual/ui"
import { REPORTS } from "@/lib/bilingual/reports"
import { formatCFA } from "@/lib/formatters"
import { t } from "@/lib/bilingual/types"
import { ReportMetric } from "./ReportMetric"
import { ReportSection } from "./ReportSection"
import type { AdminCashReport } from "@/types/rpc"

interface ReportModulePanelProps {
  kind: "collections" | "hours" | "shifts" | "ageing" | "stock" | "discounts" | "low"
  depotId: string | null
  startDate: string
  endDate: string
  cashierId?: string
  cash?: AdminCashReport | null
}

export type CollectionsPayload = {
  cash_on_sales_cfa?: number
  credit_cfa?: number
  customer_payments_cfa?: number
  cash_refunds_cfa?: number
  balance_adjustments_cfa?: number
  collected_cfa?: number
  shift_cash_cfa?: number
  no_shift_cash_cfa?: number
}

async function callReport(
  kind: ReportModulePanelProps["kind"],
  depotId: string | null,
  startDate: string,
  endDate: string,
  cashierId?: string,
) {
  const result = await (kind === "low"
    ? rpc.adminReportLowStock({ p_depot_id: depotId })
    : kind === "ageing"
      ? rpc.adminReportCustomerAgeing({ p_depot_id: depotId, p_as_of: endDate })
      : kind === "stock"
        ? rpc.adminReportStockMovements({ p_depot_id: depotId, p_start_date: startDate, p_end_date: endDate })
        : kind === "collections"
          ? rpc.adminReportCollections({ p_depot_id: depotId, p_start_date: startDate, p_end_date: endDate, p_cashier_id: cashierId || null })
          : kind === "hours"
            ? rpc.adminReportSalesByHour({ p_depot_id: depotId, p_start_date: startDate, p_end_date: endDate, p_cashier_id: cashierId || null })
            : kind === "shifts"
              ? rpc.adminReportShiftLines({ p_depot_id: depotId, p_start_date: startDate, p_end_date: endDate, p_cashier_id: cashierId || null })
              : rpc.adminReportDiscounts({ p_depot_id: depotId, p_start_date: startDate, p_end_date: endDate, p_cashier_id: cashierId || null }))
  if (result.error) throw result.error
  return result.data
}

function PaymentModeTable({ data }: { data: CollectionsPayload }) {
  const cashSales = Number(data.cash_on_sales_cfa ?? 0)
  const creditSales = Number(data.credit_cfa ?? 0)
  const payments = Number(data.customer_payments_cfa ?? 0)
  const refunds = Number(data.cash_refunds_cfa ?? 0)
  const balanceAdj = Number(data.balance_adjustments_cfa ?? 0)
  const rows = [
    { mode: REPORTS.modeCash, sales: cashSales, payments, refunds, net: cashSales + payments - refunds },
    { mode: REPORTS.modeMobile, sales: 0, payments: 0, refunds: 0, net: 0 },
    { mode: REPORTS.modeCard, sales: 0, payments: 0, refunds: 0, net: 0 },
    { mode: REPORTS.modeCredit, sales: creditSales, payments: 0, refunds: balanceAdj, net: creditSales - balanceAdj },
  ]
  const tot = rows.reduce(
    (s, r) => ({ sales: s.sales + r.sales, payments: s.payments + r.payments, refunds: s.refunds + r.refunds, net: s.net + r.net }),
    { sales: 0, payments: 0, refunds: 0, net: 0 },
  )
  return (
    <ReportSection title={<BiSectionTitle {...REPORTS.byPaymentMode} />}>
      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs text-text-secondary">
            <tr>
              <th className="px-3 py-2 text-left">{t(REPORTS.colMode)}</th>
              <th className="px-3 py-2 text-right">{t(REPORTS.colSales)}</th>
              <th className="px-3 py-2 text-right">{t(REPORTS.colCustomerPayments)}</th>
              <th className="px-3 py-2 text-right">{t(REPORTS.colRefunds)}</th>
              <th className="px-3 py-2 text-right">{t(REPORTS.colNet)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.mode.fr}>
                <td className="px-3 py-2">{t(row.mode)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums"><MoneyDisplay amount={row.sales} size="small" /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums"><MoneyDisplay amount={row.payments} size="small" /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  <MoneyDisplay amount={row.refunds === 0 ? 0 : -Math.abs(row.refunds)} size="small" danger={row.refunds !== 0} />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums font-medium"><MoneyDisplay amount={row.net} size="small" /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-muted font-semibold">
              <td className="px-3 py-2">{t(COMMON.total)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums"><MoneyDisplay amount={tot.sales} size="small" /></td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums"><MoneyDisplay amount={tot.payments} size="small" /></td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                <MoneyDisplay amount={tot.refunds === 0 ? 0 : -Math.abs(tot.refunds)} size="small" danger={tot.refunds !== 0} />
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums"><MoneyDisplay amount={tot.net} size="small" /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportSection>
  )
}

export function ReportModulePanel({
  kind,
  depotId,
  startDate,
  endDate,
  cashierId,
  cash,
}: ReportModulePanelProps) {
  const name = {
    collections: "admin_report_collections",
    hours: "admin_report_sales_by_hour",
    shifts: "admin_report_shift_lines",
    ageing: "admin_report_customer_ageing",
    stock: "admin_report_stock_movements",
    discounts: "admin_report_discounts",
    low: "admin_report_low_stock",
  }[kind]
  const query = useQuery({
    queryKey: ["report-module", name, depotId, startDate, endDate, cashierId ?? null],
    queryFn: () => callReport(kind, depotId, startDate, endDate, cashierId),
  })
  if (query.isLoading) {
    return <div className="h-24 animate-pulse rounded-2xl bg-surface-muted" />
  }
  if (query.isError) {
    return (
      <div className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border">
        <p className="text-sm text-text-secondary">{t(REPORTS.failedReport)}</p>
        <Button type="button" variant="secondary" className="mt-3" onClick={() => { void query.refetch() }}>
          <BiButtonInline {...COMMON.retry} />
        </Button>
      </div>
    )
  }
  if (!query.data) return null
  const rows = Array.isArray(query.data) ? query.data : query.data
  if (kind === "collections" && rows && typeof rows === "object") {
    const data = rows as CollectionsPayload
    const collected = Number(data.collected_cfa ?? 0)
    const closed = Number(cash?.closed_expected_total_cfa ?? 0)
    const noShift = Number(data.no_shift_cash_cfa ?? 0)
    // Real open-shift expected cash (float + activity), not residual collected − closed − noShift.
    const open = (cash?.open_shifts ?? []).reduce(
      (sum, s) => sum + Number(s.expected_cash_cfa ?? s.opening_float_cfa ?? 0),
      0,
    )
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ReportMetric label={t(REPORTS.cashOnSales)} amount={Number(data.cash_on_sales_cfa ?? 0)} />
          <ReportMetric label={t(REPORTS.customerPaymentsShort)} amount={Number(data.customer_payments_cfa ?? 0)} />
          <ReportMetric
            label={t(REPORTS.cashRefunds)}
            amount={Number(data.cash_refunds_cfa ?? 0) === 0 ? 0 : -Math.abs(Number(data.cash_refunds_cfa ?? 0))}
            danger={Number(data.cash_refunds_cfa ?? 0) !== 0}
          />
          <ReportMetric label={t(REPORTS.collected)} amount={collected} emphasis />
        </div>
        <p className="text-sm text-text-secondary">
          {t(REPORTS.collectionsReconcile(formatCFA(collected), formatCFA(closed), formatCFA(open), formatCFA(noShift)))}
        </p>
        <PaymentModeTable data={data} />
      </div>
    )
  }
  if (!Array.isArray(rows) || rows.length === 0) return null
  const title = {
    hours: REPORTS.salesSummary,
    discounts: REPORTS.discounts,
    shifts: REPORTS.shifts,
    ageing: REPORTS.customers,
    stock: REPORTS.periodMovement,
    low: REPORTS.lowStock,
    collections: REPORTS.collected,
  }[kind]
  return (
    <ReportSection title={<BiSectionTitle {...title} />}>
      <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface-muted text-sm">
        {rows.slice(0, 50).map((row, index) => {
          const record = row as Record<string, unknown>
          const label = String(record.name ?? record.receipt_number ?? record.product_name ?? record.cashier_name ?? record.hour ?? index)
          const amount = Number(record.net_cfa ?? record.final_total_cfa ?? record.open_cfa ?? record.closing_pieces ?? 0)
          return (
            <li key={label + index} className="flex justify-between gap-3 px-3 py-2">
              <span className="truncate">{label}</span>
              {kind === "stock" || kind === "low" || kind === "hours" ? (
                <span className="tabular-nums">{amount}</span>
              ) : (
                <MoneyDisplay amount={amount} size="small" />
              )}
            </li>
          )
        })}
      </ul>
    </ReportSection>
  )
}
