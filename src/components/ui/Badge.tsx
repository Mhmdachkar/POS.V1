import { cn } from '@/lib/cn'
import type { SaleStatus, TransferStatus, StockStatus } from '@/types'

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
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
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

const SALE_STATUS_CONFIG: Record<SaleStatus, { variant: BadgeVariant; label: string }> = {
  completed:         { variant: 'success', label: 'Completed' },
  voided:            { variant: 'neutral', label: 'Voided' },
  partially_returned:{ variant: 'warning', label: 'Partially Returned' },
  returned:          { variant: 'info',    label: 'Returned' },
}

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  const config = SALE_STATUS_CONFIG[status]
  return <Badge variant={config.variant} dot>{config.label}</Badge>
}

const TRANSFER_STATUS_CONFIG: Record<TransferStatus, { variant: BadgeVariant; label: string }> = {
  pending:   { variant: 'warning', label: 'Pending' },
  completed: { variant: 'success', label: 'Completed' },
  cancelled: { variant: 'neutral', label: 'Cancelled' },
}

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const config = TRANSFER_STATUS_CONFIG[status]
  return <Badge variant={config.variant} dot>{config.label}</Badge>
}

const STOCK_STATUS_CONFIG: Record<StockStatus, { variant: BadgeVariant; label: string }> = {
  healthy:      { variant: 'success', label: 'Healthy' },
  low_stock:    { variant: 'warning', label: 'Low Stock' },
  out_of_stock: { variant: 'danger',  label: 'Out of Stock' },
}

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const config = STOCK_STATUS_CONFIG[status]
  return <Badge variant={config.variant} dot>{config.label}</Badge>
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive
    ? <Badge variant="success" dot>Active</Badge>
    : <Badge variant="neutral" dot>Inactive</Badge>
}

export function ShiftStatusBadge({ isOpen }: { isOpen: boolean }) {
  return isOpen
    ? <Badge variant="success" dot>Shift Open</Badge>
    : <Badge variant="neutral" dot>No Shift</Badge>
}
