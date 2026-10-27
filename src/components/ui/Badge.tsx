import { cn } from '@/lib/cn'
import { BilingualText } from '@/components/ui/BilingualText'
import { COMMON } from '@/lib/bilingual/common'
import { SALE_STATUS, SHIFT_STATUS, STOCK_STATUS, TRANSFER_STATUS } from '@/lib/bilingual/status'
import type { SaleStatus, TransferStatus, StockStatus, ShiftStatus } from '@/types'

// ─────────────────────────────────────────────────────────────────
// Base badge
// ─────────────────────────────────────────────────────────────────

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success-bg text-success-foreground',
  warning: 'bg-warning-bg text-warning-foreground',
  danger:  'bg-danger-bg text-danger-foreground',
  info:    'bg-info-bg text-info-foreground',
  neutral: 'bg-surface-muted text-text-secondary border border-border',
}

export interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
  /** Adds a colored dot before the label */
  dot?: boolean
}

export function Badge({ variant = 'neutral', children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
        variantClasses[variant],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full flex-shrink-0',
            variant === 'success' && 'bg-success',
            variant === 'warning' && 'bg-warning',
            variant === 'danger'  && 'bg-danger',
            variant === 'info'    && 'bg-info',
            variant === 'neutral' && 'bg-text-muted',
          )}
        />
      )}
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────
// Domain-specific status badges
// ─────────────────────────────────────────────────────────────────

const SALE_STATUS_VARIANT: Record<SaleStatus, BadgeVariant> = {
  completed: 'success',
  voided: 'neutral',
  partially_returned: 'warning',
  returned: 'warning',
}

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  const pair = SALE_STATUS[status]
  return (
    <Badge variant={SALE_STATUS_VARIANT[status]} dot>
      <BilingualText {...pair} variant="badge" enClassName="normal-case" />
    </Badge>
  )
}

const TRANSFER_STATUS_VARIANT: Record<TransferStatus, BadgeVariant> = {
  pending: 'warning',
  completed: 'success',
  cancelled: 'neutral',
}

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const pair = TRANSFER_STATUS[status]
  return (
    <Badge variant={TRANSFER_STATUS_VARIANT[status]} dot>
      <BilingualText {...pair} variant="badge" enClassName="normal-case" />
    </Badge>
  )
}

const STOCK_STATUS_VARIANT: Record<StockStatus, BadgeVariant> = {
  healthy: 'success',
  low_stock: 'warning',
  out_of_stock: 'danger',
}

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const pair = STOCK_STATUS[status]
  return (
    <Badge variant={STOCK_STATUS_VARIANT[status]} dot>
      <BilingualText {...pair} variant="badge" enClassName="normal-case" />
    </Badge>
  )
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  const pair = isActive ? COMMON.active : COMMON.inactive
  return (
    <Badge variant={isActive ? 'success' : 'neutral'} dot>
      <BilingualText {...pair} variant="badge" enClassName="normal-case" />
    </Badge>
  )
}

export function ShiftStatusBadge({ status }: { status: ShiftStatus }) {
  const pair = SHIFT_STATUS[status]
  return (
    <Badge variant={status === 'open' ? 'success' : 'neutral'} dot>
      <BilingualText {...pair} variant="badge" enClassName="normal-case" />
    </Badge>
  )
}

/** Warning-attention badge for sales with shift_id IS NULL. */
export function NoShiftBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={cn('tracking-wide', className)}>
      <BilingualText
        {...COMMON.noShiftBadge}
        variant="badge"
        enClassName="uppercase"
      />
    </Badge>
  )
}
