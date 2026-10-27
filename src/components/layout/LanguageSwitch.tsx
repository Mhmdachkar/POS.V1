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
        compact ? 'h-11' : 'h-11',
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
              'h-10 min-h-[40px] min-w-[44px] px-2.5 rounded text-xs font-semibold tracking-wide',
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
