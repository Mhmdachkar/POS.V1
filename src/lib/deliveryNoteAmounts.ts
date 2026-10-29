/** Prorate sale line discount to delivered quantity (BL / PDF). */
export function proratedLineDiscountCfa(
  fullLineDiscountCfa: number,
  deliveredQty: number,
  saleQtyInUnit: number,
): number {
  if (saleQtyInUnit <= 0 || deliveredQty <= 0) return 0
  const discount = Math.max(0, Number(fullLineDiscountCfa) || 0)
  return Math.round(discount * (deliveredQty / saleQtyInUnit) * 100) / 100
}

export function deliveryNoteLineTotalCfa(params: {
  quantityInUnit: number
  unitPriceCfa: number
  lineDiscountCfa: number
  saleQuantityInUnit: number
}): number {
  const qty = Number(params.quantityInUnit) || 0
  const unit = Number(params.unitPriceCfa) || 0
  const prorated = proratedLineDiscountCfa(
    params.lineDiscountCfa,
    qty,
    params.saleQuantityInUnit,
  )
  return Math.round((qty * unit - prorated) * 100) / 100
}