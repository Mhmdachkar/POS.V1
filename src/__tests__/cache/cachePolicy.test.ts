import { dehydrate, QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CACHE_GC,
  CACHE_STALE,
  CATALOG_PERSIST_MAX_AGE_MS,
  catalogPersistBuster,
  keepPlaceholderWhen,
} from '@/lib/cachePolicy'
import { invalidateAfterSaleSettled } from '@/lib/cacheInvalidation'
import { productKeys } from '@/hooks/useProducts'
import { categoryKeys, inventoryKeys, invalidateAfterStockMutation } from '@/hooks/useInventory'
import {
  invalidateAfterProductCreate,
  invalidateAfterProductUpdate,
} from '@/hooks/useAdminProducts'
import {
  CATALOG_PERSIST_STORAGE_KEY,
  pausePersistRestore,
  shouldPersistCatalogQuery,
  startCatalogPersistence,
  stopCatalogPersistence,
} from '@/lib/queryPersistence'
import { queryClient } from '@/lib/queryClient'

describe('cache policy', () => {
  it('keeps catalog gcTime at least persist maxAge', () => {
    expect(CACHE_GC.catalog).toBeGreaterThanOrEqual(CATALOG_PERSIST_MAX_AGE_MS)
    expect(CACHE_GC.categories).toBeGreaterThanOrEqual(CATALOG_PERSIST_MAX_AGE_MS)
    expect(CACHE_STALE.catalog).toBe(2 * 60_000)
    expect(CACHE_STALE.categories).toBe(10 * 60_000)
  })

  it('scopes persist buster to staff id', () => {
    expect(catalogPersistBuster('staff-a')).toBe('v1:staff-a')
    expect(catalogPersistBuster('staff-a')).not.toBe(catalogPersistBuster('staff-b'))
  })

  it('does not keep placeholder data across depot identity', () => {
    const keep = keepPlaceholderWhen((prevKey) => prevKey[2] === 'dakar')
    const dakarRows = [{ id: 'cola-dakar' }]
    expect(keep(dakarRows, { queryKey: ['products', 'search', 'dakar', '', null] })).toEqual(dakarRows)
    expect(keep(dakarRows, { queryKey: ['products', 'search', 'abidjan', '', null] })).toBeUndefined()
  })

  it('keeps inventory list placeholder when only category changes in the same depot', () => {
    const keep = keepPlaceholderWhen((prevKey) => {
      const prev = prevKey[2] as { depotId: string | null } | undefined
      return prev?.depotId === 'depot-a'
    })
    const page = { data: [{ id: 'rice' }], count: 1 }
    expect(
      keep(page, {
        queryKey: ['inventory', 'list', { depotId: 'depot-a', categoryId: null, page: 0 }],
      }),
    ).toEqual(page)
    expect(
      keep(page, {
        queryKey: ['inventory', 'list', { depotId: 'depot-a', categoryId: 'cat-food', page: 0 }],
      }),
    ).toEqual(page)
    expect(
      keep(page, {
        queryKey: ['inventory', 'list', { depotId: 'depot-b', categoryId: null, page: 0 }],
      }),
    ).toBeUndefined()
  })
})

describe('persist filter', () => {
  it('persists categories and empty-query product search only', () => {
    expect(shouldPersistCatalogQuery(['categories'])).toBe(true)
    expect(shouldPersistCatalogQuery(productKeys.search('', 'depot-a', null))).toBe(true)
    expect(shouldPersistCatalogQuery(productKeys.search('', 'depot-a', 'cat-1'))).toBe(true)
    expect(shouldPersistCatalogQuery(productKeys.search('cola', 'depot-a', null))).toBe(false)
    expect(
      shouldPersistCatalogQuery(
        inventoryKeys.list({
          page: 0,
          pageSize: 30,
          search: 'cola',
          categoryId: null,
          stockStatus: 'all',
          depotId: 'depot-a',
        }),
      ),
    ).toBe(false)
    expect(shouldPersistCatalogQuery(productKeys.detail('prod-1'))).toBe(false)
    expect(shouldPersistCatalogQuery(['products'])).toBe(false)
    expect(shouldPersistCatalogQuery(['products', 'search'])).toBe(false)
    expect(shouldPersistCatalogQuery(['products', 'search', 'depot-a', '', null, 'extra'])).toBe(false)
    expect(shouldPersistCatalogQuery(['customers'])).toBe(false)
    expect(shouldPersistCatalogQuery(['sales', 'list'])).toBe(false)
    expect(
      shouldPersistCatalogQuery(['sales', 'list', 'unshifted-summary', { depotId: null, search: '' }]),
    ).toBe(false)
    expect(shouldPersistCatalogQuery(['payments'])).toBe(false)
    expect(shouldPersistCatalogQuery(['inventory', 'list'])).toBe(false)
    expect(shouldPersistCatalogQuery(['shifts', 'list'])).toBe(false)
    expect(shouldPersistCatalogQuery(['transfers', 'list'])).toBe(false)
    expect(shouldPersistCatalogQuery(['reports'])).toBe(false)
    expect(shouldPersistCatalogQuery(['dashboard'])).toBe(false)
    expect(shouldPersistCatalogQuery(['audit'])).toBe(false)
    expect(shouldPersistCatalogQuery(['staff'])).toBe(false)
  })

  it('persists categories because they are a global shared tree', () => {
    expect(categoryKeys.all).toEqual(['categories'])
    expect(shouldPersistCatalogQuery(categoryKeys.all)).toBe(true)
  })
})

describe('invalidateAfterSaleSettled', () => {
  it('invalidates products, inventory, sales, customers, shifts, and active reports', () => {
    const keys: Array<{ queryKey: readonly unknown[]; refetchType?: string }> = []
    const client = {
      invalidateQueries: (opts: { queryKey: readonly unknown[]; refetchType?: string }) => {
        keys.push(opts)
      },
    }
    invalidateAfterSaleSettled(client, {
      saleId: 'sale-1',
      customerId: 'cust-1',
      shiftId: 'shift-1',
    })
    expect(keys).toContainEqual({ queryKey: ['products'] })
    expect(keys).toContainEqual({ queryKey: ['inventory', 'list'] })
    expect(keys).toContainEqual({ queryKey: ['inventory', 'stock-activity'] })
    expect(keys).toContainEqual({ queryKey: ['sales', 'list'] })
    expect(keys).toContainEqual({ queryKey: ['sales', 'detail', 'sale-1'] })
    expect(keys).toContainEqual({ queryKey: ['customers'] })
    expect(keys).toContainEqual({ queryKey: ['customers', 'detail', 'cust-1'] })
    expect(keys).toContainEqual({ queryKey: ['shifts', 'list'] })
    expect(keys).toContainEqual({ queryKey: ['shifts', 'open'] })
    expect(keys).toContainEqual({ queryKey: ['shifts', 'detail', 'shift-1'] })
    expect(keys).toContainEqual({ queryKey: ['reports'], refetchType: 'active' })
    expect(keys).toContainEqual({ queryKey: ['dashboard'], refetchType: 'active' })
  })
})

describe('product search keys', () => {
  it('includes depot id so catalogs do not collide', () => {
    expect(productKeys.search('', 'depot-a', null)).not.toEqual(
      productKeys.search('', 'depot-b', null),
    )
    expect(productKeys.search('', 'depot-a', null)[2]).toBe('depot-a')
  })
})

describe('session cache isolation', () => {
  afterEach(async () => {
    pausePersistRestore(null)
    await stopCatalogPersistence()
    localStorage.clear()
  })

  it('clears in-memory queries and persist snapshot on stop', async () => {
    queryClient.setQueryData(['customers'], [{ id: 'leaked' }])
    localStorage.setItem(CATALOG_PERSIST_STORAGE_KEY, '{"corrupt":true}')
    await stopCatalogPersistence()
    expect(queryClient.getQueryData(['customers'])).toBeUndefined()
    expect(localStorage.getItem(CATALOG_PERSIST_STORAGE_KEY)).toBeNull()
  })

  it('ignores corrupt persist snapshots and still starts', async () => {
    localStorage.setItem(CATALOG_PERSIST_STORAGE_KEY, '{not-json')
    await expect(startCatalogPersistence('staff-1')).resolves.toBeUndefined()
  })

  it('does not restore persist for an empty staff id', async () => {
    queryClient.setQueryData(['customers'], [{ id: 'keep' }])
    await startCatalogPersistence('')
    expect(queryClient.getQueryData(['customers'])).toEqual([{ id: 'keep' }])
  })

  it('hydrates only catalog queries and keeps live non-catalog data', async () => {
    const catalogKey = productKeys.search('', 'depot-a', null)
    const typedKey = productKeys.search('cola', 'depot-a', null)
    queryClient.setQueryData(['categories'], [{ id: 'c1' }])
    queryClient.setQueryData(catalogKey, [{ id: 'p1' }])
    queryClient.setQueryData(typedKey, [{ id: 'typed' }])
    queryClient.setQueryData(['customers'], [{ id: 'stale-other-user' }])
    localStorage.setItem(
      CATALOG_PERSIST_STORAGE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        buster: catalogPersistBuster('staff-1'),
        clientState: dehydrate(queryClient),
      }),
    )
    queryClient.clear()
    queryClient.setQueryData(['customers'], [{ id: 'live' }])

    await startCatalogPersistence('staff-1')

    expect(queryClient.getQueryData(['categories'])).toEqual([{ id: 'c1' }])
    expect(queryClient.getQueryData(catalogKey)).toEqual([{ id: 'p1' }])
    expect(queryClient.getQueryData(typedKey)).toBeUndefined()
    expect(queryClient.getQueryData(['customers'])).toEqual([{ id: 'live' }])
  })

  it('does not hydrate a snapshot from another staff member', async () => {
    const catalogKey = productKeys.search('', 'depot-a', null)
    queryClient.setQueryData(catalogKey, [{ id: 'user-a' }])
    localStorage.setItem(
      CATALOG_PERSIST_STORAGE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        buster: catalogPersistBuster('staff-a'),
        clientState: dehydrate(queryClient),
      }),
    )
    queryClient.clear()

    await startCatalogPersistence('staff-b')

    expect(queryClient.getQueryData(catalogKey)).toBeUndefined()
  })

  it('does not hydrate if logout wins the in-flight restore race', async () => {
    const catalogKey = productKeys.search('', 'depot-a', null)
    queryClient.setQueryData(catalogKey, [{ id: 'user-a' }])
    localStorage.setItem(
      CATALOG_PERSIST_STORAGE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        buster: catalogPersistBuster('staff-1'),
        clientState: dehydrate(queryClient),
      }),
    )
    queryClient.clear()

    let release!: () => void
    pausePersistRestore(new Promise<void>((resolve) => { release = resolve }))
    const start = startCatalogPersistence('staff-1')
    await stopCatalogPersistence()
    release()
    await start

    expect(queryClient.getQueryData(catalogKey)).toBeUndefined()
    expect(localStorage.getItem(CATALOG_PERSIST_STORAGE_KEY)).toBeNull()
  })

  it('persists empty-query catalog and categories only, tagged with staff buster', async () => {
    await startCatalogPersistence('staff-1')
    queryClient.setQueryData(['categories'], [{ id: 'c1' }])
    queryClient.setQueryData(productKeys.search('', 'depot-a', null), [{ id: 'p1' }])
    queryClient.setQueryData(productKeys.search('cola', 'depot-a', null), [{ id: 'typed' }])
    queryClient.setQueryData(['customers'], [{ id: 'nope' }])

    await vi.waitFor(() => {
      expect(localStorage.getItem(CATALOG_PERSIST_STORAGE_KEY)).toBeTruthy()
    })

    const snapshot = JSON.parse(localStorage.getItem(CATALOG_PERSIST_STORAGE_KEY)!) as {
      buster: string
      clientState: { queries: Array<{ queryKey: unknown[] }> }
    }
    expect(snapshot.buster).toBe('v1:staff-1')
    const keys = snapshot.clientState.queries.map((q) => JSON.stringify(q.queryKey))
    expect(keys.some((k) => k.includes('"categories"'))).toBe(true)
    expect(keys.some((k) => k.includes('""') && k.includes('products'))).toBe(true)
    expect(keys.some((k) => k.includes('cola'))).toBe(false)
    expect(keys.some((k) => k.includes('customers'))).toBe(false)
  })

  it('writes an already-fetched catalog snapshot when persistence starts', async () => {
    queryClient.setQueryData(['categories'], [{ id: 'c1' }])
    queryClient.setQueryData(productKeys.search('', 'depot-a', null), [{ id: 'p1' }])
    await startCatalogPersistence('staff-1')

    await vi.waitFor(() => {
      expect(localStorage.getItem(CATALOG_PERSIST_STORAGE_KEY)).toBeTruthy()
    })
    const snapshot = JSON.parse(localStorage.getItem(CATALOG_PERSIST_STORAGE_KEY)!) as {
      buster: string
      clientState: { queries: Array<{ queryKey: unknown[] }> }
    }
    expect(snapshot.buster).toBe('v1:staff-1')
    const keys = snapshot.clientState.queries.map((q) => JSON.stringify(q.queryKey))
    expect(keys.some((k) => k.includes('"categories"'))).toBe(true)
    expect(keys.some((k) => k.includes('products'))).toBe(true)
  })

  it('does not leak user-sensitive queries when switching staff', async () => {
    queryClient.setQueryData(['customers'], [{ id: 'alice' }])
    queryClient.setQueryData(['sales', 'list'], [{ id: 'sale-a' }])
    queryClient.setQueryData(['payments'], [{ id: 'pay-a' }])
    queryClient.setQueryData(['staff'], [{ id: 'admin-row' }])
    await startCatalogPersistence('staff-a')
    await startCatalogPersistence('staff-b')
    expect(queryClient.getQueryData(['customers'])).toBeUndefined()
    expect(queryClient.getQueryData(['sales', 'list'])).toBeUndefined()
    expect(queryClient.getQueryData(['payments'])).toBeUndefined()
    expect(queryClient.getQueryData(['staff'])).toBeUndefined()
  })

  it('discards an invalid snapshot that has no timestamp', async () => {
    const catalogKey = productKeys.search('', 'depot-a', null)
    queryClient.setQueryData(catalogKey, [{ id: 'from-snapshot' }])
    localStorage.setItem(
      CATALOG_PERSIST_STORAGE_KEY,
      JSON.stringify({
        buster: catalogPersistBuster('staff-1'),
        clientState: dehydrate(queryClient),
      }),
    )
    queryClient.clear()
    await startCatalogPersistence('staff-1')
    expect(queryClient.getQueryData(catalogKey)).toBeUndefined()
  })
})

describe('QueryClient cache reuse', () => {
  it('returns cached catalog without refetch while fresh', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: CACHE_STALE.catalog } },
    })
    let fetches = 0
    const queryKey = productKeys.search('', 'depot-a', null)
    await client.fetchQuery({
      queryKey,
      queryFn: async () => {
        fetches += 1
        return [{ id: 'p1' }]
      },
      staleTime: CACHE_STALE.catalog,
    })
    await client.fetchQuery({
      queryKey,
      queryFn: async () => {
        fetches += 1
        return [{ id: 'p2' }]
      },
      staleTime: CACHE_STALE.catalog,
    })
    expect(fetches).toBe(1)
    expect(client.getQueryData(queryKey)).toEqual([{ id: 'p1' }])
    client.clear()
  })

  it('keeps cached catalog visible while a stale refetch is in flight', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    const queryKey = productKeys.search('', 'depot-a', null)
    await client.fetchQuery({
      queryKey,
      queryFn: async () => [{ id: 'p1' }],
    })

    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const refetch = client.fetchQuery({
      queryKey,
      queryFn: async () => {
        await blocked
        return [{ id: 'p2' }]
      },
    })
    expect(client.getQueryData(queryKey)).toEqual([{ id: 'p1' }])
    release()
    await refetch
    expect(client.getQueryData(queryKey)).toEqual([{ id: 'p2' }])
    client.clear()
  })

  it('keeps cached catalog when a stale refresh request errors', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    const queryKey = productKeys.search('', 'depot-a', null)
    await client.fetchQuery({
      queryKey,
      queryFn: async () => [{ id: 'p1', units: [{ selling_price_cfa: 300 }] }],
    })
    await expect(
      client.fetchQuery({
        queryKey,
        queryFn: async () => {
          throw new Error('network')
        },
      }),
    ).rejects.toThrow('network')
    expect(client.getQueryData(queryKey)).toEqual([
      { id: 'p1', units: [{ selling_price_cfa: 300 }] },
    ])
    client.clear()
  })
})

describe('price and stock invalidation', () => {
  it('refetches catalog after product invalidation so the new price is used', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: CACHE_STALE.catalog } },
    })
    const queryKey = productKeys.search('', 'depot-a', null)
    let price = 300
    const queryFn = async () => [{ id: 'cola', units: [{ selling_price_cfa: price }] }]
    await client.fetchQuery({ queryKey, queryFn, staleTime: CACHE_STALE.catalog })
    expect(client.getQueryData(queryKey)).toEqual([
      { id: 'cola', units: [{ selling_price_cfa: 300 }] },
    ])

    price = 350
    await client.invalidateQueries({ queryKey: productKeys.all })
    const next = await client.fetchQuery({ queryKey, queryFn, staleTime: CACHE_STALE.catalog })
    expect(next).toEqual([{ id: 'cola', units: [{ selling_price_cfa: 350 }] }])
    client.clear()
  })

  it('invalidates inventory and POS catalog queries after a stock mutation', () => {
    const keys: unknown[][] = []
    const client = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        keys.push([...queryKey])
      },
    }
    invalidateAfterStockMutation(client, 'prod-1')
    expect(keys).toContainEqual([...inventoryKeys.lists()])
    expect(keys).toContainEqual([...productKeys.detail('prod-1')])
    expect(keys).toContainEqual([...inventoryKeys.activity('prod-1')])
    expect(keys).toContainEqual([...inventoryKeys.stockActivities()])
    expect(keys).toContainEqual([...productKeys.searches()])
    expect(keys).toContainEqual([...productKeys.stockAlertsAll()])
  })

  it('invalidates list, catalog searches, and stock alerts after create — not products.all or reports', () => {
    const keys: unknown[][] = []
    const client = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        keys.push([...queryKey])
        return Promise.resolve()
      },
    }
    const result = invalidateAfterProductCreate(client)
    expect(result).toBeUndefined()
    expect(keys).toEqual([
      [...inventoryKeys.lists()],
      [...productKeys.searches()],
      [...productKeys.stockAlertsAll()],
    ])
    expect(keys).not.toContainEqual([...productKeys.all])
    expect(keys.some((k) => k[0] === 'reports')).toBe(false)
    expect(keys.some((k) => k[0] === 'dashboard')).toBe(false)
  })

  it('reuses stock-mutation invalidation after product update so low-stock and detail refresh', () => {
    const keys: unknown[][] = []
    const client = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        keys.push([...queryKey])
      },
    }
    invalidateAfterProductUpdate(client, 'prod-1')
    expect(keys).toContainEqual([...inventoryKeys.lists()])
    expect(keys).toContainEqual([...productKeys.detail('prod-1')])
    expect(keys).toContainEqual([...productKeys.searches()])
    expect(keys).toContainEqual([...productKeys.stockAlertsAll()])
    expect(keys).not.toContainEqual([...productKeys.all])
  })
})

describe('persist storage failures', () => {
  const original = globalThis.localStorage

  afterEach(async () => {
    pausePersistRestore(null)
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: original,
    })
    await stopCatalogPersistence()
    original.clear()
  })

  it('still boots and keeps in-memory queries when localStorage is unavailable', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
        removeItem: () => {
          throw new Error('blocked')
        },
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
    })
    queryClient.setQueryData(['customers'], [{ id: 'live' }])
    await expect(startCatalogPersistence('staff-1')).resolves.toBeUndefined()
    expect(queryClient.getQueryData(['customers'])).toEqual([{ id: 'live' }])
  })

  it('keeps the live cache when persisting hits a quota error', async () => {
    const mem: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => mem[key] ?? null,
        setItem: (key: string, value: string) => {
          if (key === CATALOG_PERSIST_STORAGE_KEY) {
            const error = new Error('quota')
            error.name = 'QuotaExceededError'
            throw error
          }
          mem[key] = value
        },
        removeItem: (key: string) => {
          delete mem[key]
        },
        clear: () => {
          Object.keys(mem).forEach((key) => delete mem[key])
        },
        key: () => null,
        length: 0,
      },
    })
    const catalogKey = productKeys.search('', 'depot-a', null)
    await startCatalogPersistence('staff-1')
    queryClient.setQueryData(catalogKey, [{ id: 'p1' }])
    expect(queryClient.getQueryData(catalogKey)).toEqual([{ id: 'p1' }])
  })

  it('clears in-memory queries even if removeClient throws', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: (key: string) => {
          if (key === CATALOG_PERSIST_STORAGE_KEY) {
            throw new Error('remove failed')
          }
        },
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
    })
    queryClient.setQueryData(['customers'], [{ id: 'leaked' }])
    await stopCatalogPersistence()
    expect(queryClient.getQueryData(['customers'])).toBeUndefined()
  })
})
