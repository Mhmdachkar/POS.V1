import { describe, expect, it } from 'vitest'
import { isOvernightOpenShift } from '@/lib/overnightShift'

describe('isOvernightOpenShift', () => {
  it('is false for a shift opened today in Abidjan', () => {
    // 2026-10-29 10:00 Abidjan = 10:00Z
    const now = new Date('2026-10-29T15:00:00.000Z')
    expect(isOvernightOpenShift('2026-10-29T10:00:00.000Z', now)).toBe(false)
  })

  it('is true when opened_at is a previous Abidjan calendar day', () => {
    const now = new Date('2026-10-29T08:00:00.000Z')
    expect(isOvernightOpenShift('2026-10-28T20:00:00.000Z', now)).toBe(true)
  })

  it('is false for null/empty', () => {
    expect(isOvernightOpenShift(null)).toBe(false)
    expect(isOvernightOpenShift(undefined)).toBe(false)
  })
})
