/**
 * process_return C1 split + per-line round(2)/residual — frontend mirror.
 */

import { describe, it, expect } from 'vitest'
import {
  clampCustomRefund,
  computeReturnLineRefund,
  computeReturnRefundPreview,
  computeReturnRefundTotal,
  remainingRefundableCfa,
  resolveLineRefund,
  roundCfa2,
} from '@/lib/returnRefundPreview'

const NET_950 = 950
const ROUND_950_OVER_3 = roundCfa2(NET_950 / 3)

describe('computeReturnRefundPreview', () => {
  it('full credit return: refund 19600, owed 550 → balance 550, cash 19050', () => {
    const preview = computeReturnRefundPreview({
      refundAmountCfa: 19600,
      customerId: 'cust-1',
      saleBalanceAddedCfa: 19600,
      customerBalanceOwedCfa: 550,
      previousReturns: [],
    })
    expect(preview.remainingCreditReversalCfa).toBe(19600)
    expect(preview.balanceAdjustmentCfa).toBe(550)
    expect(preview.cashRefundCfa).toBe(19050)
  })

  it('walk-in (no customer): balance 0, cash = refund', () => {
    const preview = computeReturnRefundPreview({
      refundAmountCfa: 19600,
      customerId: null,
      saleBalanceAddedCfa: 0,
      customerBalanceOwedCfa: null,
      previousReturns: [],
    })
    expect(preview.balanceAdjustmentCfa).toBe(0)
    expect(preview.cashRefundCfa).toBe(19600)
  })

  it('no sale credit (balance_added_cfa = 0): balance 0, cash = refund', () => {
    const preview = computeReturnRefundPreview({
      refundAmountCfa: 600,
      customerId: 'cust-1',
      saleBalanceAddedCfa: 0,
      customerBalanceOwedCfa: 4000,
      previousReturns: [],
    })
    expect(preview.balanceAdjustmentCfa).toBe(0)
    expect(preview.cashRefundCfa).toBe(600)
  })

  it('owed greater than remaining credit → adj = remaining credit', () => {
    const preview = computeReturnRefundPreview({
      refundAmountCfa: 500,
      customerId: 'cust-1',
      saleBalanceAddedCfa: 400,
      customerBalanceOwedCfa: 2000,
      previousReturns: [],
    })
    expect(preview.remainingCreditReversalCfa).toBe(400)
    expect(preview.balanceAdjustmentCfa).toBe(400)
    expect(preview.cashRefundCfa).toBe(100)
  })

  it('owed lower than remaining credit → adj = owed', () => {
    const preview = computeReturnRefundPreview({
      refundAmountCfa: 500,
      customerId: 'cust-1',
      saleBalanceAddedCfa: 1000,
      customerBalanceOwedCfa: 300,
      previousReturns: [],
    })
    expect(preview.remainingCreditReversalCfa).toBe(1000)
    expect(preview.balanceAdjustmentCfa).toBe(300)
    expect(preview.cashRefundCfa).toBe(200)
  })

  it('previous balance adjustment reduces remaining credit', () => {
    const preview = computeReturnRefundPreview({
      refundAmountCfa: 500,
      customerId: 'cust-1',
      saleBalanceAddedCfa: 1000,
      customerBalanceOwedCfa: 1000,
      previousReturns: [{ balance_adjustment_cfa: 400 }],
    })
    expect(preview.previousBalanceAdjustmentCfa).toBe(400)
    expect(preview.remainingCreditReversalCfa).toBe(600)
    expect(preview.balanceAdjustmentCfa).toBe(500)
    expect(preview.cashRefundCfa).toBe(0)
  })

  it('sums multiple previous balance adjustments', () => {
    const preview = computeReturnRefundPreview({
      refundAmountCfa: 300,
      customerId: 'cust-1',
      saleBalanceAddedCfa: 1000,
      customerBalanceOwedCfa: 1000,
      previousReturns: [
        { balance_adjustment_cfa: 400 },
        { balance_adjustment_cfa: 200 },
      ],
    })
    expect(preview.previousBalanceAdjustmentCfa).toBe(600)
    expect(preview.remainingCreditReversalCfa).toBe(400)
    expect(preview.balanceAdjustmentCfa).toBe(300)
    expect(preview.cashRefundCfa).toBe(0)
  })

  it('treats null current owed as 0', () => {
    const preview = computeReturnRefundPreview({
      refundAmountCfa: 19600,
      customerId: 'cust-1',
      saleBalanceAddedCfa: 19600,
      customerBalanceOwedCfa: null,
      previousReturns: [],
    })
    expect(preview.balanceAdjustmentCfa).toBe(0)
    expect(preview.cashRefundCfa).toBe(19600)
  })

  it('zero refund produces zero split', () => {
    const preview = computeReturnRefundPreview({
      refundAmountCfa: 0,
      customerId: 'cust-1',
      saleBalanceAddedCfa: 1000,
      customerBalanceOwedCfa: 550,
      previousReturns: [],
    })
    expect(preview.refundAmountCfa).toBe(0)
    expect(preview.balanceAdjustmentCfa).toBe(0)
    expect(preview.cashRefundCfa).toBe(0)
  })
})

describe('roundCfa2 / computeReturnLineRefund / computeReturnRefundTotal', () => {
  it('roundCfa2 matches PostgreSQL round(numeric, 2) for 950 / 3', () => {
    expect(ROUND_950_OVER_3).toBe(316.67)
    expect(roundCfa2(NET_950 / 3)).toBe(316.67)
  })

  it('non-final return of 1 of 3 uses round(950 / 3, 2)', () => {
    const refund = computeReturnLineRefund({
      originalQty: 3,
      selectedQty: 1,
      netLineTotalCfa: NET_950,
      alreadyReturnedQty: 0,
      alreadyRefundedCfa: 0,
    })
    expect(refund).toBe(ROUND_950_OVER_3)
  })

  it('final residual: 950 - 2 * round(950 / 3, 2)', () => {
    const residual = roundCfa2(NET_950 - 2 * ROUND_950_OVER_3)
    expect(residual).toBe(316.66)
    const refund = computeReturnLineRefund({
      originalQty: 3,
      selectedQty: 1,
      netLineTotalCfa: NET_950,
      alreadyReturnedQty: 2,
      alreadyRefundedCfa: 2 * ROUND_950_OVER_3,
    })
    expect(refund).toBe(residual)
    expect(refund).not.toBe(ROUND_950_OVER_3)
    expect(refund).not.toBe(NET_950 / 3)
  })

  it('sums mixed selected lines with round(2) on each non-final line', () => {
    const total = computeReturnRefundTotal([
      {
        originalQty: 3,
        selectedQty: 1,
        netLineTotalCfa: NET_950,
        alreadyReturnedQty: 0,
        alreadyRefundedCfa: 0,
      },
      {
        originalQty: 2,
        selectedQty: 1,
        netLineTotalCfa: 700,
        alreadyReturnedQty: 0,
        alreadyRefundedCfa: 0,
      },
    ])
    expect(total).toBe(ROUND_950_OVER_3 + roundCfa2(700 / 2))
    expect(total).toBe(316.67 + 350)
  })

  it('uses previous sale_return_items qty + refund for final residual', () => {
    const priorRefund = ROUND_950_OVER_3
    const refund = computeReturnLineRefund({
      originalQty: 3,
      selectedQty: 2,
      netLineTotalCfa: NET_950,
      alreadyReturnedQty: 1,
      alreadyRefundedCfa: priorRefund,
    })
    expect(refund).toBe(roundCfa2(NET_950 - priorRefund))
    expect(refund).toBe(633.33)
  })

  it('remainingRefundableCfa never goes below zero', () => {
    expect(remainingRefundableCfa(950, 316.67)).toBe(633.33)
    expect(remainingRefundableCfa(600, 600)).toBe(0)
    expect(remainingRefundableCfa(600, 700)).toBe(0)
  })

  it('clampCustomRefund caps at the computed max and floors at 0', () => {
    expect(clampCustomRefund(100, 200)).toBe(100)
    expect(clampCustomRefund(250, 200)).toBe(200)
    expect(clampCustomRefund(-5, 200)).toBe(0)
    expect(clampCustomRefund(Number.NaN, 200)).toBe(0)
  })

  it('resolveLineRefund uses computed amount unless a lower custom value is set', () => {
    const line = {
      originalQty: 3,
      selectedQty: 3,
      netLineTotalCfa: 600,
      alreadyReturnedQty: 0,
      alreadyRefundedCfa: 0,
    }
    expect(resolveLineRefund(line)).toBe(600)
    expect(resolveLineRefund({ ...line, customRefundCfa: 250 })).toBe(250)
    expect(resolveLineRefund({ ...line, customRefundCfa: 0 })).toBe(0)
    expect(resolveLineRefund({ ...line, customRefundCfa: 999 })).toBe(600)
  })

  it('C1 receives the exact rounded/residual total, not the unrounded proportion', () => {
    const residualTotal = roundCfa2(NET_950 - 2 * ROUND_950_OVER_3)
    const unrounded = NET_950 / 3
    expect(residualTotal).not.toBe(unrounded)

    const preview = computeReturnRefundPreview({
      refundAmountCfa: residualTotal,
      customerId: null,
      saleBalanceAddedCfa: 0,
      customerBalanceOwedCfa: null,
      previousReturns: [],
    })
    expect(preview.refundAmountCfa).toBe(residualTotal)
    expect(preview.cashRefundCfa).toBe(residualTotal)
    expect(preview.cashRefundCfa).not.toBe(unrounded)
  })
})
