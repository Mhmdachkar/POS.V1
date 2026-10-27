import { MoneyDisplay } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { t } from '@/lib/bilingual/types'
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
          label={t(REPORTS.attributedPaymentsMetric)}
          amount={Number(customers.payment_activity_cfa)}
          secondaryText={t(REPORTS.paymentCount(customers.payment_activity_count))}
        />
        <ReportMetric
          label={t(REPORTS.unattributedPaymentsMetric)}
          amount={Number(customers.unattributed_payment_activity_cfa)}
          secondaryText={`${customers.unattributed_payment_activity_count} ${t(REPORTS.standaloneUnallocated)}`}
        />
        <ReportMetric
          label={t(REPORTS.reversedPaymentsMetric)}
          amount={Number(customers.reversed_payment_activity_cfa)}
          secondaryText={t(REPORTS.reversedCount(customers.reversed_payment_activity_count))}
          danger={customers.reversed_payment_activity_count > 0}
        />
      </div>

      <ReportSection title={<BiSectionTitle {...REPORTS.attributedPaymentList} />}>
        {customers.payments.length === 0 ? (
          <p className="text-sm text-text-muted">
            <BilingualText {...REPORTS.noneInPeriod} variant="caption" layout="inline" />
          </p>
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
          <BilingualText {...REPORTS.unattributedHint} variant="caption" />
        </p>
        {customers.unattributed_payments.length === 0 ? (
          <p className="text-sm text-text-muted">
            <BilingualText {...REPORTS.noneInPeriod} variant="caption" layout="inline" />
          </p>
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
