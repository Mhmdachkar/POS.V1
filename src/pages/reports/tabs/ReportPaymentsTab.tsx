import { MoneyDisplay } from '@/components/ui'
import { BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { formatDateTime } from '@/lib/formatters'
import type { AdminCustomersReport } from '@/types/rpc'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'

interface ReportPaymentsTabProps {
  customers: AdminCustomersReport
}

export function ReportPaymentsTab({ customers }: ReportPaymentsTabProps) {
  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-3 gap-3">
        <ReportMetric
          label="Paiements rattachés"
          amount={Number(customers.payment_activity_cfa)}
          secondaryText={`${customers.payment_activity_count} paiements`}
        />
        <ReportMetric
          label="Paiements non rattachés"
          amount={Number(customers.unattributed_payment_activity_cfa)}
          secondaryText={`${customers.unattributed_payment_activity_count} autonomes — non alloués aux tickets`}
        />
        <ReportMetric
          label="Annulés (période)"
          amount={Number(customers.reversed_payment_activity_cfa)}
          secondaryText={`${customers.reversed_payment_activity_count} annulés`}
          danger={customers.reversed_payment_activity_count > 0}
        />
      </div>

      <ReportSection title={<BiSectionTitle {...REPORTS.attributedPaymentList} />}>
        {customers.payments.length === 0 ? (
          <p className="text-sm text-text-muted">Aucun sur la période.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md text-sm">
            {customers.payments.map((p) => (
              <li key={p.payment_id} className="flex justify-between gap-2 px-3 py-2">
                <span className="text-text-muted">{formatDateTime(p.recorded_at)}</span>
                <span>{p.cashier_name ?? '—'}</span>
                <MoneyDisplay amount={p.amount_cfa} size="small" />
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title={<BiSectionTitle {...REPORTS.unattributedStandalone} />}>
        <p className="text-xs text-text-muted mb-2">
          Paiements clients autonomes sans service — non alloués aux tickets de vente.
        </p>
        {customers.unattributed_payments.length === 0 ? (
          <p className="text-sm text-text-muted">Aucun sur la période.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md text-sm">
            {customers.unattributed_payments.map((p) => (
              <li key={p.payment_id} className="flex justify-between gap-2 px-3 py-2">
                <span className="text-text-muted">{formatDateTime(p.recorded_at)}</span>
                <MoneyDisplay amount={p.amount_cfa} size="small" />
              </li>
            ))}
          </ul>
        )}
      </ReportSection>
    </div>
  )
}
