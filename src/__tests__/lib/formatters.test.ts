import { describe, expect, it } from 'vitest'
import { formatThousandsInput, parseCFAInput } from '@/lib/formatters'

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
})

describe('parseCFAInput', () => {
  it('reads grouped thousands', () => {
    expect(parseCFAInput('40 000')).toBe(40000)
    expect(parseCFAInput('40,000')).toBe(40000)
  })
})
