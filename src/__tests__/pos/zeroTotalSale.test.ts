import { describe, expect, it } from 'vitest'
import {
  canCompleteZeroPayable,
  isDiscountOutOfRange,
  isZeroPayableTotal,
  zeroTotalReasonOk,
} from '@/lib/zeroTotalSale'

describe('B2 zero-total and discount range', () => {
  it('rejects percent above 100 and below 0', () => {
    expect(isDiscountOutOfRange('percent', 150, 1000)).toBe(true)
    expect(isDiscountOutOfRange('percent', -1, 1000)).toBe(true)
    expect(isDiscountOutOfRange('percent', 100, 1000)).toBe(false)
    expect(isDiscountOutOfRange('percent', 0, 1000)).toBe(false)
  })

  it('treats a payable of 0 as a blocked free sale', () => {
    expect(isZeroPayableTotal(0)).toBe(true)
    expect(isZeroPayableTotal(1)).toBe(false)
  })

  it('allows a 0 total only for an admin who entered a reason', () => {
    expect(canCompleteZeroPayable(false, 'promo')).toBe(false)
    expect(canCompleteZeroPayable(true, '')).toBe(false)
    expect(canCompleteZeroPayable(true, '   ')).toBe(false)
    expect(canCompleteZeroPayable(true, 'Courtesy waiver')).toBe(true)
    expect(zeroTotalReasonOk('ok')).toBe(true)
  })
})
