import { useState } from 'react'
import { BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { MoneyDisplay } from '@/components/ui'
import type { AdminCustomersReport } from '@/types/rpc'
import { CustomerDetailDrawer } from '@/pages/customers/components/CustomerDetailDrawer'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'

interface ReportCustomersTabProps {
  customers: AdminCustomersReport
  depotScoped: boolean
}

export function ReportCustomersTab({ customers, depotScoped }: ReportCustomersTabProps) {
  const [customerId, setCustomerId] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      <p className="text-sm text-text-secondary">
        {REPORTS.balancesGlobalNote.fr}
        {depotScoped && ' Les paiements de période ci-dessous sont attribués via le dépôt du service le cas échéant.'}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <ReportMetric
          label="Solde global dû"
          amount={Number(customers.outstanding_total_cfa)}
          secondaryText={`${customers.outstanding_count} clients`}
        />
        <ReportMetric label="Activité crédit (période)" amount={Number(customers.credit_activity_cfa)} />
        <ReportMetric
          label={depotScoped ? 'Paiements attribués au dépôt (période)' : 'Paiements (période)'}
          amount={Number(customers.payment_activity_cfa)}
        />
        <ReportMetric
          label="Paiements non attribués (période)"
          amount={Number(customers.unattributed_payment_activity_cfa)}
          secondaryText="Sans service — non rattaché à un dépôt"
        />
      </div>

      <ReportSection title={<BiSectionTitle {...REPORTS.customersWithBalance} />}>
        {customers.customers_with_balance.length === 0 ? (
          <p className="text-sm text-text-muted">Aucun client avec solde.</p>
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
