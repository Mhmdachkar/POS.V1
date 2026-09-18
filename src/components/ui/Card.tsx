import { cn } from '@/lib/cn'

// ─────────────────────────────────────────────────────────────────
// Card — surface container
// ─────────────────────────────────────────────────────────────────

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** No padding variant — useful when card content manages its own spacing */
  noPadding?: boolean
}

export function Card({ className, noPadding, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface rounded-lg border border-border shadow-sm',
        !noPadding && 'p-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// StatCard — metric display for dashboard and shift panels
// ─────────────────────────────────────────────────────────────────

export interface StatCardProps {
  label: React.ReactNode
  value: string
  /** Optional descriptive text below the value */
  description?: string
  /** Optional icon (lucide component) */
  icon?: React.ReactNode
  className?: string
}

export function StatCard({ label, value, description, icon, className }: StatCardProps) {
  return (
    <Card className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        {icon && (
          <div className="p-2 rounded-md bg-surface-muted text-text-secondary">
            {icon}
          </div>
        )}
      </div>
      <p className="text-financial-sm financial-value text-text-primary">{value}</p>
      {description && (
        <p className="text-xs text-text-muted">{description}</p>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────
// Section — page section with optional title and actions
// ─────────────────────────────────────────────────────────────────

export interface SectionProps {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-4">
          <div>
            {title && <h2 className="text-base font-semibold text-text-primary">{title}</h2>}
            {description && <p className="text-sm text-text-secondary mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
