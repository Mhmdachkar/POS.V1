import { clsx } from 'clsx'
import { formatMoney } from '@/lib/formatters'

const sizeClasses = {
  display: 'text-financial-lg financial-value',
  large: 'text-financial-md financial-value',
  medium: 'text-financial-sm financial-value',
  small: 'text-sm financial-value',
} as const

export type MoneyDisplaySize = keyof typeof sizeClasses
export type MoneyDisplayTone = 'default' | 'debt' | 'refund'

export interface MoneyDisplayProps {
  amount: number | null
  size?: MoneyDisplaySize
  /** @deprecated Prefer `tone="debt"`. */
  danger?: boolean
  tone?: MoneyDisplayTone
  className?: string
}

/**
 * VHM POS — MoneyDisplay
 *
 * Canonical CFA rendering via formatMoney.
 * Colour rule: incoming = default, debts/balances due = debt (red), refunds = refund (amber).
 */
export function MoneyDisplay({
  amount,
  size = 'medium',
  danger = false,
  tone = 'default',
  className,
}: MoneyDisplayProps) {
  const resolved = danger ? 'debt' : tone
  return (
    <span
      className={clsx(
        sizeClasses[size],
        'text-right tabular-nums',
        resolved === 'debt' && 'text-danger-foreground',
        resolved === 'refund' && 'text-warning-foreground',
        className,
      )}
    >
      {formatMoney(amount)}
    </span>
  )
}
