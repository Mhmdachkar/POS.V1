import { describe, expect, it } from 'vitest'
import { ACHATS } from '@/lib/bilingual/achats'
import { t } from '@/lib/bilingual/types'
import {
  compareSuppliers,
  formatSupplierPaymentTerm,
  matchesSupplierSearch,
  nextSupplierSort,
  parsePaymentTermDays,
  SUPPLIER_EXPORT_HEADERS,
  supplierExportRows,
} from '@/lib/supplierList'

const alpha = { name: 'Alpha SARL', phone: '07000001', balance_owed_cfa: 50000 }
const beta = { name: 'Beta Fournitures', phone: '01020304', balance_owed_cfa: 0 }

describe('matchesSupplierSearch', () => {
  it('matches name or phone and ignores blank search', () => {
    expect(matchesSupplierSearch(alpha, '')).toBe(true)
    expect(matchesSupplierSearch(alpha, '  ')).toBe(true)
    expect(matchesSupplierSearch(alpha, 'alpha')).toBe(true)
    expect(matchesSupplierSearch(alpha, '0700')).toBe(true)
    expect(matchesSupplierSearch(alpha, 'beta')).toBe(false)
    expect(matchesSupplierSearch({ name: 'X', phone: null }, '07')).toBe(false)
  })
})

describe('compareSuppliers / nextSupplierSort', () => {
  it('sorts by name then by solde, and toggles direction', () => {
    expect(compareSuppliers(alpha, beta, 'name', 'asc')).toBeLessThan(0)
    expect(compareSuppliers(alpha, beta, 'name', 'desc')).toBeGreaterThan(0)
    expect(compareSuppliers(alpha, beta, 'balance_owed_cfa', 'desc')).toBeLessThan(0)
    expect(compareSuppliers(alpha, beta, 'balance_owed_cfa', 'asc')).toBeGreaterThan(0)
    expect(nextSupplierSort('name', 'asc', 'name')).toEqual({ sortBy: 'name', sortDir: 'desc' })
    expect(nextSupplierSort('name', 'asc', 'balance_owed_cfa')).toEqual({
      sortBy: 'balance_owed_cfa',
      sortDir: 'desc',
    })
    expect(nextSupplierSort('balance_owed_cfa', 'desc', 'name')).toEqual({
      sortBy: 'name',
      sortDir: 'asc',
    })
  })
})

describe('parsePaymentTermDays', () => {
  it('accepts empty, 0, and whole days; rejects the rest', () => {
    expect(parsePaymentTermDays('')).toEqual({ ok: true, days: null })
    expect(parsePaymentTermDays('  ')).toEqual({ ok: true, days: null })
    expect(parsePaymentTermDays('0')).toEqual({ ok: true, days: 0 })
    expect(parsePaymentTermDays('30')).toEqual({ ok: true, days: 30 })
    expect(parsePaymentTermDays('-1')).toEqual({ ok: false })
    expect(parsePaymentTermDays('1.5')).toEqual({ ok: false })
    expect(parsePaymentTermDays('abc')).toEqual({ ok: false })
  })
})

describe('supplier export', () => {
  it('keeps filtered-row columns in the Excel/CSV header order', () => {
    const rows = supplierExportRows([
      {
        name: 'Alpha SARL',
        phone: '07000001',
        email: 'a@example.com',
        balance_owed_cfa: 50000,
        is_active: true,
        payment_term_days: 30,
        address: 'Abidjan',
        notes: 'Net 30',
      },
      {
        name: 'Beta',
        phone: null,
        email: null,
        balance_owed_cfa: 0,
        is_active: false,
        payment_term_days: null,
        address: null,
        notes: null,
      },
    ])
    expect(SUPPLIER_EXPORT_HEADERS).toEqual([
      'Nom',
      'Téléphone',
      'E-mail',
      'Solde dû',
      'Statut',
      'Délai (jours)',
      'Adresse',
      'Notes',
    ])
    expect(rows).toEqual([
      ['Alpha SARL', '07000001', 'a@example.com', 50000, 'Actif', 30, 'Abidjan', 'Net 30'],
      ['Beta', '', '', 0, 'Inactif', '', '', ''],
    ])
  })
})

describe('formatSupplierPaymentTerm', () => {
  it('renders days with the bilingual unit or blank when unset', () => {
    expect(formatSupplierPaymentTerm(null, t(ACHATS.days))).toBe('')
    expect(formatSupplierPaymentTerm(30, t(ACHATS.days))).toBe('30 ' + t(ACHATS.days))
  })
})
