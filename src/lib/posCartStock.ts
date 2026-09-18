/**
 * POS cart stock limits — client UX guard aligned with complete_sale.
 *
 * Conversion: quantity_in_unit × conversion_to_base = pieces (same as RPC).
 * Aggregate: all cart lines for a product_id share one piece pool.
 * Low-stock threshold is NEVER used here.
 *
 * Database complete_sale remains the final authority.
 */

import type { CartItem } from '@/types'

const PIECE_EPS = 0.001

export interface CartLinePieces {
  product_id: string
  unit_level: number
  quantity_in_unit: number
  conversion_to_base: number
}

export function linePieces(item: CartLinePieces): number {
  return item.quantity_in_unit * item.conversion_to_base
}

/** Sum pieces for one product across all cart lines (aggregate rule). */
export function cartPiecesForProduct(
  items: CartLinePieces[],
  productId: string,
): number {
  return items
    .filter((i) => i.product_id === productId)
    .reduce((sum, i) => sum + linePieces(i), 0)
}

/** Pieces from other lines of the same product (exclude this unit line). */
export function otherLinesPieces(
  items: CartLinePieces[],
  productId: string,
  unitLevel: number,
): number {
  return items
    .filter((i) => i.product_id === productId && i.unit_level !== unitLevel)
    .reduce((sum, i) => sum + linePieces(i), 0)
}

/**
 * Total pieces if adding `addQty` of this unit (merge into existing same line).
 */
export function proposedPiecesAfterAdd(
  items: CartLinePieces[],
  productId: string,
  unitLevel: number,
  conversion: number,
  addQty: number,
): number {
  const others = otherLinesPieces(items, productId, unitLevel)
  const existing = items.find(
    (i) => i.product_id === productId && i.unit_level === unitLevel,
  )
  const existingQty = existing?.quantity_in_unit ?? 0
  return others + (existingQty + addQty) * conversion
}

/**
 * Total pieces if setting this line's quantity_in_unit to newQty.
 */
export function proposedPiecesAfterSetLine(
  items: CartLinePieces[],
  productId: string,
  unitLevel: number,
  newQty: number,
): number {
  const line = items.find(
    (i) => i.product_id === productId && i.unit_level === unitLevel,
  )
  const conversion = line?.conversion_to_base ?? 1
  const others = otherLinesPieces(items, productId, unitLevel)
  return others + newQty * conversion
}

/**
 * Total pieces after changeUnit (mirrors posStore merge semantics).
 * Source qty is kept in the target unit (no piece conversion of qty).
 */
export function proposedPiecesAfterUnitChange(
  items: CartLinePieces[],
  productId: string,
  fromLevel: number,
  toUnit: { unit_level: number; conversion_to_base: number },
  sourceQty: number,
): number {
  if (fromLevel === toUnit.unit_level) {
    return cartPiecesForProduct(items, productId)
  }

  const withoutSource = items.filter(
    (i) => !(i.product_id === productId && i.unit_level === fromLevel),
  )
  const target = withoutSource.find(
    (i) => i.product_id === productId && i.unit_level === toUnit.unit_level,
  )
  const mergedQty = (target?.quantity_in_unit ?? 0) + sourceQty
  const others = withoutSource
    .filter(
      (i) =>
        i.product_id === productId && i.unit_level !== toUnit.unit_level,
    )
    .reduce((sum, i) => sum + linePieces(i), 0)

  return others + mergedQty * toUnit.conversion_to_base
}

export function isWithinAvailable(
  proposedTotal: number,
  availablePieces: number,
): boolean {
  return proposedTotal <= availablePieces + PIECE_EPS
}

/**
 * Max integer quantity_in_unit for this line given stock and other lines.
 * Matches CartItem parseInt UI.
 */
export function maxQuantityInUnit(
  availablePieces: number,
  items: CartLinePieces[],
  productId: string,
  unitLevel: number,
  conversion: number,
): number {
  if (conversion <= 0) return 0
  const others = otherLinesPieces(items, productId, unitLevel)
  const remaining = availablePieces - others
  if (remaining <= 0) return 0
  return Math.floor(remaining / conversion + PIECE_EPS)
}

/** Derived remaining pieces (not stored state). */
export function remainingPieces(
  availablePieces: number,
  items: CartLinePieces[],
  productId: string,
): number {
  return Math.max(0, availablePieces - cartPiecesForProduct(items, productId))
}

/** True if +1 of this unit would exceed available stock. */
export function canAddUnitQuantity(
  availablePieces: number,
  items: CartLinePieces[],
  productId: string,
  unitLevel: number,
  conversion: number,
  addQty = 1,
): boolean {
  if (availablePieces <= 0) return false
  const proposed = proposedPiecesAfterAdd(
    items,
    productId,
    unitLevel,
    conversion,
    addQty,
  )
  return isWithinAvailable(proposed, availablePieces)
}

/** Cart exceeds known stock for any product that has a known available count. */
export function cartExceedsKnownStock(
  items: CartItem[],
  getAvailablePieces: (productId: string) => number | null | undefined,
): boolean {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.product_id)) continue
    seen.add(item.product_id)
    const available = getAvailablePieces(item.product_id)
    if (available == null) continue
    if (!isWithinAvailable(cartPiecesForProduct(items, item.product_id), available)) {
      return true
    }
  }
  return false
}

export function onlyAvailableMessage(availablePieces: number): string {
  const n = parseFloat(Number(availablePieces).toFixed(3))
  return `Only ${n} available`
}
