/**
 * Weighted-average L0 cost used when validating a purchase receipt.
 * Mirrors private.apply_purchase_wa_cost: 0/null/empty stock → take new cost.
 */
export function applyPurchaseWaCostL0(params: {
  oldCostL0: number | null | undefined
  oldStockPieces: number | null | undefined
  qtyPieces: number
  costPerPiece: number
}): number {
  const oldCost = Number(params.oldCostL0 ?? 0)
  const oldPieces = Math.max(0, Number(params.oldStockPieces ?? 0))
  const qty = Number(params.qtyPieces)
  const costPerPiece = Number(params.costPerPiece)
  if (oldCost <= 0 || oldPieces <= 0) {
    return round2(costPerPiece)
  }
  return round2((oldPieces * oldCost + qty * costPerPiece) / (oldPieces + qty))
}

export function scaleUnitCostsFromL0(l0Cost: number, conversionToBase: number): number {
  return round2(l0Cost * conversionToBase)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
