import { describe, expect, it } from 'vitest'
import { amountInWordsFrCfa, arreteeProformaSentence } from '@/lib/amountInWordsFr'

describe('amountInWordsFrCfa', () => {
  it('matches Soft Gestion sample for 360000', () => {
    expect(amountInWordsFrCfa(360_000)).toBe(
      'trois cent soixante mille (360 000) francs CFA',
    )
  })

  it('handles zero and teens', () => {
    expect(amountInWordsFrCfa(0)).toContain('z\u00e9ro')
    expect(amountInWordsFrCfa(17)).toContain('dix-sept')
  })

  it('builds arretee sentence', () => {
    const s = arreteeProformaSentence(360_000)
    expect(s.startsWith('Arr\u00eat\u00e9e la pr\u00e9sente proforma')).toBe(true)
    expect(s).toContain('360 000')
  })
})