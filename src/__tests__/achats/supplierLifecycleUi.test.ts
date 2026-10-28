import { describe, expect, it } from 'vitest'
import { ACHATS } from '@/lib/bilingual/achats'
import { bilingualPlain } from '@/lib/bilingual/types'

/** Mirrors SupplierFormModal: deactivate only when active and balance is 0. */
function canDeactivateSupplier(supplier: { is_active: boolean; balance_owed_cfa: number }) {
  return supplier.is_active && Number(supplier.balance_owed_cfa) <= 0
}

/** Mirrors PurchaseReceiptDetailDrawer: Paye validate requires an explicit method. */
function canValidatePaid(method: 'cash' | 'mobile' | 'bank' | null) {
  return method !== null
}

describe('achats supplier lifecycle + pay method gates', () => {
  it('blocks deactivate when balance owed > 0', () => {
    expect(canDeactivateSupplier({ is_active: true, balance_owed_cfa: 69000 })).toBe(false)
    expect(canDeactivateSupplier({ is_active: true, balance_owed_cfa: 0 })).toBe(true)
    expect(canDeactivateSupplier({ is_active: false, balance_owed_cfa: 0 })).toBe(false)
    expect(bilingualPlain(ACHATS.deactivateBlockedBalance)).toMatch(/solde|balance/i)
  })

  it('requires an explicit payment method before Paye validate', () => {
    expect(canValidatePaid(null)).toBe(false)
    expect(canValidatePaid('cash')).toBe(true)
    expect(canValidatePaid('mobile')).toBe(true)
    expect(canValidatePaid('bank')).toBe(true)
  })
})