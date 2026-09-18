import { clsx } from 'clsx'
import { formatCFA } from '@/lib/formatters'

const sizeClasses = {
  display: 'text-financial-lg financial-value',
  large: 'text-financial-md financial-value',
  medium: 'text-financial-sm financial-value',
  small: 'text-sm financial-value',
} as const

export type MoneyDisplaySize = keyof typeof sizeClasses

export interface MoneyDisplayProps {
  amount: number | null
  size?: MoneyDisplaySize
  danger?: boolean
  className?: string
}

/**
 * VHM POS — MoneyDisplay
 *
 * Canonical CFA rendering via formatCFA. Size tokens map to existing
 * financial-lg/md/sm utilities (36/28/22px) plus body `text-sm` (14px).
 */
export function MoneyDisplay({
  amount,
  size = 'medium',
  danger = false,
  className,
}: MoneyDisplayProps) {
  return (
    <span
      className={clsx(
        sizeClasses[size],
        danger && 'text-danger-foreground',
        className,
      )}
    >
      {formatCFA(amount)}
    </span>
  )
}
