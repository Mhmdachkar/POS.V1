import { MoneyDisplay, Skeleton } from '@/components/ui'
import { BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import type { CustomerActivitySummary } from '@/hooks/useCustomerActivity'
import { t } from '@/lib/bilingual/types'
import { cn } from '@/lib/cn'


function SummaryCell({
  label,
  count,
  totalCfa,
}: {
  label: string
  count: number
  totalCfa: number | null
}) {
  return (
    <div className="px-3 py-2.5 text-center bg-surface">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums text-text-primary">{count}</p>
      <MoneyDisplay
        amount={totalCfa ?? 0}
        size="small"
        className="mt-0.5 text-text-secondary"
      />
    </div>
  )
}

interface CustomerFinancialSummaryProps {
  summary: CustomerActivitySummary | undefined
  isLoading?: boolean
  /** Outstanding balance from customers.balance_owed_cfa — always shown. */
  outstandingBalanceCfa: number
  className?: string
  /** Compact header band (activity page) vs stacked drawer section. */
  layout?: 'drawer' | 'page'
}

/**
 * Sales / Returns / Payments totals + outstanding balance.
 * Amounts are lifetime account totals, not the visible activity page.
 */
export function CustomerFinancialSummary({
  summary,
  isLoading = false,
  outstandingBalanceCfa,
  className,
  layout = 'drawer',
}: CustomerFinancialSummaryProps) {
  const grid = (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-md border border-border bg-border overflow-hidden">
      {isLoading || !summary ? (
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface px-3 py-2.5">
            <Skeleton className="h-14 w-full" />
          </div>
        ))
      ) : (
        <>
          <SummaryCell label={t(CUSTOMERS.activityFilterSales)} count={summary.sales.count} totalCfa={summary.sales.totalCfa} />
          <SummaryCell label={t(CUSTOMERS.activityFilterReturns)} count={summary.returns.count} totalCfa={summary.returns.totalCfa} />
          <SummaryCell label={t(CUSTOMERS.activityFilterPayments)} count={summary.payments.count} totalCfa={summary.payments.totalCfa} />
          <div
            className={cn(
              'px-3 py-2.5 text-center',
              outstandingBalanceCfa > 0 ? 'bg-danger-bg' : 'bg-success-bg',
            )}
          >
            <p
              className={cn(
                'text-[11px] font-semibold uppercase tracking-wide',
                outstandingBalanceCfa > 0 ? 'text-danger-foreground' : 'text-success-foreground',
              )}
            >
              {t(CUSTOMERS.balanceOwed)}
            </p>
            <p className="mt-1 text-base font-semibold tabular-nums text-text-primary">&nbsp;</p>
            <MoneyDisplay
              amount={outstandingBalanceCfa}
              size="small"
              danger={outstandingBalanceCfa > 0}
              className={cn('mt-0.5', outstandingBalanceCfa <= 0 && 'text-success-foreground')}
            />
          </div>
        </>
      )}
    </div>
  )

  if (layout === 'page') {
    return <div className={className}>{grid}</div>
  }

  return (
    <div className={className}>
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
        <BiSectionTitle {...CUSTOMERS.financialSummary} />
      </p>
      {grid}
    </div>
  )
}
