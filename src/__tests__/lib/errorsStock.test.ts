/**
 * Phase 18B — INSUFFICIENT_STOCK message mapping with available_pieces.
 */

import { describe, expect, it } from 'vitest'
import { messageForCodePlain } from '@/lib/bilingual/errors'
import { getErrorMessage, parseError } from '@/lib/errors'

describe('INSUFFICIENT_STOCK messages', () => {
  it('uses Stock insuffisant. Seulement N disponibles. when details present', () => {
    expect(
      getErrorMessage('INSUFFICIENT_STOCK', { available_pieces: 4 }),
    ).toBe('Stock insuffisant. Seulement 4 disponibles.')
  })

  it('falls back to generic message without available_pieces', () => {
    expect(getErrorMessage('INSUFFICIENT_STOCK')).toBe(
      'Stock insuffisant pour ce produit.',
    )
  })

  it('parseError preserves available_pieces for RPC JSON', () => {
    const parsed = parseError({
      message: JSON.stringify({
        code: 'INSUFFICIENT_STOCK',
        details: { available_pieces: 4, product_name: 'Onion' },
      }),
    })
    expect(parsed.code).toBe('INSUFFICIENT_STOCK')
    expect(parsed.message).toBe(
      messageForCodePlain('INSUFFICIENT_STOCK', {
        available_pieces: 4,
        product_name: 'Onion',
      }),
    )
    expect(parsed.details?.available_pieces).toBe(4)
  })
})
