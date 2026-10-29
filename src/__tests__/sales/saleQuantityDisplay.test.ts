import { describe, it, expect } from 'vitest'
import {
  formatSoldQuantity,
  formatSoldQuantityDetail,
  resolvedSaleUnitName,
} from '@/lib/saleQuantityDisplay'

describe('saleQuantityDisplay', () => {
  it('uses count-aware titled unit labels', () => {
    expect(resolvedSaleUnitName('Carton', 2)).toBe('Carton')
    expect(formatSoldQuantity(3, 'Carton', 2)).toBe('3 Cartons')
    expect(formatSoldQuantity(1, 'Carton', 2)).toBe('1 Carton')
  })

  it('falls back by unit level when name is missing', () => {
    expect(resolvedSaleUnitName('', 1)).toBe('Paquet')
    expect(formatSoldQuantity(2, null, 1)).toBe('2 Paquets')
  })

  it('localizes stored Piece labels to Pièce', () => {
    expect(resolvedSaleUnitName('Piece', 0)).toBe('Pièce')
  })

  it('appends piece total for non-piece units', () => {
    expect(formatSoldQuantityDetail(2, 'Carton', 2, 24)).toBe('2 Cartons (24 Pièces)')
  })
})
