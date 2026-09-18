import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
  className?: string
}

/**
 * VHM POS — PageHeader
 *
 * Shared title / description / actions band for list and admin pages.
 */
export function PageHeader({
  title,
  description,
  actions,
  icon,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'px-6 py-4 border-b border-border bg-surface flex items-center justify-between gap-4',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="flex-shrink-0 text-text-secondary">{icon}</div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-text-primary">{title}</h1>
          {description && (
            <p className="text-sm text-text-secondary mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  )
}
