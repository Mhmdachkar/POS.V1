import { MoneyDisplay } from '@/components/ui'
import { BiModalTitle as BiSectionTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { COMMON } from '@/lib/bilingual/common'
import { formatReportDateTime, formatReportPieces } from '@/lib/formatters'
import type { AdminSalesReport } from '@/types/rpc'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'
import { t } from '@/lib/bilingual/types'


interface ReportReturnsTabProps {
  sales: AdminSalesReport
}

export function ReportReturnsTab({ sales }: ReportReturnsTabProps) {
  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-3 gap-3 max-w-3xl">
        <ReportMetric label={<BiTableHeader {...REPORTS.returnsActivity} />} amount={Number(sales.returns_activity_cfa)} />
        <div className="rounded-2xl bg-surface px-4 py-4 shadow-sm ring-1 ring-border">
          <p className="text-xs font-medium text-text-secondary">{t(REPORTS.returnCount)}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{sales.returns.length}</p>
        </div>
        <ReportMetric label={<BiTableHeader {...REPORTS.netAfterReturns} />} amount={Number(sales.net_sales_cfa)} />
      </div>

      <ReportSection title={<BiSectionTitle {...REPORTS.returnDetail} />}>
        {sales.returns.length === 0 ? (
          <p className="text-sm text-text-muted">{t(REPORTS.noReturnsPeriod)}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-surface-muted">
            <table className="w-full text-sm">
              <thead className="text-xs text-text-secondary">
                <tr>
                  <th className="text-left px-3 py-2">{t(REPORTS.colDate)}</th>
                  <th className="text-left px-3 py-2">{t(COMMON.receipt)}</th>
                  <th className="text-left px-3 py-2">{t(COMMON.cashier)}</th>
                  <th className="text-right px-3 py-2">{t(REPORTS.colRefunded)}</th>
                  <th className="text-right px-3 py-2">{t(REPORTS.colCash)}</th>
                  <th className="text-right px-3 py-2">{t(REPORTS.colOffBalance)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sales.returns.map((r) => (
                  <tr key={r.return_id}>
                    <td className="px-3 py-2 text-text-muted">{formatReportDateTime(r.created_at)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.receipt_number}</td>
                    <td className="px-3 py-2">{r.cashier_name}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyDisplay amount={r.refund_amount_cfa} size="small" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyDisplay amount={r.cash_refunded_cfa} size="small" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyDisplay amount={r.balance_adjustment_cfa} size="small" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>

      {sales.returns.some((r) => r.items.length > 0) && (
        <ReportSection title={<BiSectionTitle {...REPORTS.returnedItems} />}>
          <ul className="text-sm space-y-2">
            {sales.returns.flatMap((r) =>
              r.items.map((item) => (
                <li key={`${r.return_id}-${item.product_id}`} className="flex justify-between gap-2">
                  <span>{item.product_name}</span>
                  <span className="tabular-nums text-text-secondary">
                    {formatReportPieces(Number(item.quantity_pieces))} ·{' '}
                    <MoneyDisplay amount={item.refund_amount_cfa} size="small" className="inline" />
                  </span>
                </li>
              )),
            )}
          </ul>
        </ReportSection>
      )}
    </div>
  )
}
