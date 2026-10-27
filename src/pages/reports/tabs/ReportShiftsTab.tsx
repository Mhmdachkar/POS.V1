import { useState } from 'react'
import { BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { COMMON } from '@/lib/bilingual/common'
import { SHIFT_STATUS } from '@/lib/bilingual/status'
import { MoneyDisplay } from '@/components/ui'
import { formatCFA, formatDateTime } from '@/lib/formatters'
import type { AdminCashReport, AdminSalesReport } from '@/types/rpc'
import { ShiftDetailDrawer } from '@/pages/shifts/components/ShiftDetailDrawer'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'
import { t } from '@/lib/bilingual/types'


interface ReportShiftsTabProps {
  cash: AdminCashReport
  sales?: AdminSalesReport
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
        <ReportSection title={<BiSectionTitle {...REPORTS.salesWithoutShiftPeriod} />}>
          <p className="text-sm text-text-secondary">
            {t(REPORTS.noShiftCompletedLine(sales.no_shift_count, formatCFA(Number(sales.no_shift_amount_cfa))))}
          </p>
        </ReportSection>
      )}

      <ReportSection title={<BiSectionTitle {...REPORTS.openShifts} />}>
        {cash.open_shifts.length === 0 ? (
          <p className="text-sm text-text-muted">{t(COMMON.none)}</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md text-sm">
            {cash.open_shifts.map((s) => (
              <li key={s.shift_id}>
                <button
                  type="button"
                  onClick={() => setShiftId(s.shift_id)}
                  className="flex w-full flex-wrap justify-between gap-2 px-3 py-2 hover:bg-surface-alt text-left"
                >
                  <span>{s.cashier_name} · {s.depot_name}</span>
                  <span className="text-text-muted">
                    {t(REPORTS.openShiftMeta(formatDateTime(s.opened_at), formatCFA(Number(s.opening_float_cfa))))}
                  </span>
                </button>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cash.closed_shifts.map((s) => (
                  <tr
                    key={s.shift_id}
                    className="hover:bg-surface-alt cursor-pointer"
                    onClick={() => setShiftId(s.shift_id)}
                  >
                    <td className="px-3 py-2">{formatDateTime(s.closed_at ?? s.opened_at)}</td>
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
