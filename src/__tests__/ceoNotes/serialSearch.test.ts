/**
 * CEO Notes — Product search matches serial_number; typed search is not Phase 16 persisted.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProductSearch, productKeys } from '@/hooks/useProducts'
import { shouldPersistCatalogQuery } from '@/lib/queryPersistence'
import { supabase } from '@/lib/supabase'

describe('CEO Notes — serial search', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset()
  })

  it('fetchProductSearch matches products by serial_number (ilike)', async () => {
    const productUnitsBuilder = {
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ product_id: 'prod-serial-match' }],
        error: null,
      }),
    }

    const productsBuilder: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
    }
    productsBuilder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({
        data: [
          {
            id: 'prod-serial-match',
            name: 'Onion',
            is_active: true,
            product_units: [
              {
                id: 'u0',
                unit_level: 0,
                unit_name: 'Piece',
                serial_number: 'ON-PCE-042',
                conversion_to_base: 1,
              },
            ],
          },
        ],
        error: null,
      }).then(resolve, reject)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'product_units') return productUnitsBuilder as never
      return productsBuilder as never
    })

    const rows = await fetchProductSearch('ON-PCE', 'depot-a', null)

    expect(supabase.from).toHaveBeenCalledWith('product_units')
    expect(productUnitsBuilder.ilike).toHaveBeenCalledWith('serial_number', '%ON-PCE%')
    expect(productsBuilder.or).toHaveBeenCalledWith(
      'name.ilike.%ON-PCE%,id.in.(prod-serial-match)',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('prod-serial-match')
    expect(rows[0].units[0].serial_number).toBe('ON-PCE-042')
  })

  it('falls back to name-only or-filter when no serial matches', async () => {
    const productUnitsBuilder = {
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const productsBuilder: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
    }
    productsBuilder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'product_units') return productUnitsBuilder as never
      return productsBuilder as never
    })

    await fetchProductSearch('cola', 'depot-a', null)
    expect(productsBuilder.or).toHaveBeenCalledWith('name.ilike.%cola%')
    expect(productsBuilder.ilike).not.toHaveBeenCalled()
  })

  it('does not persist typed Phase 16 catalog search keys', () => {
    expect(shouldPersistCatalogQuery(productKeys.search('', 'depot-a', null))).toBe(true)
    expect(shouldPersistCatalogQuery(productKeys.search('ON-PCE', 'depot-a', null))).toBe(false)
    expect(shouldPersistCatalogQuery(productKeys.search('cola', 'depot-a', 'cat-1'))).toBe(false)
  })
})
