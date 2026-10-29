import { describe, expect, it } from 'vitest'
import {
  clientSoldeKind,
  displayedAccountBalanceCfa,
  ledgerAccountBalanceCfa,
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
  })
})
