import { describe, expect, it } from 'vitest'
import { embedOne } from '@/lib/embed'

describe('embedOne', () => {
  it('unwraps a one-element PostgREST array embed', () => {
    expect(embedOne([{ full_name: 'Awa' }])).toEqual({ full_name: 'Awa' })
  })

  it('passes through an object embed', () => {
    expect(embedOne({ full_name: 'Awa' })).toEqual({ full_name: 'Awa' })
  })

  it('returns null for empty or missing embeds', () => {
    expect(embedOne(null)).toBeNull()
    expect(embedOne([])).toBeNull()
  })
})
