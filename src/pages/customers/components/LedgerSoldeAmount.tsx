import { MoneyDisplay } from '@/components/ui'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { t } from '@/lib/bilingual/types'
import {
  clientSoldeDisplayAmount,
  clientSoldeKind,
} from '@/lib/customerAccountBalance'
import { formatCFA } from '@/lib/formatters'
import { cn } from '@/lib/cn'

export function LedgerSoldeAmount({
  amountCfa,
  variant = 'full',
  size = 'small',
  loading = false,
  className,
}: {
  amountCfa: number
  /** compact: table cell (Avoir X CFA). full: activity/drawer (X CFA en votre faveur). */
  variant?: 'full' | 'compact'
  size?: 'small' | 'medium'
  /** True while ledger solde is still fetching — never show a fake 0 / em dash. */
  loading?: boolean
  className?: string
}) {
  if (loading) {
    return (
      <span
        className={cn(
          'tabular-nums text-text-muted',
          size === 'medium' ? 'text-base' : 'text-sm',
          className,
        )}
        aria-busy="true"
      >
        …
      </span>
    )
  }

  const kind = clientSoldeKind(amountCfa)
  const absLabel = formatCFA(clientSoldeDisplayAmount(amountCfa))

  if (kind === 'due') {
    return (
      <MoneyDisplay
        amount={amountCfa}
        size={size}
        danger
        className={className}
      />
    )
  }

  if (kind === 'credit') {
    const text =
      variant === 'compact'
        ? `${t(CUSTOMERS.avoirPrefix)} ${absLabel}`
        : `${absLabel} ${t(CUSTOMERS.enVotreFaveur)}`
    return (
      <span
        className={cn(
          'tabular-nums text-success-foreground',
          size === 'medium' ? 'text-base' : 'text-sm',
          className,
        )}
      >
        {text}
      </span>
    )
  }

  if (variant === 'compact') {
    return <span className={cn('text-sm text-text-muted', className)}>—</span>
  }

  return <MoneyDisplay amount={0} size={size} className={className} />
}
