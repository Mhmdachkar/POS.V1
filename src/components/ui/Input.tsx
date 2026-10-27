import { forwardRef } from 'react'
import * as Label from '@radix-ui/react-label'
import { cn } from '@/lib/cn'

// ─────────────────────────────────────────────────────────────────
// Base input
// ─────────────────────────────────────────────────────────────────

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string
  error?: string
  hint?: string
  /** Renders a prefix element inside the input (e.g. currency symbol) */
  prefix?: React.ReactNode
  /** Renders a suffix element inside the input */
  suffix?: React.ReactNode
}

/**
 * VHM POS — Input component.
 *
 * All text inputs should use this for consistent styling, labels,
 * error states, and accessibility.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, prefix, suffix, id, disabled, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <Label.Root
            htmlFor={inputId}
            className="text-label text-text-primary select-none"
          >
            {label}
          </Label.Root>
        )}

        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-3 text-text-secondary text-sm select-none pointer-events-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              // Base
              'w-full h-11 min-h-[44px] rounded-md border bg-surface text-text-primary text-sm',
              'transition-colors duration-150',
              'placeholder:text-text-muted',
              error ? 'border-danger' : 'border-border',
              // Padding — adjust for prefix/suffix
              prefix ? 'pl-9' : 'pl-3',
              suffix ? 'pr-9' : 'pr-3',
              // Disabled
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-muted',
              className,
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 text-text-secondary text-sm select-none flex items-center">
              {suffix}
            </span>
          )}
        </div>

        {(error || hint) && (
          <p
            className={cn(
              'text-xs',
              error ? 'text-danger-foreground' : 'text-text-muted',
            )}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'

// ─────────────────────────────────────────────────────────────────
// Textarea variant
// ─────────────────────────────────────────────────────────────────

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <Label.Root
            htmlFor={inputId}
            className="text-label text-text-primary select-none"
          >
            {label}
          </Label.Root>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            'w-full rounded-md border bg-surface text-text-primary text-sm px-3 py-2',
            'transition-colors duration-150 resize-none',
            'placeholder:text-text-muted',
            error ? 'border-danger' : 'border-border',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-muted',
            className,
          )}
          {...props}
        />
        {(error || hint) && (
          <p className={cn('text-xs', error ? 'text-danger-foreground' : 'text-text-muted')}>
            {error ?? hint}
          </p>
        )}
      </div>
    )
  },
)

Textarea.displayName = 'Textarea'
