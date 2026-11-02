import { describe, expect, it } from 'vitest'
import {
  clientSoldeKind,
  displayedAccountBalanceCfa,
  hasDisplayedClientBalance,
  ledgerAccountBalanceCfa,
  payableClientDebtCfa,
} from '@/lib/customerAccountBalance'

describe('customerAccountBalance', () => {
  it('uses last running_balance_cfa including negatives', () => {
    expect(ledgerAccountBalanceCfa([])).toBe(0)
    expect(ledgerAccountBalanceCfa([{ running_balance_cfa: 100 }, { running_balance_cfa: -100 }])).toBe(-100)
  })

  it('classifies due, credit, and settled', () => {
    expect(clientSoldeKind(50)).toBe('due')
    expect(clientSoldeKind(-100)).toBe('credit')
    expect(clientSoldeKind(0)).toBe('settled')
  })

  it('prefers loaded ledger over owed', () => {
    expect(displayedAccountBalanceCfa(-100, 0)).toBe(-100)
    expect(displayedAccountBalanceCfa(undefined, 4500)).toBe(4500)
    expect(displayedAccountBalanceCfa(null, 4500)).toBe(4500)
    expect(displayedAccountBalanceCfa(1400, 1500)).toBe(1400)
  })

  it('with-balance filter and payment cap use the same displayed solde', () => {
    expect(hasDisplayedClientBalance(1400)).toBe(true)
    expect(hasDisplayedClientBalance(-100)).toBe(true)
    expect(hasDisplayedClientBalance(0)).toBe(false)
    expect(payableClientDebtCfa(1400, 1500)).toBe(1400)
    expect(payableClientDebtCfa(-100, 0)).toBe(0)
    expect(payableClientDebtCfa(undefined, 1500)).toBe(1500)
  })
})
