/** French UI copy pair. `en` retained for catalogs/tests; production UI shows French only. */
export type BilingualPair = { fr: string; en: string }

export function bi(fr: string, en: string): BilingualPair {
  return { fr, en }
}

/** Accessible label — French only (production language). */
export function bilingualAriaLabel({ fr }: BilingualPair): string {
  return fr
}

/** Plain string for placeholders, Zod, and string-only contexts — French only. */
export function bilingualPlain({ fr }: BilingualPair): string {
  return fr
}

/** Compact label for receipts/print — French only. */
export function bilingualCompactLabel({ fr }: BilingualPair): string {
  return fr
}
