/**
 * Encaissements reconcile parts (no opening float).
 * collected = closed_shift_cash + open_shift_cash + no_shift_cash
 */

export type CollectionsReconcileInput = {
  collected_cfa?: number
  closed_shift_cash_cfa?: number
  open_shift_cash_cfa?: number
  no_shift_cash_cfa?: number
  /** @deprecated fallback when open/closed split is missing */
  shift_cash_cfa?: number
}

export type CollectionsReconcileParts = {
  collected: number
  closed: number
  open: number
  noShift: number
}

export function collectionsReconcileParts(
  data: CollectionsReconcileInput,
): CollectionsReconcileParts {
  const collected = Number(data.collected_cfa ?? 0)
  const noShift = Number(data.no_shift_cash_cfa ?? 0)
  const open = Number(data.open_shift_cash_cfa ?? 0)
  const closedExplicit = data.closed_shift_cash_cfa
  const closed =
    closedExplicit != null
      ? Number(closedExplicit)
      : Number(data.shift_cash_cfa ?? 0) - open
  return { collected, closed, open, noShift }
}

/** True when closed + open + noShift equals collected (CFA integer tolerance). */
export function collectionsReconcileBalances(parts: CollectionsReconcileParts): boolean {
  const sum = parts.closed + parts.open + parts.noShift
  return Math.abs(sum - parts.collected) < 0.51
}
