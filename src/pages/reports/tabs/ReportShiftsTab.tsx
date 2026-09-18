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

interface ReportShiftsTabProps {
  cash: AdminCashReport
  sales?: AdminSalesReport
}

export function ReportShiftsTab({ cash, sales }: ReportShiftsTabProps) {
  const [shiftId, setShiftId] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ReportMetric label="Fermé — total attendu" amount={Number(cash.closed_expected_total_cfa)} />
        <ReportMetric label="Fermé — total réel" amount={Number(cash.closed_actual_total_cfa)} />
        <ReportMetric label="Fermé — écart total" amount={Number(cash.closed_discrepancy_total_cfa)} />
      </div>

      {sales && (sales.no_shift_count > 0 || sales.no_shift_amount_cfa > 0) && (
        <ReportSection title={<BiSectionTitle {...REPORTS.salesWithoutShiftPeriod} />}>
          <p className="text-sm text-text-secondary">
            {sales.no_shift_count} ventes terminées totalisant {formatCFA(Number(sales.no_shift_amount_cfa))} sans service au moment de la vente.
          </p>
        </ReportSection>
      )}

      <ReportSection title={<BiSectionTitle {...REPORTS.openShifts} />}>
        {cash.open_shifts.length === 0 ? (
          <p className="text-sm text-text-muted">{COMMON.none.fr}</p>
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
                    Ouvert {formatDateTime(s.opened_at)} · fond {formatCFA(Number(s.opening_float_cfa))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title={<BiSectionTitle {...REPORTS.closedShiftsInPeriod} />}>
        {cash.closed_shifts.length === 0 ? (
          <p className="text-sm text-text-muted">{COMMON.none.fr}</p>
        ) : (
          <div className="overflow-x-auto border border-border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs text-text-secondary">
                <tr>
                  <th className="text-left px-3 py-2">{SHIFT_STATUS.closed.fr}</th>
                  <th className="text-left px-3 py-2">{COMMON.cashier.fr}</th>
                  <th className="text-left px-3 py-2">{COMMON.depot.fr}</th>
                  <th className="text-right px-3 py-2">Attendu</th>
                  <th className="text-right px-3 py-2">Réel</th>
                  <th className="text-right px-3 py-2">Écart</th>
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
