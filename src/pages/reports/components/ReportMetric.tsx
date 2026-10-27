import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { MoneyDisplay } from '@/components/ui'

export interface ReportMetricProps {
  label: ReactNode
  amount: number
  secondaryLabel?: string
  secondaryAmount?: number
  secondaryText?: string
  danger?: boolean
  emphasis?: boolean
  className?: string
}

export function ReportMetric({
  label,
  amount,
  secondaryLabel,
  secondaryAmount,
  secondaryText,
  danger,
  emphasis,
  className,
}: ReportMetricProps) {
  return (
    <div className={cn(
      'rounded-2xl bg-surface px-4 py-4 shadow-sm ring-1 ring-border',
      emphasis && 'bg-primary-subtle ring-primary/25',
      className,
    )}>
      <p className={cn(
        'text-xs font-medium text-text-secondary',
        emphasis && 'text-sm text-primary',
      )}>{label}</p>
      <div className="mt-2">
        <MoneyDisplay amount={amount} size={emphasis ? 'large' : 'medium'} danger={danger} />
      </div>
      {(secondaryLabel != null && secondaryAmount != null) && (
        <p className="mt-2 text-xs text-text-muted">
          {secondaryLabel}:{' '}
          <MoneyDisplay amount={secondaryAmount} size="small" className="inline" />
        </p>
      )}
      {secondaryText && (
        <p className="mt-2 text-xs text-text-muted">{secondaryText}</p>
      )}
    </div>
  )
}
