/**
 * Phase 18B — guarded cart mutations against stock.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  canAddProductUnit,
  tryAddCartItem,
  tryChangeCartUnit,
  tryUpdateCartQuantity,
} from '@/lib/posCartActions'
import { usePOSStore } from '@/stores/posStore'

function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    product_id: 'onion',
    product_name: 'Onion',
    product_photo_url: '',
    unit_level: 0 as const,
    unit_name: 'Piece',
    quantity_in_unit: 1,
    unit_price_cfa: 100,
    cost_price_cfa: 40,
    conversion_to_base: 1,
    ...overrides,
  }
}

beforeEach(() => {
  usePOSStore.getState().startNewSale()
})

describe('posCartActions', () => {
  it('allows add within stock', () => {
    const r = tryAddCartItem(baseItem({ quantity_in_unit: 10 }), 10)
    expect(r.ok).toBe(true)
    expect(usePOSStore.getState().items[0].quantity_in_unit).toBe(10)
  })

  it('rejects add above stock', () => {
    const r = tryAddCartItem(baseItem({ quantity_in_unit: 11 }), 10)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toBe('Only 10 available')
    expect(usePOSStore.getState().items).toHaveLength(0)
  })

  it('rejects aggregate overflow on second add', () => {
    tryAddCartItem(baseItem({ quantity_in_unit: 7 }), 10)
    const r = tryAddCartItem(baseItem({ quantity_in_unit: 4 }), 10)
    expect(r.ok).toBe(false)
    expect(usePOSStore.getState().items[0].quantity_in_unit).toBe(7)
  })

  it('allows updateQuantity down at max; rejects increase past max', () => {
    tryAddCartItem(baseItem({ quantity_in_unit: 10 }), 10)
    expect(tryUpdateCartQuantity('onion', 0, 9, 10).ok).toBe(true)
    expect(usePOSStore.getState().items[0].quantity_in_unit).toBe(9)
    expect(tryUpdateCartQuantity('onion', 0, 11, 10).ok).toBe(false)
    expect(usePOSStore.getState().items[0].quantity_in_unit).toBe(9)
  })

  it('remove via qty 0 works at max', () => {
    tryAddCartItem(baseItem({ quantity_in_unit: 10 }), 10)
    expect(tryUpdateCartQuantity('onion', 0, 0, 10).ok).toBe(true)
    expect(usePOSStore.getState().items).toHaveLength(0)
  })

  it('canAddProductUnit false at stock 0', () => {
    expect(canAddProductUnit('onion', 0, 1, 0)).toBe(false)
  })

  it('rejects unit change that exceeds stock after merge', () => {
    tryAddCartItem(baseItem({ quantity_in_unit: 5, conversion_to_base: 1 }), 20)
    tryAddCartItem(
      baseItem({
        unit_level: 1,
        unit_name: 'Box',
        quantity_in_unit: 1,
        conversion_to_base: 10,
        unit_price_cfa: 900,
      }),
      20,
    )
    // 5 pieces + 1 box = 15. Changing 5 pieces → 5 boxes → 60 pieces > 20
    const r = tryChangeCartUnit(
      'onion',
      0,
      {
        unit_level: 1,
        unit_name: 'Box',
        unit_price_cfa: 900,
        cost_price_cfa: 400,
        conversion_to_base: 10,
      },
      20,
    )
    expect(r.ok).toBe(false)
    expect(usePOSStore.getState().items.find((i) => i.unit_level === 0)?.quantity_in_unit).toBe(5)
  })
})
