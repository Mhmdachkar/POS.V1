/**
 * Authoritative commercial sale total.
 * Override, when present, is the final total. Catalog/COGS stay on calculated lines.
 */
export function authoritativeFinalSaleTotal(sale: {
  total_cfa?: number | null
  admin_override_total_cfa?: number | null
}): number {
  if (sale.admin_override_total_cfa != null && sale.admin_override_total_cfa !== undefined) {
    return Number(sale.admin_override_total_cfa)
  }
  return Number(sale.total_cfa ?? 0)
}

export function lineTotalFromQtyPrice(quantity: number, unitPriceCfa: number): number {
  return Number(quantity) * Number(unitPriceCfa)
}
