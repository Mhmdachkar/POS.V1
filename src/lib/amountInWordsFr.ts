/**
 * French amount-in-words for CFA integers (Soft Gestion style).
 * Example: 360000 -> "trois cent soixante mille (360 000) francs CFA"
 */

const UNITS = [
  'z\u00e9ro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
]

function underThousand(n: number): string {
  if (n < 17) return UNITS[n]!
  if (n < 20) return `dix-${UNITS[n - 10]!}`
  if (n < 70) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    const tensWord = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][tens]!
    if (ones === 0) return tensWord
    if (ones === 1 && tens !== 8) return `${tensWord} et un`
    return `${tensWord}-${UNITS[ones]!}`
  }
  if (n < 80) {
    const rest = n - 60
    if (rest === 11) return 'soixante et onze'
    return `soixante-${underThousand(rest)}`
  }
  if (n < 100) {
    const rest = n - 80
    if (rest === 0) return 'quatre-vingts'
    return `quatre-vingt-${underThousand(rest)}`
  }
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  let head: string
  if (hundreds === 1) head = 'cent'
  else if (rest === 0) head = `${UNITS[hundreds]!} cents`
  else head = `${UNITS[hundreds]!} cent`
  if (rest === 0) return head
  return `${head} ${underThousand(rest)}`
}

function chunkWords(n: number): string {
  if (n === 0) return UNITS[0]!
  if (n < 1000) return underThousand(n)

  const billions = Math.floor(n / 1_000_000_000)
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  const parts: string[] = []

  if (billions > 0) {
    parts.push(billions === 1 ? 'un milliard' : `${underThousand(billions)} milliards`)
  }
  if (millions > 0) {
    parts.push(millions === 1 ? 'un million' : `${underThousand(millions)} millions`)
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mille' : `${underThousand(thousands)} mille`)
  }
  if (rest > 0) parts.push(underThousand(rest))
  return parts.join(' ')
}

/** Grouped fr-FR integer without currency suffix, e.g. "360 000" (regular spaces). */
export function formatCfaGrouped(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })
    .format(Math.round(Math.abs(amount)))
    .replace(/[\u00a0\u202f]/g, ' ')
}

/** Soft Gestion amount in words for CFA. */
export function amountInWordsFrCfa(amount: number): string {
  const rounded = Math.round(amount)
  const abs = Math.abs(rounded)
  const words = chunkWords(abs)
  const grouped = formatCfaGrouped(abs)
  const body = rounded < 0 ? `moins ${words}` : words
  return `${body} (${grouped}) francs CFA`
}

/** Proforma closing line (accented via escapes). */
export function arreteeProformaSentence(amount: number): string {
  return (
    `Arr\u00eat\u00e9e la pr\u00e9sente proforma \u00e0 la somme de : ${amountInWordsFrCfa(amount)}.`
  )
}

/** Releve de compte closing line for the final balance. */
export function releveSoldeSentence(amount: number): string {
  const abs = Math.abs(Math.round(amount))
  return `Arr\u00eat\u00e9 le pr\u00e9sent relev\u00e9 \u00e0 la somme de : ${amountInWordsFrCfa(abs)}.`
}