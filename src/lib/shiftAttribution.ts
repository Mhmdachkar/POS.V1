/**
 * Shift attribution display and unshifted-sales window math.
 *
 * NO SHIFT is derived only from sale.shift_id IS NULL. This module never
 * writes shift_id or expected cash. Shift-close expected cash stays the
 * Phase 10 formula on shift-attributed rows only.
 *
 * Shift-close / shift-detail unshifted window (authoritative):
 *   cashier_id = shift.cashier_id
 *   shift_id IS NULL
 *   status != 'voided'
 *   created_at >= opened_at AND created_at < (closed_at ?? now)
 *
 * Sales before the shift opens, and sales at/after closed_at, are excluded.
 * An open shift uses `now` as the exclusive upper bound and is in-period,
 * not a final closed total.
 */

import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { COMMON } from '@/lib/bilingual/common'
import { bilingualPlain } from '@/lib/bilingual/types'
import { formatDate, formatTime } from '@/lib/formatters'
import type { SaleStatus } from '@/types/database'

/** English secondary line for compact string contexts (filters, exports). */
export const NO_SHIFT_LABEL = COMMON.noShiftBadge.fr
export const UNSHIFTED_SALE_EXPLANATION = bilingualPlain(SHIFT_COPY.unshiftedExplanation)
export const UNSHIFTED_SHIFT_WINDOW_NOTE = bilingualPlain(SHIFT_COPY.unshiftedWindowNote)
export const UNSHIFTED_NOT_IN_RECONCILIATION_NOTE = bilingualPlain(SHIFT_COPY.unshiftedNotInReconciliation)
export const UNSHIFTED_OPEN_PERIOD_NOTE = bilingualPlain(SHIFT_COPY.unshiftedOpenPeriod)

export type ShiftFilter = 'all' | 'with_shift' | 'no_shift'

export interface UnshiftedSalesTotals {
  count: number
  total_cfa: number
}

export function isUnshiftedSale(shiftId: string | null | undefined): boolean {
  return shiftId == null
}

export function isNonvoidedSale(status: SaleStatus | string): boolean {
  return status !== 'voided'
}

/**
 * Inclusive open, exclusive close. `closedAt` null means the shift is still
 * open: the exclusive upper bound is `now`.
 */
export function saleCreatedAtIsInShiftWindow(
  createdAt: string,
  openedAt: string,
  closedAt: string | null,
  now: Date = new Date(),
): boolean {
  const created = new Date(createdAt).getTime()
  const opened = new Date(openedAt).getTime()
  const until = closedAt ? new Date(closedAt).getTime() : now.getTime()
  return created >= opened && created < until
}

export function unshiftedSaleQualifiesForShiftWindow(
  sale: {
    shift_id: string | null
    cashier_id: string
    status: SaleStatus | string
    created_at: string
  },
  shift: {
    cashier_id: string
    opened_at: string
    closed_at: string | null
  },
  now: Date = new Date(),
): boolean {
  if (!isUnshiftedSale(sale.shift_id)) return false
  if (!isNonvoidedSale(sale.status)) return false
  if (sale.cashier_id !== shift.cashier_id) return false
  return saleCreatedAtIsInShiftWindow(sale.created_at, shift.opened_at, shift.closed_at, now)
}

export function sumUnshiftedSales(
  sales: Array<{ total_cfa: number; status: SaleStatus | string }>,
): UnshiftedSalesTotals {
  return sales.reduce<UnshiftedSalesTotals>(
    (acc, sale) => {
      if (!isNonvoidedSale(sale.status)) return acc
      return {
        count: acc.count + 1,
        total_cfa: acc.total_cfa + Number(sale.total_cfa ?? 0),
      }
    },
    { count: 0, total_cfa: 0 },
  )
}

/** Compact shift label from opened/closed timestamps. Shifts have no name. */
export function formatShiftTimeRange(
  openedAt: string | null | undefined,
  closedAt: string | null | undefined,
): string {
  if (!openedAt) return '—'
  const start = formatTime(openedAt)
  if (!closedAt) return `${start}–open`
  const sameDay = formatDate(openedAt) === formatDate(closedAt)
  const end = sameDay ? formatTime(closedAt) : `${formatDate(closedAt)} ${formatTime(closedAt)}`
  return `${start}–${end}`
}
