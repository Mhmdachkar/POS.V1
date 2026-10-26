import { cn } from '@/lib/cn'
import { APP_DISPLAY_NAME, APP_LOGO_LETTER } from '@/lib/formatters'

export interface AppLogoProps {
  compact?: boolean
  className?: string
}

export function AppLogo({ compact = false, className }: AppLogoProps) {
  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <div className="h-7 w-7 rounded-md bg-[#111827] flex items-center justify-center flex-shrink-0">
        <span className="text-white text-[11px] font-semibold tracking-tight">{APP_LOGO_LETTER}</span>
      </div>
      {!compact && (
        <p className="text-[13px] font-semibold text-text-primary tracking-tight truncate">
          {APP_DISPLAY_NAME}
        </p>
      )}
    </div>
  )
}
