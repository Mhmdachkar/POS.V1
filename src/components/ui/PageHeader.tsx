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
        'px-3 py-3 sm:px-6 sm:py-4 border-b border-border bg-surface',
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="flex-shrink-0 text-text-secondary">{icon}</div>
        )}
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-text-primary">{title}</h1>
          {description && (
            <div className="text-sm text-text-secondary mt-0.5">{description}</div>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  )
}
