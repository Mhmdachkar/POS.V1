/**
 * Phase 17D — unshifted window, totals, and shift time-range labels.
 *
 * Window rule: created_at >= opened_at AND created_at < (closed_at ?? now),
 * same cashier, shift_id IS NULL, status != 'voided'.
 */

import { describe, it, expect } from 'vitest'
import { estimateExpectedCash } from '@/hooks/useShifts'
import { formatTime } from '@/lib/formatters'
import {
  formatShiftTimeRange,
  isUnshiftedSale,
  saleCreatedAtIsInShiftWindow,
  sumUnshiftedSales,
  unshiftedSaleQualifiesForShiftWindow,
} from '@/lib/shiftAttribution'

describe('isUnshiftedSale', () => {
  it('is true only when shift_id is null', () => {
    expect(isUnshiftedSale(null)).toBe(true)
    expect(isUnshiftedSale(undefined)).toBe(true)
    expect(isUnshiftedSale('shift-1')).toBe(false)
  })
})

describe('formatShiftTimeRange', () => {
  it('shows opened–closed times on the same day', () => {
    expect(formatShiftTimeRange('2026-09-13T08:00:00.000Z', '2026-09-13T16:00:00.000Z')).toBe(
      `${formatTime('2026-09-13T08:00:00.000Z')}–${formatTime('2026-09-13T16:00:00.000Z')}`,
    )
  })

  it('shows opened–open when the shift is still open', () => {
    expect(formatShiftTimeRange('2026-09-13T08:00:00.000Z', null)).toBe(
      `${formatTime('2026-09-13T08:00:00.000Z')}–open`,
    )
  })
})

describe('sumUnshiftedSales', () => {
  it('counts zero sales as zeros', () => {
    expect(sumUnshiftedSales([])).toEqual({ count: 0, total_cfa: 0 })
  })

  it('counts one nonvoided sale', () => {
    expect(sumUnshiftedSales([{ total_cfa: 1500, status: 'completed' }])).toEqual({
      count: 1,
      total_cfa: 1500,
    })
  })

  it('sums multiple nonvoided sales and excludes voided', () => {
    expect(
      sumUnshiftedSales([
        { total_cfa: 1000, status: 'completed' },
        { total_cfa: 2000, status: 'voided' },
        { total_cfa: 500, status: 'returned' },
      ]),
    ).toEqual({ count: 2, total_cfa: 1500 })
  })
})

describe('saleCreatedAtIsInShiftWindow', () => {
  const opened = '2026-09-13T08:00:00.000Z'
  const closed = '2026-09-13T16:00:00.000Z'
  const now = new Date('2026-09-13T12:00:00.000Z')

  it('excludes a sale before the shift opens', () => {
    expect(saleCreatedAtIsInShiftWindow('2026-09-13T07:59:59.000Z', opened, closed, now)).toBe(
      false,
    )
  })

  it('includes a sale at opened_at and during the window', () => {
    expect(saleCreatedAtIsInShiftWindow(opened, opened, closed, now)).toBe(true)
    expect(saleCreatedAtIsInShiftWindow('2026-09-13T12:00:00.000Z', opened, closed, now)).toBe(
      true,
    )
  })

  it('excludes a sale at or after closed_at', () => {
    expect(saleCreatedAtIsInShiftWindow(closed, opened, closed, now)).toBe(false)
    expect(saleCreatedAtIsInShiftWindow('2026-09-13T16:00:01.000Z', opened, closed, now)).toBe(
      false,
    )
  })

  it('uses now as the exclusive upper bound for an open shift', () => {
    expect(saleCreatedAtIsInShiftWindow('2026-09-13T11:59:00.000Z', opened, null, now)).toBe(true)
    expect(saleCreatedAtIsInShiftWindow('2026-09-13T12:00:00.000Z', opened, null, now)).toBe(false)
  })
})

describe('unshiftedSaleQualifiesForShiftWindow', () => {
  const shift = {
    cashier_id: 'cashier-1',
    opened_at: '2026-09-13T08:00:00.000Z',
    closed_at: '2026-09-13T16:00:00.000Z',
  }
  const now = new Date('2026-09-13T12:00:00.000Z')

  it('requires null shift_id, same cashier, nonvoided, and in-window created_at', () => {
    const sale = {
      shift_id: null,
      cashier_id: 'cashier-1',
      status: 'completed',
      created_at: '2026-09-13T10:00:00.000Z',
      total_cfa: 4000,
    }
    expect(unshiftedSaleQualifiesForShiftWindow(sale, shift, now)).toBe(true)
    expect(unshiftedSaleQualifiesForShiftWindow({ ...sale, shift_id: 'sh-1' }, shift, now)).toBe(
      false,
    )
    expect(unshiftedSaleQualifiesForShiftWindow({ ...sale, cashier_id: 'other' }, shift, now)).toBe(
      false,
    )
    expect(unshiftedSaleQualifiesForShiftWindow({ ...sale, status: 'voided' }, shift, now)).toBe(
      false,
    )
  })
})

describe('unshifted totals vs expected cash', () => {
  it('does not add unshifted total_cfa into estimateExpectedCash', () => {
    const running = { sales_cash_cfa: 200, customer_pmts_cfa: 0, return_cash_cfa: 0 }
    const expected = estimateExpectedCash(1000, running)
    const unshifted = sumUnshiftedSales([{ total_cfa: 47000, status: 'completed' }])
    expect(expected).toBe(1200)
    expect(expected + unshifted.total_cfa).not.toBe(expected)
    expect(unshifted.total_cfa).toBe(47000)
  })
})

describe('formatTime is used by the range helper', () => {
  it('stays aligned with the shared formatter', () => {
    expect(formatShiftTimeRange('2026-09-13T08:00:00.000Z', null)).toBe(
      `${formatTime('2026-09-13T08:00:00.000Z')}–open`,
    )
  })
})
