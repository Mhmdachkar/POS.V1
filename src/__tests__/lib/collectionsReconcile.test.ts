import { describe, expect, it } from 'vitest'
import {
  collectionsReconcileBalances,
  collectionsReconcileParts,
} from '@/lib/collectionsReconcile'

describe('collectionsReconcileParts', () => {
  it('sums closed + open + noShift to collected', () => {
    const parts = collectionsReconcileParts({
      collected_cfa: 52600,
      closed_shift_cash_cfa: 8600,
      open_shift_cash_cfa: 30000,
      no_shift_cash_cfa: 14000,
    })
    expect(parts).toEqual({
      collected: 52600,
      closed: 8600,
      open: 30000,
      noShift: 14000,
    })
    expect(collectionsReconcileBalances(parts)).toBe(true)
    expect(parts.closed + parts.open + parts.noShift).toBe(parts.collected)
  })

  it('falls back to shift_cash - open when closed_shift_cash missing', () => {
    const parts = collectionsReconcileParts({
      collected_cfa: 22600,
      shift_cash_cfa: 8600,
      open_shift_cash_cfa: 0,
      no_shift_cash_cfa: 14000,
    })
    expect(parts.closed).toBe(8600)
    expect(collectionsReconcileBalances(parts)).toBe(true)
  })
})
