import { describe, expect, it } from 'vitest'
import { rankAchatsProductHits, resolveNearestAchatsProduct } from '@/lib/achatsProductResolve'
import type { ProductWithUnits } from '@/types'

const catalog = [
  {
    id: 'p1',
    name: 'Testing Cable',
    units: [{ unit_level: 0, serial_number: 'MAIN-TST-01', unit_name: 'Pce', cost_price_cfa: 1083 }],
  },
  {
    id: 'p2',
    name: 'Testing Box',
    units: [{ unit_level: 0, serial_number: 'MAIN-BOX-02', unit_name: 'Pce', cost_price_cfa: 500 }],
  },
  {
    id: 'p3',
    name: 'Other',
    units: [{ unit_level: 0, serial_number: 'ABC-99', unit_name: 'Pce', cost_price_cfa: 10 }],
  },
] as unknown as ProductWithUnits[]

describe('rankAchatsProductHits', () => {
  it('prefers exact code over name matches', () => {
    const hit = resolveNearestAchatsProduct('main-tst-01', catalog)
    expect(hit?.product.id).toBe('p1')
    expect(hit?.matchLabel).toBe('exact_code')
  })

  it('suggests nearest name when several share a prefix', () => {
    const ranked = rankAchatsProductHits('testing', catalog)
    expect(ranked.map((h) => h.product.id)).toEqual(['p2', 'p1'])
    // "Testing Box" is shorter than "Testing Cable" after the shared prefix
    expect(ranked[0]?.product.name).toBe('Testing Box')
  })
})