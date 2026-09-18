import { forwardRef } from 'react'
import * as Label from '@radix-ui/react-label'
import { cn } from '@/lib/cn'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
}

/**
 * VHM POS — Select
 *
 * Styled native &lt;select&gt; matching Input / Button visual language.
 * Pages opt in; existing raw selects are not replaced in 13A.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, id, disabled, children, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <Label.Root
            htmlFor={selectId}
            className="text-sm font-medium text-text-primary select-none"
          >
            {label}
          </Label.Root>
        )}
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          className={cn(
            'w-full h-9 px-3 rounded-md border bg-surface text-text-primary text-sm',
            'transition-colors duration-150',
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20'
              : 'border-border focus:border-primary focus:ring-primary/20',
            'focus:outline-none focus:ring-2',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-muted',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        {(error || hint) && (
          <p className={cn('text-xs', error ? 'text-danger' : 'text-text-muted')}>
            {error ?? hint}
          </p>
        )}
      </div>
    )
  },
)

Select.displayName = 'Select'
