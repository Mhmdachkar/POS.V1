/**
 * VHM POS — Formatting utilities
 *
 * Financial values are always in CFA (canonical currency).
 * USD is displayed for informational purposes only using the
 * exchange rate locked at transaction time.
 *
 * IMPORTANT: These are display-only formatters.
 * All authoritative financial calculations happen server-side.
 */

/** Format a CFA amount for display: "CFA 24,500" */
export function formatCFA(amount: number | null | undefined): string {
  if (amount == null) return 'CFA —'
  return `CFA ${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))}`
}

/** Format a USD amount for display: "$12.50" */
export function formatUSD(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Convert a CFA amount to USD using a given exchange rate.
 * Rate is stored as CFA per 1 USD (e.g. 600 means 1 USD = 600 CFA).
 */
export function cfaToUsd(amountCfa: number, cfaPerUsd: number): number {
  if (cfaPerUsd <= 0) return 0
  return amountCfa / cfaPerUsd
}

/** Format a quantity with its unit name: "24 Pieces" or "2 Cartons" */
export function formatQuantity(qty: number, unitName: string): string {
  const rounded = parseFloat(qty.toFixed(3))
  return `${new Intl.NumberFormat('fr-FR').format(rounded)} ${unitName}${rounded !== 1 ? 's' : ''}`
}

/** Format a stock quantity in pieces: "124 pcs" */
export function formatPieces(pieces: number | null | undefined): string {
  if (pieces == null) return '—'
  const rounded = parseFloat(pieces.toFixed(3))
  return `${new Intl.NumberFormat('fr-FR').format(rounded)} pcs`
}

/** Format a date as a readable string: "11 Sep 2026, 18:42" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Format a date only: "11 Sep 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

/** Format a time only: "18:42" */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Format a relative time: "2 minutes ago" */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDate(iso)
}

/** Parse a raw CFA string input (strips commas/spaces) → number or NaN */
export function parseCFAInput(raw: string): number {
  const cleaned = raw.replace(/[\s,]/g, '')
  return parseFloat(cleaned)
}

/**
 * Group digits with spaces while typing: 40000 → "40 000".
 * Keeps an optional decimal part ungrouped.
 */
export function formatThousandsInput(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  if (trimmed === '-') return '-'
  const negative = trimmed.startsWith('-')
  const cleaned = raw.replace(/[^\d.]/g, '')
  if (cleaned === '' || cleaned === '.') {
    if (cleaned === '.') return negative ? '-0.' : '0.'
    return negative ? '-' : ''
  }
  const dot = cleaned.indexOf('.')
  const intDigits = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/\D/g, '')
  const frac = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\D/g, '')
  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const body = frac == null ? grouped : `${grouped || '0'}.${frac}`
  return negative ? `-${body}` : body
}

/** True when the draft is a minus sign or a parsed negative amount. */
export function isNegativeMoneyDraft(raw: string): boolean {
  const trimmed = raw.trim()
  if (trimmed === '-' || trimmed.startsWith('-')) {
    const n = parseCFAInput(raw)
    return trimmed === '-' || (Number.isFinite(n) && n < 0)
  }
  return false
}

/** Client-visible product name (from env, with a stable fallback). */
export const APP_DISPLAY_NAME =
  import.meta.env.VITE_APP_NAME?.trim() || 'Aquilux POS'

/** Single-letter mark for the logo tile when no custom logo is set. */
export const APP_LOGO_LETTER = APP_DISPLAY_NAME.charAt(0).toUpperCase() || 'A'

/** Receipts and settings fall back to this when business_name is empty. */
export const APP_BUSINESS_FALLBACK = APP_DISPLAY_NAME
