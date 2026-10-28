/**
 * Soft Gestion Taux de marge on product form: (sell - cost) / cost * 100.
 * Null when cost is missing, non-finite, or <= 0.
 */
export function unitMarginRatePercent(costCfa: number, sellCfa: number): number | null {
  if (!Number.isFinite(costCfa) || !Number.isFinite(sellCfa) || costCfa <= 0) return null
  return Math.round(((sellCfa - costCfa) / costCfa) * 100)
}