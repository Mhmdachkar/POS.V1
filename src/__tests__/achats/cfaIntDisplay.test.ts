import { describe, expect, it } from 'vitest'
import { formatCFA, formatCfaIntInput, roundCfaInt } from '@/lib/formatters'
import { bilingualPlain } from '@/lib/bilingual/types'
import { ACHATS } from '@/lib/bilingual/achats'

function normSpaces(s: string) {
  return s.replace(/[\u00A0\u202F]/g, ' ')
}

describe('CFA whole-franc display parity', () => {
  it('rounds fractional costs the same way inventory formatCFA does', () => {
    expect(roundCfaInt(1038.8)).toBe(1039)
    expect(normSpaces(formatCFA(1038.8))).toBe('1 039 CFA')
    expect(formatCfaIntInput(1038.8)).toBe('1 039')
    expect(formatCfaIntInput(1083)).toBe('1 083')
  })
})

describe('deactivate blocked copy', () => {
  it('uses the settle-balance tooltip wording', () => {
    expect(bilingualPlain(ACHATS.deactivateBlockedBalance)).toMatch(/Solde|Settle/i)
  })
})