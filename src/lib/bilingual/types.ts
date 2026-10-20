/** French / English UI copy pair. `t()` picks the active locale. */
import { useLocaleStore } from '@/stores/localeStore'

export type Locale = 'fr' | 'en'
export type BilingualPair = { fr: string; en: string }

export function bi(fr: string, en: string): BilingualPair {
  return { fr, en }
}

export function currentLocale(): Locale {
  return useLocaleStore.getState().locale
}

/** Active-locale string for placeholders, buttons, and Zod. */
export function t(pair: BilingualPair): string {
  return pair[currentLocale()]
}

/** Accessible label in the active locale. */
export function bilingualAriaLabel(pair: BilingualPair): string {
  return t(pair)
}

/** Plain string for placeholders, Zod, and string-only contexts. */
export function bilingualPlain(pair: BilingualPair): string {
  return t(pair)
}

/** Compact label for receipts/print. */
export function bilingualCompactLabel(pair: BilingualPair): string {
  return t(pair)
}
