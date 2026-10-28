import { describe, expect, it } from 'vitest'
import { cartLineTotalCfa } from '@/lib/cartLineTotal'

describe('cartLineTotalCfa', () => {
  it('computes qty * price - discount', () => {
    expect(cartLineTotalCfa(2, 1500, 200)).toBe(2800)
  })

  it('never goes negative', () => {
    expect(cartLineTotalCfa(1, 100, 500)).toBe(0)
  })
})