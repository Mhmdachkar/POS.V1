import { formatPieces } from '@/lib/formatters'
import { localizedUnitLabel } from '@/lib/localizedUnits'

/** Frozen sale line unit label, localized for known packing names. */
export function resolvedSaleUnitName(unitName: string | null | undefined, unitLevel: number): string {
  return localizedUnitLabel(unitName, unitLevel)
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
