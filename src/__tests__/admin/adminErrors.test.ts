import { describe, expect, it } from 'vitest'
import { ERROR_MESSAGES, parseError } from '@/lib/errors'

const PHASE11_CODES = [
  'LAST_ADMIN_REQUIRED',
  'STAFF_HAS_OPEN_SHIFT',
  'AUTH_SYNC_FAILED',
  'STAFF_ROLE_SLOT_TAKEN',
  'USERNAME_TAKEN',
  'DEPOT_HAS_ACTIVE_STAFF',
  'DEPOT_HAS_OPEN_SHIFTS',
  'DEPOT_HAS_PENDING_TRANSFERS',
  'DEPOT_CODE_CONFLICT',
  'CATEGORY_HAS_ACTIVE_CHILDREN',
  'CATEGORY_HAS_ACTIVE_PRODUCTS',
  'CATEGORY_INACTIVE',
  'PRODUCT_IN_PENDING_TRANSFER',
  'INVALID_PHOTO_URL',
  'INVALID_LOGO_URL',
  'INVALID_EXCHANGE_RATE',
  'UNIT_LEVEL_REQUIRED',
  'INVALID_CONVERSION',
] as const

describe('Phase 11 error catalog', () => {
  it.each(PHASE11_CODES)('maps %s from RPC JSON', (code) => {
    const err = parseError({ message: JSON.stringify({ code, details: {} }) })
    expect(err.code).toBe(code)
    expect(err.message).toBe(ERROR_MESSAGES[code])
  })

  it('maps Edge Function format 2 envelopes', () => {
    const err = parseError({
      error: { code: 'LAST_ADMIN_REQUIRED', message: 'raw' },
    })
    expect(err.code).toBe('LAST_ADMIN_REQUIRED')
    expect(err.message).toBe(ERROR_MESSAGES.LAST_ADMIN_REQUIRED)
  })

  it('keeps DUPLICATE_PRODUCT_NAME unused in the catalog', () => {
    expect(ERROR_MESSAGES.DUPLICATE_PRODUCT_NAME).toBeTruthy()
  })
})
