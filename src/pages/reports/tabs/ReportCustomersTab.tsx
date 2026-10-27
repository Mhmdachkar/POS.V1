import { useState } from 'react'
import { BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { MoneyDisplay } from '@/components/ui'
import type { AdminCustomersReport } from '@/types/rpc'
import { CustomerDetailDrawer } from '@/pages/customers/components/CustomerDetailDrawer'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'
import { InfoTip } from '../components/InfoTip'
import { t } from '@/lib/bilingual/types'


interface ReportCustomersTabProps {
  customers: AdminCustomersReport
  depotScoped: boolean
}

export function ReportCustomersTab({ customers, depotScoped }: ReportCustomersTabProps) {
  const [customerId, setCustomerId] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ReportMetric
          label={<span className="inline-flex items-center">{t(REPORTS.receivable)}</span>}
          amount={Number(customers.outstanding_total_cfa)}
        />
        <ReportMetric label={t(REPORTS.creditPeriod)} amount={Number(customers.credit_activity_cfa)} />
        <ReportMetric
          label={t(REPORTS.collected)}
          amount={Number(customers.payment_activity_cfa)}
        />
        <ReportMetric
          label={t(REPORTS.noShiftCash)}
          amount={Number(customers.unattributed_payment_activity_cfa)}
        />
      </div>

      <ReportSection title={<BiSectionTitle {...REPORTS.customersWithBalance} />}>
        {customers.customers_with_balance.length === 0 ? (
          <p className="text-sm text-text-muted">{t(REPORTS.noDataPeriod)}</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md">
            {customers.customers_with_balance.map((c) => (
              <li key={c.customer_id}>
                <button
                  type="button"
                  onClick={() => setCustomerId(c.customer_id)}
                  className="flex w-full justify-between px-3 py-2 text-sm hover:bg-surface-alt"
                >
                  <span>{c.name}</span>
                  <MoneyDisplay amount={c.balance_owed_cfa} size="small" danger />
                </button>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <CustomerDetailDrawer customerId={customerId} onClose={() => setCustomerId(null)} />
    </div>
  )
}
