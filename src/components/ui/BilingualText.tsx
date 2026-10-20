import { cn } from '@/lib/cn'
import { bilingualAriaLabel, type BilingualPair } from '@/lib/bilingual/types'

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

const variantConfig: Record<BilingualVariant, { fr: string; layout: BilingualLayout }> = {
  heading: {
    fr: 'text-title text-text-primary leading-tight',
    layout: 'stack',
  },
  pageDescription: {
    fr: 'text-sm text-text-secondary leading-snug',
    layout: 'stack',
  },
  nav: {
    fr: 'text-sm font-semibold leading-tight text-inherit',
    layout: 'stack',
  },
  navCollapsed: {
    fr: 'text-[10px] font-semibold leading-tight text-center text-inherit line-clamp-2',
    layout: 'stack',
  },
  navGroup: {
    fr: 'text-[10px] font-bold uppercase tracking-wider text-text-muted',
    layout: 'stack',
  },
  button: {
    fr: 'text-inherit font-medium leading-tight',
    layout: 'stack',
  },
  buttonInline: {
    fr: 'text-inherit font-medium',
    layout: 'inline',
  },
  tableHeader: {
    fr: 'text-xs font-semibold text-text-secondary leading-tight',
    layout: 'stack',
  },
  badge: {
    fr: 'text-xs font-medium leading-tight',
    layout: 'stack',
  },
  body: {
    fr: 'text-sm text-text-primary leading-snug',
    layout: 'stack',
  },
  caption: {
    fr: 'text-xs text-text-secondary leading-snug',
    layout: 'stack',
  },
  toast: {
    fr: 'text-sm font-medium text-inherit leading-snug',
    layout: 'stack',
  },
  filter: {
    fr: 'text-sm font-medium leading-tight',
    layout: 'stack',
  },
  inline: {
    fr: 'text-inherit',
    layout: 'inline',
  },
}

export interface BilingualTextProps extends BilingualPair {
  variant?: BilingualVariant
  layout?: BilingualLayout
  className?: string
  frClassName?: string
  /** Kept for call-site compatibility; English is never rendered. */
  enClassName?: string
  /** When true, sets aria-label on the wrapper (use on interactive parents if needed). */
  ariaLabel?: boolean
  as?: 'span' | 'div' | 'p'
}

/**
 * French-only label primitive (production UI language).
 * `en` on BilingualPair is retained for catalogs/tests but is not shown.
 */
export function BilingualText({
  fr,
  en: _en,
  variant = 'body',
  layout,
  className,
  frClassName,
  ariaLabel = false,
  as: Tag = 'span',
}: BilingualTextProps) {
  const cfg = variantConfig[variant]
  const effectiveLayout = layout ?? cfg.layout

  return (
    <Tag
      className={cn(
        effectiveLayout === 'inline'
          ? 'inline-flex items-baseline'
          : 'inline-flex flex-col items-start',
        className,
      )}
      {...(ariaLabel ? { 'aria-label': bilingualAriaLabel({ fr, en: _en }) } : {})}
    >
      <span className={cn(cfg.fr, frClassName)}>{fr}</span>
    </Tag>
  )
}
