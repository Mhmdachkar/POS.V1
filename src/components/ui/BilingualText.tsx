import { cn } from '@/lib/cn'
import { bilingualAriaLabel, t, type BilingualPair } from '@/lib/bilingual/types'
import { useLocaleStore } from '@/stores/localeStore'

export type BilingualLayout = 'stack' | 'inline'

export type BilingualVariant =
  | 'heading'
  | 'pageDescription'
  | 'nav'
  | 'navCollapsed'
  | 'navGroup'
  | 'button'
  | 'buttonInline'
  | 'tableHeader'
  | 'badge'
  | 'body'
  | 'caption'
  | 'toast'
  | 'filter'
  | 'inline'

const variantConfig: Record<BilingualVariant, { text: string; layout: BilingualLayout }> = {
  heading: {
    text: 'text-title text-text-primary leading-tight',
    layout: 'stack',
  },
  pageDescription: {
    text: 'text-sm text-text-secondary leading-snug',
    layout: 'stack',
  },
  nav: {
    text: 'text-sm font-medium leading-tight text-inherit',
    layout: 'stack',
  },
  navCollapsed: {
    text: 'text-[11px] font-semibold leading-tight text-center text-inherit line-clamp-2',
    layout: 'stack',
  },
  navGroup: {
    text: 'text-[11px] font-medium text-text-muted',
    layout: 'stack',
  },
  button: {
    text: 'text-inherit font-medium leading-tight',
    layout: 'stack',
  },
  buttonInline: {
    text: 'text-inherit font-medium',
    layout: 'inline',
  },
  tableHeader: {
    text: 'text-xs font-semibold text-text-secondary leading-tight',
    layout: 'stack',
  },
  badge: {
    text: 'text-xs font-medium leading-tight',
    layout: 'stack',
  },
  body: {
    text: 'text-sm text-text-primary leading-snug',
    layout: 'stack',
  },
  caption: {
    text: 'text-xs text-text-secondary leading-snug',
    layout: 'stack',
  },
  toast: {
    text: 'text-sm font-medium text-inherit leading-snug',
    layout: 'stack',
  },
  filter: {
    text: 'text-sm font-medium leading-tight',
    layout: 'stack',
  },
  inline: {
    text: 'text-inherit',
    layout: 'inline',
  },
}

export interface BilingualTextProps extends BilingualPair {
  variant?: BilingualVariant
  layout?: BilingualLayout
  className?: string
  frClassName?: string
  /** Kept for call-site compatibility. */
  enClassName?: string
  /** When true, sets aria-label on the wrapper (use on interactive parents if needed). */
  ariaLabel?: boolean
  as?: 'span' | 'div' | 'p'
}

/**
 * Renders the active-locale string from a `{ fr, en }` pair.
 */
export function BilingualText({
  fr,
  en,
  variant = 'body',
  layout,
  className,
  frClassName,
  ariaLabel = false,
  as: Tag = 'span',
}: BilingualTextProps) {
  useLocaleStore((s) => s.locale)
  const cfg = variantConfig[variant]
  const effectiveLayout = layout ?? cfg.layout
  const label = t({ fr, en })

  return (
    <Tag
      className={cn(
        effectiveLayout === 'inline'
          ? 'inline-flex items-baseline'
          : 'inline-flex flex-col items-start',
        className,
      )}
      {...(ariaLabel ? { 'aria-label': bilingualAriaLabel({ fr, en }) } : {})}
    >
      <span className={cn(cfg.text, frClassName)}>{label}</span>
    </Tag>
  )
}
