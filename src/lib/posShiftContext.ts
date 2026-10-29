/**
 * POS shift context — UX-only. Does not auto-select or change accounting.
 *
 * Missing / stale shift → warn, still allow sale/return/payment with null.
 * Admin POS depot ≠ shift depot → block Complete Sale.
 */

export interface PosShiftLike {
  id: string
  depot_id: string
  cashier_id?: string
  opened_at?: string
  status?: string
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

/**
 * Open shift used for a sale, refund, or payment at this depot.
 * Prefers a still-valid preferred id, then this staff member's open shift,
 * then the most recently opened shift at the depot.
 */
export function pickOpenShiftId(
  depotId: string | null | undefined,
  staffId: string | null | undefined,
  openShifts: PosShiftLike[] | null | undefined,
): string | null {
  const matches = (openShifts ?? []).filter((shift) => {
    if (shift.status && shift.status !== 'open') return false
    if (depotId && shift.depot_id !== depotId) return false
    return true
  })
  if (matches.length === 0) return null
  const own = staffId
    ? matches.filter((shift) => shift.cashier_id === staffId)
    : []
  // When staff is known, never adopt another cashier's open shift.
  const pool = staffId ? own : matches
  const sorted = [...pool].sort((a, b) =>
    (b.opened_at ?? '').localeCompare(a.opened_at ?? ''),
  )
  return sorted[0]?.id ?? null
}

export function resolveRequiredShiftId(
  preferredShiftId: string | null | undefined,
  depotId: string | null | undefined,
  staffId: string | null | undefined,
  openShifts: PosShiftLike[] | null | undefined,
): string | null {
  const matches = (openShifts ?? []).filter((shift) => {
    if (shift.status && shift.status !== 'open') return false
    if (depotId && shift.depot_id !== depotId) return false
    return true
  })
  if (preferredShiftId && matches.some((shift) => shift.id === preferredShiftId)) {
    return preferredShiftId
  }
  return pickOpenShiftId(depotId, staffId, matches)
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
