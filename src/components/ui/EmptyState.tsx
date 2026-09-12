import { cn } from '@/lib/cn'

export interface EmptyStateProps {
  /** Icon element (e.g. a lucide component) */
  icon?: React.ReactNode
  title: string
  description?: string
  /** Primary action button or link */
  action?: React.ReactNode
  className?: string
}

/**
 * VHM POS — EmptyState
 *
 * Displayed when a list or view has no data.
 * Must explain WHAT is empty and WHAT to do next.
 * Never just show "No Data".
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-8 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 p-4 rounded-full bg-surface-muted text-text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-text-secondary max-w-xs mb-5">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  )
}
