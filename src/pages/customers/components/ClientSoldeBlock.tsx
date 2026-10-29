import { CUSTOMERS } from '@/lib/bilingual/customers'
import { t } from '@/lib/bilingual/types'
import { clientSoldeKind } from '@/lib/customerAccountBalance'
import { cn } from '@/lib/cn'
import { LedgerSoldeAmount } from './LedgerSoldeAmount'

export function ClientSoldeBlock({
  accountBalanceCfa,
  size = 'medium',
  align = 'right',
  loading = false,
  className,
}: {
  accountBalanceCfa: number
  size?: 'small' | 'medium'
  align?: 'left' | 'right'
  loading?: boolean
  className?: string
}) {
  const kind = loading ? 'settled' : clientSoldeKind(accountBalanceCfa)
  const label = loading
    ? CUSTOMERS.balanceSection
    : kind === 'due'
      ? CUSTOMERS.outstandingBalance
      : kind === 'credit'
        ? CUSTOMERS.creditInFavor
        : CUSTOMERS.accountSettled
  return (
    <div className={cn(align === 'right' ? 'text-right' : 'text-left', className)}>
      <p className="text-xs text-text-secondary">{t(label)}</p>
      <LedgerSoldeAmount amountCfa={accountBalanceCfa} size={size} loading={loading} />
      {!loading && kind === 'credit' && (
        <p className="text-xs text-success-foreground mt-0.5">{t(CUSTOMERS.accountCreditNote)}</p>
      )}
    </div>
  )
}
