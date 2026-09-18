/**
 * Phase 18B — pure POS cart stock limits (aligned with complete_sale pieces).
 */

import { describe, expect, it } from 'vitest'
import {
  canAddUnitQuantity,
  cartExceedsKnownStock,
  cartPiecesForProduct,
  isWithinAvailable,
  maxQuantityInUnit,
  onlyAvailableMessage,
  proposedPiecesAfterAdd,
  proposedPiecesAfterSetLine,
  proposedPiecesAfterUnitChange,
  remainingPieces,
} from '@/lib/posCartStock'
import type { CartItem } from '@/types'

function line(
  overrides: Partial<CartItem> & Pick<CartItem, 'product_id' | 'quantity_in_unit' | 'conversion_to_base'>,
): CartItem {
  return {
    product_name: 'Onion',
    product_photo_url: '',
    unit_level: 0,
    unit_name: 'Piece',
    unit_price_cfa: 100,
    cost_price_cfa: 50,
    line_total_cfa: 100,
    ...overrides,
  }
}

describe('posCartStock', () => {
  it('allows add qty 1 when stock is 10', () => {
    expect(canAddUnitQuantity(10, [], 'p1', 0, 1, 1)).toBe(true)
    expect(proposedPiecesAfterAdd([], 'p1', 0, 1, 1)).toBe(1)
    expect(isWithinAvailable(1, 10)).toBe(true)
  })

  it('allows add qty 10 when stock is 10', () => {
    expect(canAddUnitQuantity(10, [], 'p1', 0, 1, 10)).toBe(true)
    expect(isWithinAvailable(10, 10)).toBe(true)
  })

  it('rejects add qty 11 when stock is 10', () => {
    expect(canAddUnitQuantity(10, [], 'p1', 0, 1, 11)).toBe(false)
    expect(isWithinAvailable(11, 10)).toBe(false)
  })

  it('rejects add 4 when cart already has 7 (stock 10)', () => {
    const cart = [line({ product_id: 'p1', quantity_in_unit: 7, conversion_to_base: 1 })]
    expect(proposedPiecesAfterAdd(cart, 'p1', 0, 1, 4)).toBe(11)
    expect(canAddUnitQuantity(10, cart, 'p1', 0, 1, 4)).toBe(false)
  })

  it('allows add 3 when cart already has 7 (stock 10)', () => {
    const cart = [line({ product_id: 'p1', quantity_in_unit: 7, conversion_to_base: 1 })]
    expect(proposedPiecesAfterAdd(cart, 'p1', 0, 1, 3)).toBe(10)
    expect(canAddUnitQuantity(10, cart, 'p1', 0, 1, 3)).toBe(true)
  })

  it('maxQuantityInUnit is 10 at empty cart; 0 when already at max', () => {
    expect(maxQuantityInUnit(10, [], 'p1', 0, 1)).toBe(10)
    const cart = [line({ product_id: 'p1', quantity_in_unit: 10, conversion_to_base: 1 })]
    expect(maxQuantityInUnit(10, cart, 'p1', 0, 1)).toBe(10)
    expect(canAddUnitQuantity(10, cart, 'p1', 0, 1, 1)).toBe(false)
  })

  it('stock 0 cannot add', () => {
    expect(canAddUnitQuantity(0, [], 'p1', 0, 1, 1)).toBe(false)
    expect(maxQuantityInUnit(0, [], 'p1', 0, 1)).toBe(0)
  })

  it('low-stock threshold is irrelevant — only available pieces matter', () => {
    // Helpers never take threshold; selling all 10 is allowed.
    expect(canAddUnitQuantity(10, [], 'p1', 0, 1, 10)).toBe(true)
    expect(canAddUnitQuantity(4, [], 'p1', 0, 1, 4)).toBe(true)
  })

  it('unit conversion: box of 10 pieces, max 10 boxes from 100 stock', () => {
    expect(maxQuantityInUnit(100, [], 'rice', 1, 10)).toBe(10)
    expect(canAddUnitQuantity(100, [], 'rice', 1, 10, 11)).toBe(false)
    expect(canAddUnitQuantity(100, [], 'rice', 1, 10, 10)).toBe(true)
  })

  it('aggregate multi-unit lines share one piece pool', () => {
    const cart = [
      line({ product_id: 'rice', unit_level: 0, quantity_in_unit: 4, conversion_to_base: 1 }),
      line({
        product_id: 'rice',
        unit_level: 1,
        unit_name: 'Box',
        quantity_in_unit: 1,
        conversion_to_base: 10,
      }),
    ]
    expect(cartPiecesForProduct(cart, 'rice')).toBe(14)
    // Other lines = 4 pcs → box line may hold floor(96/10) = 9 boxes absolute
    expect(maxQuantityInUnit(100, cart, 'rice', 1, 10)).toBe(9)
    // Cannot grow the box line past 9 (would be 4 + 90 = 94 ≤ 100; 10 boxes = 104 > 100)
    expect(canAddUnitQuantity(100, cart, 'rice', 1, 10, 9)).toBe(false)
    expect(isWithinAvailable(proposedPiecesAfterSetLine(cart, 'rice', 1, 9), 100)).toBe(true)
    expect(isWithinAvailable(proposedPiecesAfterSetLine(cart, 'rice', 1, 10), 100)).toBe(false)
  })

  it('manual set line quantity respects aggregate', () => {
    const cart = [line({ product_id: 'p1', quantity_in_unit: 7, conversion_to_base: 1 })]
    expect(proposedPiecesAfterSetLine(cart, 'p1', 0, 11)).toBe(11)
    expect(isWithinAvailable(proposedPiecesAfterSetLine(cart, 'p1', 0, 10), 10)).toBe(true)
  })

  it('unit change merge validates total pieces', () => {
    const cart = [
      line({ product_id: 'rice', unit_level: 0, quantity_in_unit: 5, conversion_to_base: 1 }),
      line({
        product_id: 'rice',
        unit_level: 1,
        unit_name: 'Box',
        quantity_in_unit: 9,
        conversion_to_base: 10,
      }),
    ]
    // Change 5 pieces → 5 boxes merged with 9 = 14 boxes = 140 pieces > 100
    const proposed = proposedPiecesAfterUnitChange(
      cart,
      'rice',
      0,
      { unit_level: 1, conversion_to_base: 10 },
      5,
    )
    expect(proposed).toBe(140)
    expect(isWithinAvailable(proposed, 100)).toBe(false)
  })

  it('remainingPieces is derived', () => {
    const cart = [line({ product_id: 'p1', quantity_in_unit: 8, conversion_to_base: 1 })]
    expect(remainingPieces(10, cart, 'p1')).toBe(2)
  })

  it('cartExceedsKnownStock ignores unknown products; flags over-stock', () => {
    const cart = [line({ product_id: 'p1', quantity_in_unit: 11, conversion_to_base: 1 })]
    expect(cartExceedsKnownStock(cart, () => null)).toBe(false)
    expect(cartExceedsKnownStock(cart, (id) => (id === 'p1' ? 10 : null))).toBe(true)
  })

  it('onlyAvailableMessage formats pieces', () => {
    expect(onlyAvailableMessage(10)).toBe('Only 10 available')
    expect(onlyAvailableMessage(4)).toBe('Only 4 available')
  })
})
