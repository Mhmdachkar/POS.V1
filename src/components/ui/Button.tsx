import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/cn'

// ─────────────────────────────────────────────────────────────────
// Variant + size maps
// ─────────────────────────────────────────────────────────────────

const variantClasses = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover ' +
    'shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  secondary:
    'bg-surface text-text-primary border border-border hover:bg-surface-muted active:bg-surface-muted ' +
    'shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  outline:
    'bg-transparent text-text-primary border border-border hover:bg-surface-muted ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  ghost:
    'bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  danger:
    'bg-danger text-white hover:bg-danger/90 active:bg-danger/80 ' +
    'shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2',
} as const

const sizeClasses = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2',
  icon: 'h-9 w-9 p-0',
  'icon-sm': 'h-7 w-7 p-0',
  'icon-lg': 'h-11 w-11 p-0',
} as const

export type ButtonVariant = keyof typeof variantClasses
export type ButtonSize = keyof typeof sizeClasses

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /**
   * When true, renders the button's child as the root element using Radix Slot.
   * Used for wrapping anchor tags or custom components.
   */
  asChild?: boolean
}

/**
 * VHM POS — Button component.
 *
 * All interactive actions should use this component for consistent styling.
 * Use LoadingButton for async actions that need a spinner.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      asChild = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        ref={ref}
        disabled={disabled}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center font-medium rounded-md',
          'transition-colors duration-150',
          'disabled:opacity-50 disabled:pointer-events-none',
          'select-none whitespace-nowrap',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    )
  },
)

Button.displayName = 'Button'
