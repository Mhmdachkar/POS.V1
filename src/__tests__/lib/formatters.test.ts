import { describe, expect, it } from 'vitest'
import { formatThousandsInput, isNegativeMoneyDraft, parseCFAInput } from '@/lib/formatters'

describe('formatThousandsInput', () => {
  it('groups thousands with spaces', () => {
    expect(formatThousandsInput('40000')).toBe('40 000')
    expect(formatThousandsInput('400')).toBe('400')
    expect(formatThousandsInput('1234567')).toBe('1 234 567')
  })

  it('keeps an optional decimal part', () => {
    expect(formatThousandsInput('40000.5')).toBe('40 000.5')
  })

  it('strips letters and existing separators then regroups', () => {
    expect(formatThousandsInput('CFA 40,000')).toBe('40 000')
    expect(formatThousandsInput('4 0000')).toBe('40 000')
  })

  it('allows empty', () => {
    expect(formatThousandsInput('')).toBe('')
    expect(formatThousandsInput('   ')).toBe('')
  })

  it('B5: keeps a leading minus so the field can show an error', () => {
    expect(formatThousandsInput('-')).toBe('-')
    expect(formatThousandsInput('-50')).toBe('-50')
    expect(formatThousandsInput('-40000')).toBe('-40 000')
    expect(isNegativeMoneyDraft('-')).toBe(true)
    expect(isNegativeMoneyDraft('-50')).toBe(true)
    expect(isNegativeMoneyDraft('50')).toBe(false)
  })
})

describe('parseCFAInput', () => {
  it('reads grouped thousands', () => {
    expect(parseCFAInput('40 000')).toBe(40000)
    expect(parseCFAInput('40,000')).toBe(40000)
  })
})
