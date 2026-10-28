import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { REPORTS } from '@/lib/bilingual/reports'
import { COMMON } from '@/lib/bilingual/common'
import { MoneyDisplay } from '@/components/ui'
import { formatCFA, formatReportDate } from '@/lib/formatters'
import { rpc } from '@/lib/rpc'
import type { AdminCustomersReport } from '@/types/rpc'
import { CustomerDetailDrawer } from '@/pages/customers/components/CustomerDetailDrawer'
import { ReportMetric } from '../components/ReportMetric'
import { InfoTip } from '../components/InfoTip'
import { t } from '@/lib/bilingual/types'

interface ReportCustomersTabProps {
  customers: AdminCustomersReport
  depotScoped: boolean
  depotId: string | null
  endDate: string
}

type AgeRow = {
  customer_id: string
  name: string
  balance_owed_cfa: number
  open_cfa: number
  bucket_0_30: number
  bucket_31_60: number
  bucket_61_90: number
  bucket_90_plus: number
}

function ageLabel(row: AgeRow): string {
  if (Number(row.bucket_90_plus) > 0 || Number(row.bucket_61_90) > 0) return t(REPORTS.age60plus)
  if (Number(row.bucket_31_60) > 0) return t(REPORTS.age31_60)
  return t(REPORTS.age0_30)
}

export function ReportCustomersTab({ customers, depotScoped, depotId, endDate }: ReportCustomersTabProps) {
  const [customerId, setCustomerId] = useState<string | null>(null)
  const ageingQ = useQuery({
    queryKey: ['report-module', 'admin_report_customer_ageing', depotId, endDate],
    queryFn: async () => {
      const result = await rpc.adminReportCustomerAgeing({ p_depot_id: depotId, p_as_of: endDate })
      if (result.error) throw result.error
      return (Array.isArray(result.data) ? result.data : []) as AgeRow[]
    },
  })

  const paidByCustomer = useMemo(() => {
    const map = new Map<string, { paid: number; last: string | null }>()
    for (const p of customers.payments) {
      const cur = map.get(p.customer_id) ?? { paid: 0, last: null }
      cur.paid += Number(p.amount_cfa)
      if (!cur.last || p.recorded_at > cur.last) cur.last = p.recorded_at
      map.set(p.customer_id, cur)
    }
    return map
  }, [customers.payments])

  const rows = useMemo(() => {
    const byId = new Map<string, {
      id: string
      name: string
      credit: number
      paid: number
      balance: number
      last: string | null
      age: string
    }>()
    for (const c of customers.customers_with_balance) {
      const pay = paidByCustomer.get(c.customer_id)
      byId.set(c.customer_id, {
        id: c.customer_id,
        name: c.name,
        credit: Number(c.balance_owed_cfa) + Number(pay?.paid ?? 0),
        paid: Number(pay?.paid ?? 0),
        balance: Number(c.balance_owed_cfa),
        last: pay?.last ?? null,
        age: t(REPORTS.age0_30),
      })
    }
    for (const a of ageingQ.data ?? []) {
      const pay = paidByCustomer.get(a.customer_id)
      const existing = byId.get(a.customer_id)
      byId.set(a.customer_id, {
        id: a.customer_id,
        name: a.name,
        credit: existing?.credit ?? Number(a.open_cfa) + Number(pay?.paid ?? 0),
        paid: existing?.paid ?? Number(pay?.paid ?? 0),
        balance: Number(a.balance_owed_cfa ?? existing?.balance ?? a.open_cfa),
        last: existing?.last ?? pay?.last ?? null,
        age: ageLabel(a),
      })
    }
    return Array.from(byId.values()).sort((a, b) => b.balance - a.balance)
  }, [customers.customers_with_balance, ageingQ.data, paidByCustomer])

  const totals = rows.reduce(
    (s, r) => ({ credit: s.credit + r.credit, paid: s.paid + r.paid, balance: s.balance + r.balance }),
    { credit: 0, paid: 0, balance: 0 },
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ReportMetric
          label={<span className="inline-flex items-center">{t(REPORTS.receivable)}</span>}
          amount={Number(customers.outstanding_total_cfa)}
        />
        <ReportMetric
          label={t(REPORTS.creditGranted)}
          amount={Number(customers.credit_activity_cfa)}
          secondaryText={
            Number(customers.credit_note_activity_cfa ?? 0) > 0
              ? t(REPORTS.creditNoteOfWhich(formatCFA(Number(customers.credit_note_activity_cfa))))
              : undefined
          }
        />
        <ReportMetric label={t(REPORTS.collectedOnReceivables)} amount={Number(customers.payment_activity_cfa)} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{t(REPORTS.noDataPeriod)}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-xs text-text-secondary">
              <tr>
                <th className="px-3 py-2 text-left">{t(COMMON.customer)}</th>
                <th className="px-3 py-2 text-right">{t(REPORTS.modeCredit)}</th>
                <th className="px-3 py-2 text-right">{t(REPORTS.colPaid)}</th>
                <th className="px-3 py-2 text-right">{t(REPORTS.colBalance)}</th>
                <th className="px-3 py-2 text-left">{t(REPORTS.lastPayment)}</th>
                <th className="px-3 py-2 text-left">{t(REPORTS.ageing)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-alt cursor-pointer" onClick={() => setCustomerId(r.id)}>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap"><MoneyDisplay amount={r.credit} size="small" /></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap"><MoneyDisplay amount={r.paid} size="small" /></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap"><MoneyDisplay amount={r.balance} size="small" danger /></td>
                  <td className="px-3 py-2 text-text-muted">{r.last ? formatReportDate(r.last.slice(0, 10)) : '—'}</td>
                  <td className="px-3 py-2">{r.age}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-muted font-semibold">
                <td className="px-3 py-2">{t(COMMON.total)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><MoneyDisplay amount={totals.credit} size="small" /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><MoneyDisplay amount={totals.paid} size="small" /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><MoneyDisplay amount={totals.balance} size="small" danger /></td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <CustomerDetailDrawer customerId={customerId} onClose={() => setCustomerId(null)} />
    </div>
  )
}
