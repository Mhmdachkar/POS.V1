import { describe, it, expect } from 'vitest'
import {
  formatSoldQuantity,
  formatSoldQuantityDetail,
  resolvedSaleUnitName,
} from '@/lib/saleQuantityDisplay'

describe('saleQuantityDisplay', () => {
  it('uses count-aware lowercase unit labels', () => {
    expect(resolvedSaleUnitName('Carton', 2)).toBe('carton')
    expect(formatSoldQuantity(3, 'Carton', 2)).toBe('3 cartons')
    expect(formatSoldQuantity(1, 'Carton', 2)).toBe('1 carton')
  })

  it('falls back by unit level when name is missing', () => {
    expect(resolvedSaleUnitName('', 1)).toBe('paquet')
    expect(formatSoldQuantity(2, null, 1)).toBe('2 paquets')
  })

  it('localizes stored Piece labels', () => {
    expect(resolvedSaleUnitName('Piece', 0)).toBe('pièce')
  })

  it('appends piece total for non-piece units', () => {
    expect(formatSoldQuantityDetail(2, 'Carton', 2, 24)).toBe('2 cartons (24 pièces)')
  })
})
