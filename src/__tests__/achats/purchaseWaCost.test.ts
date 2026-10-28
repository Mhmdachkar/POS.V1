import { describe, expect, it } from 'vitest'
import { applyPurchaseWaCostL0, scaleUnitCostsFromL0 } from '@/lib/purchaseWaCost'

describe('applyPurchaseWaCostL0', () => {
  it('takes new cost when old cost is 0/null or stock empty', () => {
    expect(
      applyPurchaseWaCostL0({
        oldCostL0: 0,
        oldStockPieces: 100,
        qtyPieces: 10,
        costPerPiece: 500,
      }),
    ).toBe(500)
    expect(
      applyPurchaseWaCostL0({
        oldCostL0: null,
        oldStockPieces: 50,
        qtyPieces: 5,
        costPerPiece: 200,
      }),
    ).toBe(200)
    expect(
      applyPurchaseWaCostL0({
        oldCostL0: 100,
        oldStockPieces: 0,
        qtyPieces: 8,
        costPerPiece: 250,
      }),
    ).toBe(250)
  })

  it('computes weighted average when stock and cost exist', () => {
    // (100*100 + 100*200) / 200 = 150
    expect(
      applyPurchaseWaCostL0({
        oldCostL0: 100,
        oldStockPieces: 100,
        qtyPieces: 100,
        costPerPiece: 200,
      }),
    ).toBe(150)
  })

  it('scales higher unit costs from L0', () => {
    expect(scaleUnitCostsFromL0(150, 12)).toBe(1800)
  })
})
