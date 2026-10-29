import { describe, expect, it } from 'vitest'
import {
  deliveryNoteLineTotalCfa,
  proratedLineDiscountCfa,
} from '@/lib/deliveryNoteAmounts'

describe('deliveryNoteAmounts', () => {
  it('prorates discount to delivered qty', () => {
    expect(proratedLineDiscountCfa(200, 1, 2)).toBe(100)
    expect(
      deliveryNoteLineTotalCfa({
        quantityInUnit: 1,
        unitPriceCfa: 1000,
        lineDiscountCfa: 200,
        saleQuantityInUnit: 2,
      }),
    ).toBe(900)
  })
})