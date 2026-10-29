import { CUSTOMERS } from '@/lib/bilingual/customers'
import { t } from '@/lib/bilingual/types'
import { clientSoldeKind } from '@/lib/customerAccountBalance'
import { cn } from '@/lib/cn'
import { LedgerSoldeAmount } from './LedgerSoldeAmount'

export function ClientSoldeBlock({
  accountBalanceCfa,
  size = 'medium',
  align = 'right',
  className,
}: {
  accountBalanceCfa: number
  size?: 'small' | 'medium'
  align?: 'left' | 'right'
  className?: string
}) {
  const kind = clientSoldeKind(accountBalanceCfa)
  const label =
    kind === 'due'
      ? CUSTOMERS.outstandingBalance
      : kind === 'credit'
        ? CUSTOMERS.creditInFavor
        : CUSTOMERS.accountSettled
  return (
    <div className={cn(align === 'right' ? 'text-right' : 'text-left', className)}>
      <p className="text-xs text-text-secondary">{t(label)}</p>
      <LedgerSoldeAmount amountCfa={accountBalanceCfa} size={size} />
      {kind === 'credit' && (
        <p className="text-xs text-success-foreground mt-0.5">{t(CUSTOMERS.accountCreditNote)}</p>
      )}
    </div>
  )
}
