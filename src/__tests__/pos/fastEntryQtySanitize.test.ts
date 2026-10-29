import { describe, expect, it } from 'vitest'
import { sanitizeQtyInput } from '@/lib/qtyInput'

describe('sanitizeQtyInput (Fast entry qty)', () => {
  it('Delete-style clears leave 0, never empty', () => {
    expect(sanitizeQtyInput('')).toBe('0')
    expect(sanitizeQtyInput('.')).toBe('0')
    expect(sanitizeQtyInput('60')).toBe('60')
    expect(sanitizeQtyInput('6a0')).toBe('60')
  })
})