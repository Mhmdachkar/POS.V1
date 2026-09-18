import { QueryClient } from '@tanstack/react-query'
import { CACHE_GC, CACHE_STALE } from '@/lib/cachePolicy'

/**
 * Global TanStack Query client.
 *
 * Policy (Phase 16):
 * - Default staleTime 30s for operational reads.
 * - Catalog/categories override staleTime and gcTime in their hooks.
 * - refetchOnWindowFocus: true, but only refetches when data is stale.
 * - Mutations never retry (sales/payments must not double-submit).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: CACHE_STALE.operational,
      gcTime: CACHE_GC.default,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
})

queryClient.setQueryDefaults(['products'], {
  staleTime: CACHE_STALE.catalog,
  gcTime: CACHE_GC.catalog,
})
queryClient.setQueryDefaults(['categories'], {
  staleTime: CACHE_STALE.categories,
  gcTime: CACHE_GC.categories,
})
