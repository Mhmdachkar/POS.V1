/**
 * POS shift context — UX-only. Does not auto-select or change accounting.
 *
 * Missing / stale shift → warn, still allow sale/return/payment with null.
 * Admin POS depot ≠ shift depot → block Complete Sale.
 */

export interface PosShiftLike {
  id: string
  depot_id: string
}

export interface PosShiftContext {
  hasValidShift: boolean
  shiftDepotId: string | null
  mismatchesPosDepot: boolean
}

export function resolvePosShiftContext(
  shiftId: string | null | undefined,
  posDepotId: string | null | undefined,
  openShifts: PosShiftLike[] | null | undefined,
): PosShiftContext {
  const current = (openShifts ?? []).find((shift) => shift.id === shiftId) ?? null
  const hasValidShift = !!shiftId && !!current
  const shiftDepotId = current?.depot_id ?? null
  const mismatchesPosDepot =
    hasValidShift && !!posDepotId && shiftDepotId !== posDepotId

  return { hasValidShift, shiftDepotId, mismatchesPosDepot }
}

export function processingShiftId(
  shiftId: string | null | undefined,
  ctx: PosShiftContext,
): string | null {
  return ctx.hasValidShift ? (shiftId ?? null) : null
}

/** While the open-shift list is still loading, keep the selected id (no flash). */
export function resolveLoadedPosShiftContext(
  shiftId: string | null | undefined,
  posDepotId: string | null | undefined,
  openShifts: PosShiftLike[] | null | undefined,
  isLoading: boolean | undefined,
): PosShiftContext {
  if (isLoading === true) {
    return {
      hasValidShift: !!shiftId,
      shiftDepotId: null,
      mismatchesPosDepot: false,
    }
  }
  return resolvePosShiftContext(shiftId, posDepotId, openShifts)
}
