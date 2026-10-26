import { stockHierarchyBreakdown } from '@/hooks/useInventory'
import { bi, type BilingualPair } from '@/lib/bilingual/types'
import { formatPieces } from '@/lib/formatters'

export type UnitLike = {
  unit_level: number
  unit_name: string
  conversion_to_base: number
}

const LEVEL_FALLBACK = ['Piece', 'Package', 'Carton'] as const

function unitName(units: UnitLike[], level: number): string {
  return units.find((u) => u.unit_level === level)?.unit_name ?? LEVEL_FALLBACK[level] ?? 'Piece'
}

/** Human-readable stock total with carton/package breakdown when configured. */
export function formatStockInUnits(pieces: number | null, units: UnitLike[] | null): BilingualPair {
  if (pieces == null) return bi(' ', ' ')
  if (!units?.length || units.length <= 1) {
    return bi(formatPieces(pieces), formatPieces(pieces))
  }
  const breakdown = stockHierarchyBreakdown(pieces, units).filter((r) => r.count > 0)
  if (breakdown.length <= 1 && breakdown[0]?.unit_level === 0) {
    return bi(formatPieces(pieces), formatPieces(pieces))
  }
  const detail = breakdown.map((r) => `${r.count} ${r.unit_name}`).join(', ')
  const text = `${formatPieces(pieces)} (${detail})`
  return bi(text, text)
}

/**
 * Compact single-line unit display for table cells.
 * Returns e.g. "3 Cartons · 2 Paquets · 4 pcs" when higher units exist,
 * or plain "342 pcs" if the product has no higher-level units.
 */
export function formatStockCompact(pieces: number | null, units: UnitLike[] | null): string {
  if (pieces == null) return '—'
  if (!units?.length || units.length <= 1) return formatPieces(pieces)
  const breakdown = stockHierarchyBreakdown(pieces, units).filter((r) => r.count > 0)
  const hasHigher = breakdown.some((r) => r.unit_level > 0)
  if (!hasHigher) return formatPieces(pieces)
  return breakdown
    .map((r) => (r.unit_level === 0 ? `${r.count} pcs` : `${r.count} ${r.unit_name}`))
    .join(' · ')
}

/** Signed delta; prefers cartons/packages when the product has them. */
export function formatDeltaInUnits(piecesDelta: number | null, units: UnitLike[] | null): BilingualPair {
  if (piecesDelta == null || piecesDelta === 0) return bi('0', '0')
  const sign = piecesDelta > 0 ? '+' : '-'
  const abs = Math.abs(piecesDelta)
  if (!units?.length || units.length <= 1) {
    const text = `${sign}${formatPieces(abs)}`
    return bi(text, text)
  }
  const breakdown = stockHierarchyBreakdown(abs, units).filter((r) => r.count > 0)
  const hasHigherUnit = breakdown.some((r) => r.unit_level > 0)
  if (!hasHigherUnit) {
    const text = `${sign}${formatPieces(abs)}`
    return bi(text, text)
  }
  const detail = breakdown.map((r) => `${sign}${r.count} ${r.unit_name}`).join(', ')
  const text = `${detail} (${sign}${formatPieces(abs)} total)`
  return bi(text, text)
}

export function formatStockRangeInUnits(
  before: number | null,
  after: number | null,
  units: UnitLike[] | null,
): BilingualPair {
  const left = formatStockInUnits(before, units)
  const right = formatStockInUnits(after, units)
  return bi(`${left.fr} → ${right.fr}`, `${left.en} → ${right.en}`)
}

/** Restock line: prefer the unit the user entered (+3 Cartons, 18 pieces). */
export function formatRestockAdded(
  after: {
    unit_level?: unknown
    quantity_in_unit?: unknown
    quantity_pieces?: unknown
  },
  units: UnitLike[] | null,
): BilingualPair {
  const level = typeof after.unit_level === 'number' ? after.unit_level : Number(after.unit_level)
  const qtyUnit = typeof after.quantity_in_unit === 'number'
    ? after.quantity_in_unit
    : Number(after.quantity_in_unit)
  const pieces = typeof after.quantity_pieces === 'number'
    ? after.quantity_pieces
    : Number(after.quantity_pieces)
  const name = unitName(units ?? [], level)
  if (Number.isFinite(level) && qtyUnit > 0) {
    const text = `+${qtyUnit} ${name}${Number.isFinite(pieces) ? ` (${formatPieces(pieces)})` : ''}`
    return bi(text, text)
  }
  if (Number.isFinite(pieces)) {
    return formatDeltaInUnits(pieces, units)
  }
  return bi(' ', ' ')
}
