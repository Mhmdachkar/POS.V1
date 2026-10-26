/**
 * Phase 14B-2 — POS shift context helper.
 */

import { describe, it, expect } from 'vitest'
import {
  pickOpenShiftId,
  processingShiftId,
  resolveLoadedPosShiftContext,
  resolvePosShiftContext,
  resolveRequiredShiftId,
} from '@/lib/posShiftContext'

const dakar = { id: 'shift-dkr', depot_id: 'depot-a' }
const abidjan = { id: 'shift-abj', depot_id: 'depot-b' }

describe('resolvePosShiftContext', () => {
  it('treats a missing shift as invalid without blocking mismatch', () => {
    expect(resolvePosShiftContext(null, 'depot-a', [dakar])).toEqual({
      hasValidShift: false,
      shiftDepotId: null,
      mismatchesPosDepot: false,
    })
  })

  it('treats a stale id as no valid shift', () => {
    expect(resolvePosShiftContext('gone', 'depot-a', [dakar])).toEqual({
      hasValidShift: false,
      shiftDepotId: null,
      mismatchesPosDepot: false,
    })
  })

  it('flags admin POS depot mismatch when the selected shift is still authorized', () => {
    expect(resolvePosShiftContext('shift-abj', 'depot-a', [dakar, abidjan])).toEqual({
      hasValidShift: true,
      shiftDepotId: 'depot-b',
      mismatchesPosDepot: true,
    })
  })

  it('does not mismatch when POS depot is unset', () => {
    expect(resolvePosShiftContext('shift-abj', null, [abidjan]).mismatchesPosDepot).toBe(false)
  })

  it('matches when shift depot equals POS depot', () => {
    expect(resolvePosShiftContext('shift-dkr', 'depot-a', [dakar])).toEqual({
      hasValidShift: true,
      shiftDepotId: 'depot-a',
      mismatchesPosDepot: false,
    })
  })
})

describe('processingShiftId', () => {
  it('returns the selected id only when the shift is valid', () => {
    const valid = resolvePosShiftContext('shift-dkr', 'depot-a', [dakar])
    const invalid = resolvePosShiftContext('gone', 'depot-a', [dakar])
    expect(processingShiftId('shift-dkr', valid)).toBe('shift-dkr')
    expect(processingShiftId('gone', invalid)).toBeNull()
  })
})

describe('pickOpenShiftId / resolveRequiredShiftId', () => {
  const dakarEarly = {
    id: 'shift-old',
    depot_id: 'depot-a',
    cashier_id: 'other',
    opened_at: '2026-09-13T07:00:00Z',
    status: 'open',
  }
  const dakarOwn = {
    id: 'shift-own',
    depot_id: 'depot-a',
    cashier_id: 'cashier-1',
    opened_at: '2026-09-13T08:00:00Z',
    status: 'open',
  }
  const abidjan = {
    id: 'shift-abj',
    depot_id: 'depot-b',
    cashier_id: 'cashier-1',
    opened_at: '2026-09-13T09:00:00Z',
    status: 'open',
  }

  it('B8: prefers this cashier\'s open shift at the POS depot', () => {
    expect(pickOpenShiftId('depot-a', 'cashier-1', [dakarEarly, dakarOwn, abidjan])).toBe('shift-own')
  })

  it('B8: returns null when the depot has no open shift', () => {
    expect(pickOpenShiftId('depot-a', 'cashier-1', [abidjan])).toBeNull()
  })

  it('B8: keeps a still-open preferred shift, otherwise falls back', () => {
    expect(resolveRequiredShiftId('shift-old', 'depot-a', 'cashier-1', [dakarEarly, dakarOwn])).toBe('shift-old')
    expect(resolveRequiredShiftId('gone', 'depot-a', 'cashier-1', [dakarEarly, dakarOwn])).toBe('shift-own')
  })
})

describe('resolveLoadedPosShiftContext', () => {
  it('keeps a selected id while the open-shift list is loading', () => {
    expect(resolveLoadedPosShiftContext('shift-dkr', 'depot-a', [], true)).toEqual({
      hasValidShift: true,
      shiftDepotId: null,
      mismatchesPosDepot: false,
    })
  })

  it('applies the loaded list once fetching has finished', () => {
    expect(resolveLoadedPosShiftContext('gone', 'depot-a', [dakar], false).hasValidShift).toBe(false)
  })
})
