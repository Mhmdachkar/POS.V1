import { describe, expect, it } from 'vitest'
import { unitMarginRatePercent } from '@/lib/unitMarginRate'

describe('unitMarginRatePercent', () => {
  it('returns (sell - cost) / cost * 100 rounded', () => {
    expect(unitMarginRatePercent(100_000, 135_000)).toBe(35)
    expect(unitMarginRatePercent(20, 45)).toBe(125)
  })

  it('returns null when cost is 0, negative, or non-finite', () => {
    expect(unitMarginRatePercent(0, 100)).toBeNull()
    expect(unitMarginRatePercent(-10, 100)).toBeNull()
    expect(unitMarginRatePercent(Number.NaN, 100)).toBeNull()
  })

  it('allows sell below cost (negative rate)', () => {
    expect(unitMarginRatePercent(100, 80)).toBe(-20)
  })
})