import { describe, expect, it } from 'vitest'
import type { ProductWithUnits } from '@/types'

function resolveAddTarget(
  query: string,
  hits: ProductWithUnits[],
): { product: ProductWithUnits; unitLevel: number } | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return null
  for (const p of hits) {
    const exact = p.units.find((u) => u.serial_number?.trim().toLowerCase() === needle)
    if (exact) return { product: p, unitLevel: exact.unit_level }
  }
  if (hits.length === 1) {
    const p = hits[0]!
    const unit = p.units.find((u) => u.unit_level === 0) ?? p.units[0]
    if (!unit) return null
    return { product: p, unitLevel: unit.unit_level }
  }
  return null
}

const catalog = [
  {
    id: 'p1',
    name: 'Testing Cable',
    photo_url: 'https://example.com/a.jpg',
    units: [
      { unit_level: 0, serial_number: 'MAIN-TST-01', unit_name: 'Pce', cost_price_cfa: 1083 },
    ],
  },
  {
    id: 'p2',
    name: 'Other',
    photo_url: null,
    units: [{ unit_level: 0, serial_number: 'ABC-99', unit_name: 'Pce', cost_price_cfa: 10 }],
  },
] as unknown as ProductWithUnits[]

describe('BR Enter-to-add resolution', () => {
  it('adds exact serial/code match on Enter', () => {
    const hit = resolveAddTarget('main-tst-01', catalog)
    expect(hit?.product.id).toBe('p1')
    expect(hit?.unitLevel).toBe(0)
  })

  it('adds sole filtered hit when code is not exact', () => {
    const filtered = catalog.filter((p) => p.name.toLowerCase().includes('testing'))
    const hit = resolveAddTarget('testing', filtered)
    expect(hit?.product.id).toBe('p1')
  })

  it('does not guess when multiple hits remain', () => {
    expect(resolveAddTarget('a', catalog)).toBeNull()
  })
})