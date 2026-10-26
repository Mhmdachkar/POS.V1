import { cn } from '@/lib/cn'
import { COMMON } from '@/lib/bilingual/common'
import { t } from '@/lib/bilingual/types'
import { useLocaleStore, type Locale } from '@/stores/localeStore'

const OPTIONS: { id: Locale; label: string }[] = [
  { id: 'fr', label: 'FR' },
  { id: 'en', label: 'EN' },
]

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)

  return (
    <div
      role="group"
      aria-label={t(COMMON.language)}
      data-testid="language-switch"
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-surface p-0.5',
        compact ? 'h-8' : 'h-8',
      )}
    >
      {OPTIONS.map((option) => {
        const active = locale === option.id
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(option.id)}
            className={cn(
              'h-7 min-w-[1.75rem] px-2 rounded text-[11px] font-semibold tracking-wide',
              'transition-colors duration-150',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
