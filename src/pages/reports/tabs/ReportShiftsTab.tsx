import { useState } from 'react'
import { BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { COMMON } from '@/lib/bilingual/common'
import { SHIFT_STATUS } from '@/lib/bilingual/status'
import { Button, MoneyDisplay } from '@/components/ui'
import { formatCFA, formatReportDateTime } from '@/lib/formatters'
import { printHtmlDocument } from '@/lib/reportExport'
import type { AdminCashReport, AdminSalesReport, CashShiftReportRow } from '@/types/rpc'
import { ShiftDetailDrawer } from '@/pages/shifts/components/ShiftDetailDrawer'
import { InfoTip } from '../components/InfoTip'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'
import { t } from '@/lib/bilingual/types'


interface ReportShiftsTabProps {
  cash: AdminCashReport
  sales?: AdminSalesReport
}

function printShiftReport(shift: CashShiftReportRow, kind: '80' | '58' | 'A4' | 'X') {
  const title = kind === 'X' ? t(REPORTS.printX) : t(kind === '80' ? REPORTS.printZ80 : kind === '58' ? REPORTS.printZ58 : REPORTS.printZA4)
  const width = kind === '58' ? '58mm' : kind === 'A4' ? '210mm' : '80mm'
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;width:${width};padding:8px;color:#111}h1{font-size:14px;margin:0 0 8px}p{margin:2px 0;font-size:12px}@media print{body{padding:0}}</style></head>
<body>
<h1>${title}</h1>
<p>${t(COMMON.cashier)}: ${shift.cashier_name}</p>
<p>${t(COMMON.depot)}: ${shift.depot_name}</p>
<p>${t(REPORTS.openShifts)}: ${formatReportDateTime(shift.opened_at)}</p>
<p>${t(SHIFT_STATUS.closed)}: ${shift.closed_at ? formatReportDateTime(shift.closed_at) : '—'}</p>
<p>${t(REPORTS.colExpected)}: ${formatCFA(Number(shift.expected_cash_cfa ?? 0))}</p>
<p>${t(REPORTS.colActual)}: ${formatCFA(Number(shift.actual_cash_cfa ?? 0))}</p>
<p>${t(COMMON.discrepancy)}: ${formatCFA(Number(shift.discrepancy_cfa ?? 0))}</p>
</body></html>`
  printHtmlDocument(html)
}

export function ReportShiftsTab({ cash, sales }: ReportShiftsTabProps) {
  const [shiftId, setShiftId] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ReportMetric label={t(REPORTS.closedExpectedTotal)} amount={Number(cash.closed_expected_total_cfa)} />
        <ReportMetric label={t(REPORTS.closedActualTotal)} amount={Number(cash.closed_actual_total_cfa)} />
        <ReportMetric label={t(REPORTS.closedDiscrepancyTotal)} amount={Number(cash.closed_discrepancy_total_cfa)} />
      </div>

      {sales && (sales.no_shift_count > 0 || sales.no_shift_amount_cfa > 0) && (
        <ReportMetric
          label={<span className="inline-flex items-center">{t(REPORTS.salesWithoutShiftPeriod)} <InfoTip text={t(REPORTS.noShiftCompletedLine(sales.no_shift_count, formatCFA(Number(sales.no_shift_amount_cfa))))} /></span>}
          amount={Number(sales.no_shift_amount_cfa)}
        />
      )}

      <ReportSection title={<BiSectionTitle {...REPORTS.openShifts} />}>
        {cash.open_shifts.length === 0 ? (
          <p className="text-sm text-text-muted">{t(COMMON.none)}</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md text-sm">
            {cash.open_shifts.map((s) => (
              <li key={s.shift_id} className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-surface-alt">
                <button
                  type="button"
                  onClick={() => setShiftId(s.shift_id)}
                  className="text-left min-w-0"
                >
                  <span>{s.cashier_name} · {s.depot_name}</span>
                  <span className="ml-2 text-text-muted">
                    {t(REPORTS.openShiftMeta(formatReportDateTime(s.opened_at), formatCFA(Number(s.opening_float_cfa))))}
                  </span>
                </button>
                <Button type="button" size="sm" variant="ghost" onClick={() => printShiftReport(s, 'X')}>
                  {t(REPORTS.printX)}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title={<BiSectionTitle {...REPORTS.closedShiftsInPeriod} />}>
        {cash.closed_shifts.length === 0 ? (
          <p className="text-sm text-text-muted">{t(COMMON.none)}</p>
        ) : (
          <div className="overflow-x-auto border border-border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs text-text-secondary">
                <tr>
                  <th className="text-left px-3 py-2">{t(SHIFT_STATUS.closed)}</th>
                  <th className="text-left px-3 py-2">{t(COMMON.cashier)}</th>
                  <th className="text-left px-3 py-2">{t(COMMON.depot)}</th>
                  <th className="text-right px-3 py-2">{t(REPORTS.colExpected)}</th>
                  <th className="text-right px-3 py-2">{t(REPORTS.colActual)}</th>
                  <th className="text-right px-3 py-2">{t(COMMON.discrepancy)}</th>
                  <th className="text-right px-3 py-2">{t(REPORTS.exportPrintPdf)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cash.closed_shifts.map((s) => (
                  <tr
                    key={s.shift_id}
                    className="hover:bg-surface-alt cursor-pointer"
                    onClick={() => setShiftId(s.shift_id)}
                  >
                    <td className="px-3 py-2">{formatReportDateTime(s.closed_at ?? s.opened_at)}</td>
                    <td className="px-3 py-2">{s.cashier_name}</td>
                    <td className="px-3 py-2">{s.depot_name}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyDisplay amount={s.expected_cash_cfa ?? 0} size="small" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyDisplay amount={s.actual_cash_cfa ?? 0} size="small" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyDisplay amount={s.discrepancy_cfa ?? 0} size="small" danger={(s.discrepancy_cfa ?? 0) !== 0} />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Button type="button" size="sm" variant="ghost" onClick={() => printShiftReport(s, '80')}>{t(REPORTS.printZ80)}</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => printShiftReport(s, '58')}>{t(REPORTS.printZ58)}</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => printShiftReport(s, 'A4')}>{t(REPORTS.printZA4)}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>

      <ShiftDetailDrawer shiftId={shiftId} onClose={() => setShiftId(null)} />
    </div>
  )
}
