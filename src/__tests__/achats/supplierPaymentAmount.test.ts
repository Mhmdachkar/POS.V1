import { describe, expect, it } from 'vitest'
import { supplierPaymentAmountIssue } from '@/lib/supplierPaymentAmount'

describe('supplierPaymentAmountIssue', () => {
  it('blocks an amount over Solde du', () => {
    expect(supplierPaymentAmountIssue('999999', 69_000)).toBe('exceeds')
    expect(supplierPaymentAmountIssue('69001', 69_000)).toBe('exceeds')
  })

  it('allows the exact balance and a valid partial', () => {
    expect(supplierPaymentAmountIssue('69000', 69_000)).toBeNull()
    expect(supplierPaymentAmountIssue('40000', 69_000)).toBeNull()
  })

  it('treats empty and non-positive as not submittable', () => {
    expect(supplierPaymentAmountIssue('', 69_000)).toBe('empty')
    expect(supplierPaymentAmountIssue('0', 69_000)).toBe('invalid')
    expect(supplierPaymentAmountIssue('abc', 69_000)).toBe('invalid')
  })
})
