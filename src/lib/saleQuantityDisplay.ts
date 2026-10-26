import { formatPieces } from '@/lib/formatters'

const LEVEL_FALLBACK = ['Piece', 'Package', 'Carton'] as const

/** Frozen sale line unit label (from product_units at sale time). */
export function resolvedSaleUnitName(unitName: string | null | undefined, unitLevel: number): string {
  const trimmed = unitName?.trim()
  if (trimmed) return trimmed
  return LEVEL_FALLBACK[unitLevel] ?? 'Piece'
}

/** e.g. "3 Carton" — quantity sold in the unit chosen at checkout. */
export function formatSoldQuantity(
  quantityInUnit: number,
  unitName: string | null | undefined,
  unitLevel: number,
): string {
  const unit = resolvedSaleUnitName(unitName, unitLevel)
  return `${quantityInUnit} ${unit}`
}

/** Sold line with optional piece total when sold above piece level. */
export function formatSoldQuantityDetail(
  quantityInUnit: number,
  unitName: string | null | undefined,
  unitLevel: number,
  quantityPieces: number,
): string {
  const primary = formatSoldQuantity(quantityInUnit, unitName, unitLevel)
  if (unitLevel > 0 && quantityPieces > 0) {
    return `${primary} (${formatPieces(quantityPieces)})`
  }
  return primary
}
