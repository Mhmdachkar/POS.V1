/**
 * CEO Notes — Derived stock hierarchical remainder breakdown.
 */

import { describe, it, expect } from 'vitest'
import { formatDerivedUnitQuantity, stockHierarchyBreakdown } from '@/hooks/useInventory'

describe('CEO Notes — derived stock display', () => {
  const units = [
    { unit_level: 0, unit_name: 'Piece', conversion_to_base: 1 },
    { unit_level: 1, unit_name: 'Package', conversion_to_base: 12 },
    { unit_level: 2, unit_name: 'Carton', conversion_to_base: 600 },
  ]

  it('formatDerivedUnitQuantity for carton (600) and package (12)', () => {
    expect(formatDerivedUnitQuantity(1234, 600)).toBe(2.057)
    expect(formatDerivedUnitQuantity(1234, 12)).toBe(102.833)
    expect(formatDerivedUnitQuantity(1234, 1)).toBe(1234)
  })

  it('guards non-positive conversion', () => {
    expect(formatDerivedUnitQuantity(1234, 0)).toBe(0)
    expect(formatDerivedUnitQuantity(1234, -12)).toBe(0)
  })

  it('1234 pieces → 2 Cartons, 2 Packages, 10 Pieces', () => {
    const rows = stockHierarchyBreakdown(1234, units)
    expect(rows).toEqual([
      { unit_level: 2, unit_name: 'Carton', count: 2 },
      { unit_level: 1, unit_name: 'Package', count: 2 },
      { unit_level: 0, unit_name: 'Piece', count: 10 },
    ])
    expect(2 * 600 + 2 * 12 + 10).toBe(1234)
  })

  it('1800 pieces → 3 Cartons, 0 Packages, 0 Pieces', () => {
    expect(stockHierarchyBreakdown(1800, units)).toEqual([
      { unit_level: 2, unit_name: 'Carton', count: 3 },
      { unit_level: 1, unit_name: 'Package', count: 0 },
      { unit_level: 0, unit_name: 'Piece', count: 0 },
    ])
  })
})
