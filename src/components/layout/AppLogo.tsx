import { cn } from '@/lib/cn'
import { APP_DISPLAY_NAME, APP_LOGO_LETTER } from '@/lib/formatters'

export interface AppLogoProps {
  compact?: boolean
  /** Larger mark for login. */
  size?: 'sm' | 'lg'
  className?: string
}

export function AppLogo({ compact = false, size = 'sm', className }: AppLogoProps) {
  const large = size === 'lg'
  return (
    <div className={cn('flex items-center gap-2 min-w-0', large && 'flex-col gap-3', className)}>
      <div
        className={cn(
          'rounded-md bg-[#111827] flex items-center justify-center flex-shrink-0',
          large ? 'h-10 w-10' : 'h-7 w-7',
        )}
      >
        <span
          className={cn(
            'text-white font-semibold tracking-tight',
            large ? 'text-base' : 'text-[11px]',
          )}
        >
          {APP_LOGO_LETTER}
        </span>
      </div>
      {!compact && (
        <p
          className={cn(
            'font-semibold text-text-primary tracking-tight truncate',
            large ? 'text-2xl font-bold' : 'text-[13px]',
          )}
        >
          {APP_DISPLAY_NAME}
        </p>
      )}
    </div>
  )
}
