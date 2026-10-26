/**
 * Unit tests for usePOSStore — POS cart state machine.
 *
 * Tests cart operations, idempotency key lifecycle, and state reset.
 * No Supabase calls — store is pure Zustand state.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { usePOSStore, computeTotals, effectiveFinalTotal } from '@/stores/posStore'
import type { CartItem } from '@/types'

// ─── Fixtures ─────────────────────────────────────────────────────

function makeCartItem(overrides: Partial<Omit<CartItem, 'line_total_cfa'>> = {}): Omit<CartItem, 'line_total_cfa'> {
  return {
    product_id:       'prod-001',
    product_name:     'Water Bottle',
    product_photo_url: '',
    unit_level:       0,
    unit_name:        'Piece',
    quantity_in_unit: 1,
    unit_price_cfa:   350,
    cost_price_cfa:   200,
    conversion_to_base: 1,
    ...overrides,
  }
}

function getStore() {
  return usePOSStore.getState()
}

// Reset store before each test
beforeEach(() => {
  usePOSStore.getState().startNewSale()
})

// ─── computeTotals (pure function) ────────────────────────────────

describe('computeTotals', () => {
  const item1: CartItem = {
    product_id: 'prod-001',
    product_name: 'Water',
    product_photo_url: '',
    unit_level: 0,
    unit_name: 'Piece',
    quantity_in_unit: 10,
    unit_price_cfa: 350,
    cost_price_cfa: 200,
    conversion_to_base: 1,
    line_total_cfa: 3500,
  }
  const item2: CartItem = {
    ...item1,
    product_id: 'prod-002',
    quantity_in_unit: 4,
    unit_price_cfa: 1500,
    line_total_cfa: 6000,
  }

  it('returns zero totals for empty cart', () => {
    const totals = computeTotals([], null, 0, 0)
    expect(totals.subtotal_cfa).toBe(0)
    expect(totals.total_cfa).toBe(0)
    expect(totals.amount_applied_cfa).toBe(0)
    expect(totals.change_given_cfa).toBe(0)
    expect(totals.balance_added_cfa).toBe(0)
  })

  it('computes subtotal from items', () => {
    const totals = computeTotals([item1, item2], null, 0, 0)
    expect(totals.subtotal_cfa).toBe(9500)  // 3500 + 6000
    expect(totals.total_cfa).toBe(9500)
  })

  // ── Scenario A: cash > total → change ─────────────────────────

  it('A: cash > total → correct change, zero balance', () => {
    // 24,500 total, 25,000 tendered
    const items: CartItem[] = [{ ...item1, quantity_in_unit: 70, line_total_cfa: 24500 }]
    const totals = computeTotals(items, null, 0, 25000)

    expect(totals.subtotal_cfa).toBe(24500)
    expect(totals.total_cfa).toBe(24500)
    expect(totals.amount_applied_cfa).toBe(24500)
    expect(totals.change_given_cfa).toBe(500)
    expect(totals.balance_added_cfa).toBe(0)
  })

  // ── Scenario B: cash < total → balance ────────────────────────

  it('B: cash < total → zero change, balance added', () => {
    // 24,500 total, 20,000 tendered
    const items: CartItem[] = [{ ...item1, quantity_in_unit: 70, line_total_cfa: 24500 }]
    const totals = computeTotals(items, null, 0, 20000)

    expect(totals.subtotal_cfa).toBe(24500)
    expect(totals.total_cfa).toBe(24500)
    expect(totals.amount_applied_cfa).toBe(20000)
    expect(totals.change_given_cfa).toBe(0)
    expect(totals.balance_added_cfa).toBe(4500)
  })

  // ── Exact cash ────────────────────────────────────────────────

  it('exact cash → zero change, zero balance', () => {
    const items: CartItem[] = [{ ...item1, quantity_in_unit: 70, line_total_cfa: 24500 }]
    const totals = computeTotals(items, null, 0, 24500)

    expect(totals.change_given_cfa).toBe(0)
    expect(totals.balance_added_cfa).toBe(0)
    expect(totals.amount_applied_cfa).toBe(24500)
  })

  // ── Flat discount ─────────────────────────────────────────────

  it('flat discount reduces total correctly', () => {
    const items: CartItem[] = [{ ...item1, quantity_in_unit: 10, line_total_cfa: 3500 }]
    const totals = computeTotals(items, 'flat', 500, 3000)

    expect(totals.subtotal_cfa).toBe(3500)
    expect(totals.discount_amount_cfa).toBe(500)
    expect(totals.total_cfa).toBe(3000)
    expect(totals.amount_applied_cfa).toBe(3000)
    expect(totals.change_given_cfa).toBe(0)
  })

  it('flat discount capped at subtotal', () => {
    const items: CartItem[] = [{ ...item1, quantity_in_unit: 1, line_total_cfa: 350 }]
    const totals = computeTotals(items, 'flat', 9999, 0)
    // discount capped to subtotal
    expect(totals.discount_amount_cfa).toBe(350) // min(9999, 350)
    expect(totals.total_cfa).toBe(0)
  })

  // ── Percent discount ──────────────────────────────────────────

  it('percent discount computes correctly', () => {
    const items: CartItem[] = [{ ...item1, quantity_in_unit: 10, line_total_cfa: 3500 }]
    const totals = computeTotals(items, 'percent', 10, 3500)

    expect(totals.discount_amount_cfa).toBe(350) // 10% of 3500 = 350
    expect(totals.total_cfa).toBe(3150)
    expect(totals.amount_applied_cfa).toBe(3150)
    expect(totals.change_given_cfa).toBe(350)
  })

  it('B2: percent preview clamps to 0–100 so a negative % cannot raise the total', () => {
    const items: CartItem[] = [{ ...item1, quantity_in_unit: 10, line_total_cfa: 10000 }]
    expect(computeTotals(items, 'percent', -10, 0).total_cfa).toBe(10000)
    expect(computeTotals(items, 'percent', 150, 0).total_cfa).toBe(0)
    expect(computeTotals(items, 'percent', 100, 0).total_cfa).toBe(0)
  })

  it('B3: out-of-range override is ignored by effectiveFinalTotal', () => {
    expect(effectiveFinalTotal(10000, 99999)).toBe(10000)
    expect(effectiveFinalTotal(10000, 0)).toBe(10000)
    expect(effectiveFinalTotal(10000, -100)).toBe(10000)
    expect(effectiveFinalTotal(10000, 9000)).toBe(9000)
  })
})

// ─── addItem ──────────────────────────────────────────────────────

describe('addItem', () => {
  it('adds a new item to the cart', () => {
    getStore().addItem(makeCartItem())
    const { items } = getStore()
    expect(items).toHaveLength(1)
    expect(items[0].product_id).toBe('prod-001')
    expect(items[0].quantity_in_unit).toBe(1)
    expect(items[0].line_total_cfa).toBe(350) // 1 × 350
  })

  it('merges quantities for same product+unit', () => {
    getStore().addItem(makeCartItem({ quantity_in_unit: 3 }))
    getStore().addItem(makeCartItem({ quantity_in_unit: 2 }))
    const { items } = getStore()
    expect(items).toHaveLength(1)
    expect(items[0].quantity_in_unit).toBe(5)    // merged: 3 + 2
    expect(items[0].line_total_cfa).toBe(1750)   // 5 × 350
  })

  it('keeps distinct lines for same product different units', () => {
    getStore().addItem(makeCartItem({ unit_level: 0, unit_price_cfa: 350, quantity_in_unit: 2 }))
    getStore().addItem(makeCartItem({ unit_level: 1, unit_price_cfa: 2100, quantity_in_unit: 1 }))
    const { items } = getStore()
    expect(items).toHaveLength(2)
  })

  it('updates totals after addItem', () => {
    getStore().addItem(makeCartItem({ quantity_in_unit: 2, unit_price_cfa: 500 }))
    const { totals } = getStore()
    expect(totals.subtotal_cfa).toBe(1000) // 2 × 500
  })
})

// ─── removeItem ───────────────────────────────────────────────────

describe('removeItem', () => {
  it('removes the matching item', () => {
    getStore().addItem(makeCartItem())
    getStore().addItem(makeCartItem({ product_id: 'prod-002' }))
    getStore().removeItem('prod-001', 0)
    const { items } = getStore()
    expect(items).toHaveLength(1)
    expect(items[0].product_id).toBe('prod-002')
  })

  it('updates totals after removeItem', () => {
    getStore().addItem(makeCartItem({ quantity_in_unit: 3, unit_price_cfa: 1000 }))
    getStore().removeItem('prod-001', 0)
    expect(getStore().totals.subtotal_cfa).toBe(0)
  })
})

// ─── changeUnit ───────────────────────────────────────────────────

describe('changeUnit', () => {
  const pack = {
    unit_level: 1 as const,
    unit_name: 'Pack',
    unit_price_cfa: 1800,
    cost_price_cfa: 1000,
    conversion_to_base: 6,
  }

  it('is a no-op when the source line is missing', () => {
    getStore().addItem(makeCartItem({ product_id: 'prod-soda', product_name: 'Soda' }))
    getStore().changeUnit('prod-001', 0, pack)
    expect(getStore().items).toHaveLength(1)
    expect(getStore().items[0].product_id).toBe('prod-soda')
  })

  it('is a no-op when from and to unit levels match', () => {
    getStore().addItem(makeCartItem({ quantity_in_unit: 3 }))
    getStore().changeUnit('prod-001', 0, {
      unit_level: 0,
      unit_name: 'Piece',
      unit_price_cfa: 350,
      cost_price_cfa: 200,
      conversion_to_base: 1,
    })
    expect(getStore().items).toHaveLength(1)
    expect(getStore().items[0].unit_level).toBe(0)
    expect(getStore().items[0].quantity_in_unit).toBe(3)
  })

  it('rewrites the source line in place when the target does not exist', () => {
    getStore().addItem(makeCartItem({ quantity_in_unit: 3 }))
    getStore().addItem(makeCartItem({
      product_id: 'prod-soda',
      product_name: 'Soda',
      unit_name: 'Pack',
      unit_level: 1,
    }))
    getStore().changeUnit('prod-001', 0, pack)

    const { items } = getStore()
    expect(items).toHaveLength(2)
    expect(items[0].product_id).toBe('prod-001')
    expect(items[0].product_name).toBe('Water Bottle')
    expect(items[0].unit_level).toBe(1)
    expect(items[0].unit_name).toBe('Pack')
    expect(items[0].quantity_in_unit).toBe(3)
    expect(items[0].unit_price_cfa).toBe(1800)
    expect(items[0].cost_price_cfa).toBe(1000)
    expect(items[0].conversion_to_base).toBe(6)
    expect(items[0].line_total_cfa).toBe(5400)
    expect(items[1].product_id).toBe('prod-soda')
  })

  it('preserves quantity without converting to pieces', () => {
    getStore().addItem(makeCartItem({ quantity_in_unit: 3 }))
    getStore().changeUnit('prod-001', 0, pack)
    expect(getStore().items[0].quantity_in_unit).toBe(3)
  })

  it('merges into the existing target, drops source, and keeps the target index', () => {
    getStore().addItem(makeCartItem({
      product_id: 'prod-water',
      product_name: 'Water',
      unit_level: 0,
      unit_name: 'Piece',
      quantity_in_unit: 3,
      unit_price_cfa: 350,
    }))
    getStore().addItem(makeCartItem({
      product_id: 'prod-soda',
      product_name: 'Soda',
      unit_level: 1,
      unit_name: 'Pack',
      quantity_in_unit: 1,
      unit_price_cfa: 1500,
    }))
    getStore().addItem(makeCartItem({
      product_id: 'prod-water',
      product_name: 'Water',
      unit_level: 1,
      unit_name: 'Pack',
      quantity_in_unit: 2,
      unit_price_cfa: 1800,
      cost_price_cfa: 1000,
      conversion_to_base: 6,
    }))

    getStore().changeUnit('prod-water', 0, pack)

    const { items, totals } = getStore()
    expect(items).toHaveLength(2)
    expect(items.map((i) => `${i.product_name}/${i.unit_name}×${i.quantity_in_unit}`)).toEqual([
      'Soda/Pack×1',
      'Water/Pack×5',
    ])
    expect(items[1].unit_price_cfa).toBe(1800)
    expect(items[1].cost_price_cfa).toBe(1000)
    expect(items[1].conversion_to_base).toBe(6)
    expect(items[1].line_total_cfa).toBe(9000)
    expect(items.filter((i) => i.product_id === 'prod-water' && i.unit_level === 1)).toHaveLength(1)
    expect(items.some((i) => i.product_id === 'prod-water' && i.unit_level === 0)).toBe(false)
    expect(totals.subtotal_cfa).toBe(1500 + 9000)
  })
})

// ─── updateQuantity ───────────────────────────────────────────────

describe('updateQuantity', () => {
  it('updates the quantity and line total', () => {
    getStore().addItem(makeCartItem({ quantity_in_unit: 1, unit_price_cfa: 350 }))
    getStore().updateQuantity('prod-001', 0, 5)
    const { items } = getStore()
    expect(items[0].quantity_in_unit).toBe(5)
    expect(items[0].line_total_cfa).toBe(1750)
  })

  it('removes item when quantity set to 0', () => {
    getStore().addItem(makeCartItem())
    getStore().updateQuantity('prod-001', 0, 0)
    expect(getStore().items).toHaveLength(0)
  })
})

// ─── Customer selection ───────────────────────────────────────────

describe('customer selection', () => {
  const mockCustomer = {
    id: 'cust-001',
    name: 'Ali Hassan',
    phone: null,
    address: null,
    balance_owed_cfa: 0,
    created_by: 'staff-001',
    created_at: new Date().toISOString(),
  }

  it('setCustomer sets customer and isWalkIn=false', () => {
    getStore().setCustomer(mockCustomer)
    expect(getStore().customer).toEqual(mockCustomer)
    expect(getStore().isWalkIn).toBe(false)
  })

  it('setCustomer(null) sets walk-in', () => {
    getStore().setCustomer(mockCustomer)
    getStore().setCustomer(null)
    expect(getStore().customer).toBeNull()
    expect(getStore().isWalkIn).toBe(true)
  })

  it('setWalkIn(true) clears customer', () => {
    getStore().setCustomer(mockCustomer)
    getStore().setWalkIn(true)
    expect(getStore().customer).toBeNull()
    expect(getStore().isWalkIn).toBe(true)
  })
})

// ─── Discount state ───────────────────────────────────────────────

describe('discount state', () => {
  it('setDiscountType resets value to 0 when type changed to null', () => {
    getStore().addItem(makeCartItem({ quantity_in_unit: 10, unit_price_cfa: 350 }))
    getStore().setDiscountType('flat')
    getStore().setDiscountValue(500)
    getStore().setDiscountType(null) // clear discount
    expect(getStore().discountValue).toBe(0)
    expect(getStore().totals.discount_amount_cfa).toBe(0)
  })
})

// ─── Cash tendered ────────────────────────────────────────────────

describe('cashTendered', () => {
  it('setCashTendered updates totals', () => {
    getStore().addItem(makeCartItem({ quantity_in_unit: 10, unit_price_cfa: 350 }))
    getStore().setCashTendered(4000) // subtotal = 3500, tender = 4000
    const { totals } = getStore()
    expect(totals.amount_applied_cfa).toBe(3500)
    expect(totals.change_given_cfa).toBe(500)
    expect(totals.balance_added_cfa).toBe(0)
  })
})

// ─── Idempotency key lifecycle ────────────────────────────────────

describe('idempotency key', () => {
  it('starts as null', () => {
    expect(getStore().idempotencyKey).toBeNull()
  })

  it('ensureIdempotencyKey generates a valid UUID', () => {
    const key = getStore().ensureIdempotencyKey()
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(getStore().idempotencyKey).toBe(key)
  })

  it('ensureIdempotencyKey returns same key on subsequent calls (retry safety)', () => {
    const key1 = getStore().ensureIdempotencyKey()
    const key2 = getStore().ensureIdempotencyKey()
    expect(key1).toBe(key2)
  })

  it('startNewSale clears idempotencyKey', () => {
    getStore().ensureIdempotencyKey()
    getStore().startNewSale()
    expect(getStore().idempotencyKey).toBeNull()
  })
})

// ─── clearCart ────────────────────────────────────────────────────

describe('clearCart', () => {
  it('removes all items but keeps customer and discount', () => {
    const mockCustomer = {
      id: 'cust-001', name: 'Test', phone: null, address: null,
      balance_owed_cfa: 0, created_by: 'staff-001',
      created_at: new Date().toISOString(),
    }
    getStore().addItem(makeCartItem())
    getStore().setCustomer(mockCustomer)
    getStore().setDiscountType('flat')
    getStore().clearCart()
    expect(getStore().items).toHaveLength(0)
    // Customer and discount persist (clearCart is mid-sale, not new sale)
    expect(getStore().customer).toEqual(mockCustomer)
    expect(getStore().discountType).toBe('flat')
  })
})

// ─── startNewSale ─────────────────────────────────────────────────

describe('startNewSale', () => {
  it('resets all per-sale state', () => {
    const mockCustomer = {
      id: 'cust-001', name: 'Test', phone: null, address: null,
      balance_owed_cfa: 0, created_by: 'staff-001',
      created_at: new Date().toISOString(),
    }
    getStore().addItem(makeCartItem())
    getStore().setCustomer(mockCustomer)
    getStore().setDiscountType('percent')
    getStore().setDiscountValue(10)
    getStore().setCashTendered(5000)
    getStore().ensureIdempotencyKey()

    getStore().startNewSale()

    const s = getStore()
    expect(s.items).toHaveLength(0)
    expect(s.customer).toBeNull()
    expect(s.isWalkIn).toBe(true)
    expect(s.discountType).toBeNull()
    expect(s.discountValue).toBe(0)
    expect(s.cashTendered).toBe(0)
    expect(s.idempotencyKey).toBeNull()
    expect(s.isSubmitting).toBe(false)
    expect(s.saleResult).toBeNull()
  })
})
