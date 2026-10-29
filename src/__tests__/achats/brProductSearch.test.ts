import { describe, expect, it } from 'vitest'
import { filterProductsCatalog } from '@/lib/productSearch'
import type { ProductWithUnits } from '@/types'

const catalog = [
  {
    id: 'p1',
    name: 'Testing Cable',
    category_id: 'c1',
    units: [{ serial_number: 'MAIN-TST-01', unit_level: 0 }],
  },
  {
    id: 'p2',
    name: 'Other Item',
    category_id: 'c1',
    units: [{ serial_number: 'ABC-99', unit_level: 0 }],
  },
] as unknown as ProductWithUnits[]

describe('Achats BR picker uses POS-style catalog filter', () => {
  it('filters by name case-insensitively as you type', () => {
    expect(filterProductsCatalog(catalog, { query: 'test' }).map((p) => p.id)).toEqual(['p1'])
    expect(filterProductsCatalog(catalog, { query: 'TESTING' }).map((p) => p.id)).toEqual(['p1'])
  })

  it('filters by serial_number / code case-insensitively', () => {
    expect(filterProductsCatalog(catalog, { query: 'main-tst' }).map((p) => p.id)).toEqual(['p1'])
    expect(filterProductsCatalog(catalog, { query: 'abc-99' }).map((p) => p.id)).toEqual(['p2'])
  })
})