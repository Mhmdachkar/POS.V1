/**
 * Phase 16 cache policy — single source for staleTime / gcTime.
 *
 * Catalog persist maxAge is 30 minutes, so catalog/categories gcTime must
 * be at least 30 minutes or persisted entries are dropped from memory
 * before the snapshot expires.
 *
 * Categories are a global shared tree: `public.categories` has no depot_id,
 * and RLS `categories_select_authenticated` is authenticated-only with no
 * depot predicate. Persisting `['categories']` is therefore correct.
 *
 * Cross-device: Phase 16 does not use Realtime. A mutation on another
 * browser/device is not pushed instantly. This client refreshes when the
 * cached query becomes stale or on refetchOnWindowFocus.
 */

export const CACHE_STALE = {
  catalog: 2 * 60_000,
  categories: 10 * 60_000,
  depotOptions: 10 * 60_000,
  operational: 30_000,
  salesList: 15_000,
  salesDetail: 10_000,
  shiftsList: 15_000,
  shiftsDetail: 10_000,
  transfersList: 15_000,
  transfersDetail: 10_000,
  customerList: 30_000,
  customerDetail: 15_000,
  reports: 60_000,
  dashboard: 30_000,
  staffList: 15_000,
  staffDetail: 10_000,
  audit: 30_000,
  settings: 30_000,
} as const

export const CACHE_GC = {
  default: 5 * 60_000,
  /** Must be >= persist maxAge (30 min). */
  catalog: 30 * 60_000,
  categories: 30 * 60_000,
  depotOptions: 30 * 60_000,
} as const

export const CATALOG_PERSIST_MAX_AGE_MS = 30 * 60_000
export const CATALOG_PERSIST_BUSTER_PREFIX = 'v1'

export function catalogPersistBuster(staffId: string): string {
  return `${CATALOG_PERSIST_BUSTER_PREFIX}:${staffId}`
}

type PreviousQuery = { queryKey: readonly unknown[] }

/**
 * Keep previous list data while filters that are not identity (search text,
 * pagination) change. Never keep data when the scope identity differs
 * (e.g. another depot).
 */
export function keepPlaceholderWhen<T>(
  isSameScope: (previousQueryKey: readonly unknown[]) => boolean,
): (previousData: T | undefined, previousQuery?: PreviousQuery) => T | undefined {
  return (previousData, previousQuery) => {
    if (previousData === undefined) return undefined
    if (!previousQuery) return previousData
    return isSameScope(previousQuery.queryKey) ? previousData : undefined
  }
}

export function depotIdFromListKey(queryKey: readonly unknown[], filterIndex = 2): unknown {
  const filters = queryKey[filterIndex]
  if (filters && typeof filters === 'object' && 'depotId' in filters) {
    return (filters as { depotId: unknown }).depotId
  }
  return undefined
}
