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
  className?: string
}

export function ReportMetric({
  label,
  amount,
  secondaryLabel,
  secondaryAmount,
  secondaryText,
  danger,
  className,
}: ReportMetricProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface px-4 py-3', className)}>
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</p>
      <div className="mt-1">
        <MoneyDisplay amount={amount} size="medium" danger={danger} />
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
