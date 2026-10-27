import { useQuery } from "@tanstack/react-query"
import { rpc } from "@/lib/rpc"
import { Button } from "@/components/ui"
import { COMMON } from "@/lib/bilingual/common"
import { BiButtonInline } from "@/lib/bilingual/ui"
import { REPORTS } from "@/lib/bilingual/reports"
import { t } from "@/lib/bilingual/types"
import { MoneyDisplay } from "@/components/ui"
import { ReportMetric } from "./ReportMetric"
import { ReportSection } from "./ReportSection"
import { BiModalTitle as BiSectionTitle } from "@/lib/bilingual/ui"

interface ReportModulePanelProps {
  kind: "collections" | "hours" | "shifts" | "ageing" | "stock" | "discounts" | "low"
  depotId: string | null
  startDate: string
  endDate: string
  cashierId?: string
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

export function ReportModulePanel({
  kind,
  depotId,
  startDate,
  endDate,
  cashierId,
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
    const data = rows as Record<string, number>
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ReportMetric label={t(REPORTS.cashOnSales)} amount={Number(data.cash_on_sales_cfa ?? 0)} />
        <ReportMetric label={t(REPORTS.customerPaymentsShort)} amount={Number(data.customer_payments_cfa ?? 0)} />
        <ReportMetric
          label={t(REPORTS.cashRefunds)}
          amount={Number(data.cash_refunds_cfa ?? 0) === 0 ? 0 : -Math.abs(Number(data.cash_refunds_cfa ?? 0))}
          danger={Number(data.cash_refunds_cfa ?? 0) !== 0}
        />
        <ReportMetric label={t(REPORTS.collected)} amount={Number(data.collected_cfa ?? 0)} emphasis />
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
