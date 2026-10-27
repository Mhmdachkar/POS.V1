import { describe, it, expect } from 'vitest'
import {
  formatSoldQuantity,
  formatSoldQuantityDetail,
  resolvedSaleUnitName,
} from '@/lib/saleQuantityDisplay'

describe('saleQuantityDisplay', () => {
  it('uses frozen unit name when present', () => {
    expect(resolvedSaleUnitName('Carton', 2)).toBe('Carton')
    expect(formatSoldQuantity(3, 'Carton', 2)).toBe('3 Carton')
  })

  it('falls back by unit level when name is missing', () => {
    expect(resolvedSaleUnitName('', 1)).toBe('Paquet')
    expect(formatSoldQuantity(2, null, 1)).toBe('2 Paquet')
  })

  it('localizes stored Piece labels', () => {
    expect(resolvedSaleUnitName('Piece', 0)).toBe('Pièce')
  })

  it('appends piece total for non-piece units', () => {
    expect(formatSoldQuantityDetail(2, 'Carton', 2, 24)).toBe('2 Carton (24 pièces)')
  })
})
