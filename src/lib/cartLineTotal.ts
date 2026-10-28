/** Display line total: qty * P.U. - Remise (CFA integers). */
export function cartLineTotalCfa(
  quantityInUnit: number,
  unitPriceCfa: number,
  lineDiscountCfa = 0,
): number {
  const gross = Math.round(quantityInUnit * unitPriceCfa)
  const discount = Math.max(0, Math.round(lineDiscountCfa))
  return Math.max(0, gross - discount)
}