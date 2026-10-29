import { describe, expect, it } from 'vitest'
import { sanitizeAchatsQtyInput } from '@/lib/achatsProductResolve'

describe('sanitizeAchatsQtyInput', () => {
  it('never leaves qty empty after delete-style clears', () => {
    expect(sanitizeAchatsQtyInput('')).toBe('0')
    expect(sanitizeAchatsQtyInput('.')).toBe('0')
    expect(sanitizeAchatsQtyInput('60')).toBe('60')
    expect(sanitizeAchatsQtyInput('6')).toBe('6')
  })
})