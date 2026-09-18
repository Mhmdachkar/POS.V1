import {
  defaultShouldDehydrateQuery,
  hydrate,
  QueryClient,
  type Query,
} from '@tanstack/react-query'
import {
  persistQueryClientSave,
  persistQueryClientSubscribe,
  type PersistedClient,
  type Persister,
} from '@tanstack/query-persist-client-core'
import { queryClient } from '@/lib/queryClient'
import {
  CACHE_GC,
  CATALOG_PERSIST_MAX_AGE_MS,
  catalogPersistBuster,
} from '@/lib/cachePolicy'

export const CATALOG_PERSIST_STORAGE_KEY = 'vhm-pos-rq-catalog'

let unsubscribePersist: (() => void) | null = null
let persistStaffId: string | null = null
let persistWritesEnabled = false
let persistGeneration = 0
/** Test seam: resolve after restoreClient reads storage, before hydrate. */
let persistRestoreHold: Promise<void> | null = null

function safeLocalStorage(): Storage | undefined {
  try {
    const storage = globalThis.localStorage
    if (!storage) return undefined
    const probe = '__vhm_rq_probe'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return undefined
  }
}

function createCatalogPersister(): Persister | null {
  const storage = safeLocalStorage()
  if (!storage) return null

  const removeSnapshot = () => {
    try {
      storage.removeItem(CATALOG_PERSIST_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  return {
    persistClient: async (client) => {
      if (!persistWritesEnabled || persistStaffId === null) return
      try {
        storage.setItem(CATALOG_PERSIST_STORAGE_KEY, JSON.stringify(client))
      } catch {
        return
      }
      if (!persistWritesEnabled || persistStaffId === null) {
        removeSnapshot()
      }
    },
    restoreClient: async () => {
      try {
        const raw = storage.getItem(CATALOG_PERSIST_STORAGE_KEY)
        const restored = raw ? (JSON.parse(raw) as PersistedClient) : undefined
        if (persistRestoreHold) await persistRestoreHold
        return restored
      } catch {
        removeSnapshot()
        return undefined
      }
    },
    removeClient: async () => {
      removeSnapshot()
    },
  }
}

/**
 * Persist categories and the empty-query POS catalog only.
 *
 * Categories are global (no depot_id on `public.categories`). Product search
 * is persisted only for the exact key
 * `['products','search', depotId, '', categoryId]` — not every `['products']`
 * prefix, not typed searches, not product detail.
 */
export function shouldPersistCatalogQuery(queryKey: readonly unknown[]): boolean {
  if (queryKey[0] === 'categories' && queryKey.length === 1) return true
  if (
    queryKey.length === 5 &&
    queryKey[0] === 'products' &&
    queryKey[1] === 'search' &&
    queryKey[3] === ''
  ) {
    return true
  }
  return false
}

function dehydrateOptions() {
  return {
    shouldDehydrateQuery: (query: Query) =>
      defaultShouldDehydrateQuery(query) && shouldPersistCatalogQuery(query.queryKey),
    shouldDehydrateMutation: () => false,
  }
}

function catalogGcTime(queryKey: readonly unknown[]): number {
  return queryKey[0] === 'categories' ? CACHE_GC.categories : CACHE_GC.catalog
}

/**
 * Hydrate only safe catalog queries into the live client so a dirty snapshot
 * cannot overwrite the current session's non-catalog cache.
 */
function hydrateSafeCatalog(clientState: PersistedClient['clientState']) {
  const isolated = new QueryClient()
  try {
    hydrate(isolated, clientState)
    for (const query of isolated.getQueryCache().getAll()) {
      if (!shouldPersistCatalogQuery(query.queryKey)) continue
      if (query.state.data === undefined) continue
      const current = queryClient.getQueryState(query.queryKey)
      if (current && current.dataUpdatedAt >= query.state.dataUpdatedAt) continue
      queryClient.setQueryData(query.queryKey, query.state.data, {
        updatedAt: query.state.dataUpdatedAt,
      })
      queryClient.getQueryCache().build(queryClient, {
        queryKey: [...query.queryKey],
        gcTime: catalogGcTime(query.queryKey),
      })
    }
  } finally {
    isolated.clear()
  }
}

function isCurrentPersistAttempt(generation: number, staffId: string) {
  return persistGeneration === generation && persistStaffId === staffId
}

function stopSubscription() {
  persistWritesEnabled = false
  if (unsubscribePersist) {
    unsubscribePersist()
    unsubscribePersist = null
  }
}

async function restorePersistedCatalog(
  persister: Persister,
  buster: string,
  generation: number,
  staffId: string,
): Promise<boolean> {
  let persisted: PersistedClient | undefined
  try {
    persisted = await persister.restoreClient()
  } catch {
    try {
      await persister.removeClient()
    } catch {
      /* ignore */
    }
    return isCurrentPersistAttempt(generation, staffId)
  }

  if (!isCurrentPersistAttempt(generation, staffId)) return false

  if (persisted) {
    if (!persisted.timestamp) {
      try {
        await persister.removeClient()
      } catch {
        /* ignore */
      }
    } else {
      const expired = Date.now() - persisted.timestamp > CATALOG_PERSIST_MAX_AGE_MS
      const busted = persisted.buster !== buster
      if (expired || busted) {
        try {
          await persister.removeClient()
        } catch {
          /* ignore */
        }
      } else {
        hydrateSafeCatalog(persisted.clientState)
      }
    }
  }

  return isCurrentPersistAttempt(generation, staffId)
}

/**
 * Restore + subscribe persisted catalog for the authorized staff member.
 * No-op until staffId is known. Same staffId is idempotent once subscribed.
 */
export async function startCatalogPersistence(staffId: string): Promise<void> {
  if (!staffId) return
  if (persistStaffId === staffId && unsubscribePersist) return

  stopSubscription()

  if (persistStaffId && persistStaffId !== staffId) {
    try {
      await createCatalogPersister()?.removeClient()
    } catch {
      /* ignore */
    }
    queryClient.clear()
  }

  persistStaffId = staffId
  const generation = ++persistGeneration
  const persister = createCatalogPersister()
  if (!persister) return

  const buster = catalogPersistBuster(staffId)
  const stillCurrent = await restorePersistedCatalog(persister, buster, generation, staffId)
  if (!stillCurrent) return

  persistWritesEnabled = true
  try {
    await persistQueryClientSave({
      queryClient,
      persister,
      buster,
      dehydrateOptions: dehydrateOptions(),
    })
  } catch {
    /* ignore rewrite of a dirty snapshot */
  }

  if (!isCurrentPersistAttempt(generation, staffId) || !persistWritesEnabled) {
    persistWritesEnabled = false
    return
  }

  const innerUnsubscribe = persistQueryClientSubscribe({
    queryClient,
    persister,
    buster,
    dehydrateOptions: dehydrateOptions(),
  })
  unsubscribePersist = () => {
    persistWritesEnabled = false
    innerUnsubscribe()
  }
}

/**
 * Unsubscribe first so persist cannot rewrite storage, then drop the
 * snapshot and clear in-memory queries.
 */
export async function stopCatalogPersistence(): Promise<void> {
  persistGeneration += 1
  stopSubscription()
  persistStaffId = null
  try {
    await createCatalogPersister()?.removeClient()
  } catch {
    try {
      safeLocalStorage()?.removeItem(CATALOG_PERSIST_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
  queryClient.clear()
}

export function isCatalogPersistenceActive(): boolean {
  return persistWritesEnabled && unsubscribePersist !== null
}

/** @internal Test-only: pause restore after reading storage, before hydrate. */
export function pausePersistRestore(hold: Promise<void> | null) {
  persistRestoreHold = hold
}
