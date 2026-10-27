import { Loader2 } from 'lucide-react'
import { COMMON } from '@/lib/bilingual/common'
import { t } from '@/lib/bilingual/types'
import { Button, type ButtonProps } from './Button'
import { cn } from '@/lib/cn'

export interface LoadingButtonProps extends ButtonProps {
  /** When true, shows spinner and disables the button */
  loading?: boolean
  /** Label shown while loading (defaults to children) */
  loadingLabel?: string
}

/**
 * VHM POS — LoadingButton
 *
 * Use for any async action: sale submission, payment recording, restock, etc.
 * The button is automatically disabled while loading to prevent double-submission.
 *
 * IMPORTANT: Backend transactions must also guard against duplicates — the
 * disabled state here is a UX safety measure only, not a security guarantee.
 */
export function LoadingButton({
  loading = false,
  loadingLabel,
  disabled,
  children,
  className,
  size,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      disabled={disabled || loading}
      className={cn('relative', className)}
      size={size}
      {...props}
    >
      {loading && (
        <Loader2
          className={cn(
            'animate-spin flex-shrink-0',
            size === 'xl' ? 'h-5 w-5' : 'h-4 w-4',
          )}
          aria-hidden="true"
        />
      )}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
      {loading && <span className="sr-only">{t(COMMON.processingPleaseWait)}</span>}
    </Button>
  )
}
