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

import { COMMON } from '@/lib/bilingual/common'
import { bi, currentLocale, t } from '@/lib/bilingual/types'
import { localizedUnitLabel } from '@/lib/localizedUnits'

export const DISPLAY_TIME_ZONE = 'Africa/Abidjan'
export const MINUS_SIGN = '\u2212'

function dateLocale(): string {
  return currentLocale() === 'en' ? 'en-GB' : 'fr-FR'
}

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((p) => p.type === type)?.value ?? ''
}

/** Canonical money display: "25 000 CFA" / "−2 000 CFA". */
export function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return '—'
  const rounded = Math.round(amount)
  const grouped = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(rounded))
  const sign = rounded < 0 ? MINUS_SIGN : ''
  return `${sign}${grouped} CFA`
}

/** @deprecated Use formatMoney — kept as an alias for existing call sites. */
export const formatCFA = formatMoney

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

/** Format a quantity with its localized unit name: "24 Pièces" */
export function formatQuantity(qty: number, unitName: string): string {
  const rounded = parseFloat(qty.toFixed(3))
  const unit = localizedUnitLabel(unitName)
  return `${new Intl.NumberFormat('fr-FR').format(rounded)} ${unit}`
}

/** Format a stock quantity in pieces: "124 Pièces" / "1 Pièce". */
export function formatPieces(pieces: number | null | undefined): string {
  if (pieces == null) return '—'
  const rounded = parseFloat(pieces.toFixed(3))
  const unit = Math.abs(rounded) === 1 ? t(COMMON.piece) : t(COMMON.pieces)
  return `${new Intl.NumberFormat('fr-FR').format(rounded)} ${unit}`
}

/** Format a date+time: French "26 oct. 2026, 22:31" (Africa/Abidjan). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parts = new Intl.DateTimeFormat(dateLocale(), {
    timeZone: DISPLAY_TIME_ZONE,
    hourCycle: 'h23',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso))
  const date = `${part(parts, 'day')} ${part(parts, 'month')} ${part(parts, 'year')}`
  const hour = part(parts, 'hour').padStart(2, '0')
  const minute = part(parts, 'minute').padStart(2, '0')
  return `${date}, ${hour}:${minute}`
}

/** Calendar day from YYYY-MM-DD, not a UTC instant. "27 oct. 2026". */
export function formatCalendarDate(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ymd
  return formatDate(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString())
}

/** "27 oct." */
export function formatCalendarDayMonth(ymd: string | null | undefined): string {
  return formatCalendarDate(ymd).replace(/\s+\d{4}$/, '')
}

/** Chart axis: "30 k CFA" or the full amount under 1000. */
export function formatCompactMoney(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  const rounded = Math.round(amount)
  const abs = Math.abs(rounded)
  const sign = rounded < 0 ? MINUS_SIGN : ''
  if (abs >= 1000) {
    const k = abs / 1000
    const body = Number.isInteger(k)
      ? String(k)
      : (Math.round(k * 10) / 10).toString().replace('.', ',')
    return `${sign}${body} k CFA`
  }
  return formatMoney(rounded)
}

/** Format a date only: "26 oct. 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parts = new Intl.DateTimeFormat(dateLocale(), {
    timeZone: DISPLAY_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(new Date(iso))
  return `${part(parts, 'day')} ${part(parts, 'month')} ${part(parts, 'year')}`
}

/** Format a time only: "22:31" */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parts = new Intl.DateTimeFormat(dateLocale(), {
    timeZone: DISPLAY_TIME_ZONE,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso))
  return `${part(parts, 'hour').padStart(2, '0')}:${part(parts, 'minute').padStart(2, '0')}`
}

const RELATIVE = {
  justNow: bi("à l'instant", 'just now'),
  minutesAgo: (n: number) => bi(`il y a ${n} min`, `${n} min ago`),
  hoursAgo: (n: number) => bi(`il y a ${n} h`, `${n}h ago`),
  daysAgo: (n: number) => bi(`il y a ${n} j`, `${n}d ago`),
}

/** Format a relative time in the active locale. */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return t(RELATIVE.justNow)
  if (diffMin < 60) return t(RELATIVE.minutesAgo(diffMin))
  if (diffHr < 24) return t(RELATIVE.hoursAgo(diffHr))
  if (diffDay < 7) return t(RELATIVE.daysAgo(diffDay))
  return formatDate(iso)
}

/** First 8 characters of a UUID, for cashier-facing labels. */
export function formatShortId(id: string | null | undefined): string {
  if (!id) return '—'
  return id.slice(0, 8)
}

/** Parse a raw CFA string input (strips commas/spaces) → number or NaN */
export function parseCFAInput(raw: string): number {
  const cleaned = raw.replace(/[\s,\u00A0\u202F]/g, '')
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
