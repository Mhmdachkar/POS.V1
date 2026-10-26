/**
 * Guarded POS cart mutations — validate against known stock before store writes.
 * complete_sale remains authoritative; these are UX-only.
 */

import {
  canAddUnitQuantity,
  isWithinAvailable,
  maxQuantityInUnit,
  onlyAvailableMessage,
  proposedPiecesAfterAdd,
  proposedPiecesAfterSetLine,
  proposedPiecesAfterUnitChange,
  remainingPieces,
} from '@/lib/posCartStock'
import { usePOSStore } from '@/stores/posStore'
import type { CartItem } from '@/types'

export type PosCartGuardFail = {
  ok: false
  reason: 'insufficient_stock'
  availablePieces: number
  remainingPieces: number
  message: string
}

export type PosCartGuardOk = { ok: true }

export type PosCartGuardResult = PosCartGuardOk | PosCartGuardFail

function fail(availablePieces: number, items: CartItem[], productId: string): PosCartGuardFail {
  const rem = remainingPieces(availablePieces, items, productId)
  return {
    ok: false,
    reason: 'insufficient_stock',
    availablePieces,
    remainingPieces: rem,
    message: onlyAvailableMessage(availablePieces),
  }
}

export function tryAddCartItem(
  item: Omit<CartItem, 'line_total_cfa'>,
  availablePieces: number | null | undefined,
): PosCartGuardResult {
  const items = usePOSStore.getState().items
  if (availablePieces == null) {
    usePOSStore.getState().addItem(item)
    return { ok: true }
  }
  const proposed = proposedPiecesAfterAdd(
    items,
    item.product_id,
    item.unit_level,
    item.conversion_to_base,
    item.quantity_in_unit,
  )
  if (!isWithinAvailable(proposed, availablePieces)) {
    return fail(availablePieces, items, item.product_id)
  }
  usePOSStore.getState().addItem(item)
  return { ok: true }
}

export function tryUpdateCartQuantity(
  productId: string,
  unitLevel: number,
  qty: number,
  availablePieces: number | null | undefined,
): PosCartGuardResult {
  if (qty <= 0) {
    usePOSStore.getState().removeItem(productId, unitLevel)
    return { ok: true }
  }
  const items = usePOSStore.getState().items
  if (availablePieces == null) {
    usePOSStore.getState().updateQuantity(productId, unitLevel, qty)
    return { ok: true }
  }
  const proposed = proposedPiecesAfterSetLine(items, productId, unitLevel, qty)
  if (!isWithinAvailable(proposed, availablePieces)) {
    const failResult = fail(availablePieces, items, productId)
    const line = items.find((i) => i.product_id === productId && i.unit_level === unitLevel)
    const conversion = line?.conversion_to_base ?? 1
    const maxQty = maxQuantityInUnit(
      availablePieces,
      items,
      productId,
      unitLevel,
      conversion,
    )
    if (maxQty > 0) {
      usePOSStore.getState().updateQuantity(productId, unitLevel, maxQty)
    }
    return failResult
  }
  usePOSStore.getState().updateQuantity(productId, unitLevel, qty)
  return { ok: true }
}

export function tryChangeCartUnit(
  productId: string,
  fromUnitLevel: number,
  toUnit: {
    unit_level: 0 | 1 | 2
    unit_name: string
    unit_price_cfa: number
    cost_price_cfa: number
    conversion_to_base: number
  },
  availablePieces: number | null | undefined,
): PosCartGuardResult {
  const items = usePOSStore.getState().items
  const source = items.find(
    (i) => i.product_id === productId && i.unit_level === fromUnitLevel,
  )
  if (!source) return { ok: true }

  if (availablePieces == null) {
    usePOSStore.getState().changeUnit(productId, fromUnitLevel, toUnit)
    return { ok: true }
  }

  const proposed = proposedPiecesAfterUnitChange(
    items,
    productId,
    fromUnitLevel,
    toUnit,
    source.quantity_in_unit,
  )
  if (!isWithinAvailable(proposed, availablePieces)) {
    return fail(availablePieces, items, productId)
  }
  usePOSStore.getState().changeUnit(productId, fromUnitLevel, toUnit)
  return { ok: true }
}

export function canAddProductUnit(
  productId: string,
  unitLevel: number,
  conversion: number,
  availablePieces: number | null | undefined,
  addQty = 1,
): boolean {
  if (availablePieces == null) return true
  if (availablePieces <= 0) return false
  return canAddUnitQuantity(
    availablePieces,
    usePOSStore.getState().items,
    productId,
    unitLevel,
    conversion,
    addQty,
  )
}
