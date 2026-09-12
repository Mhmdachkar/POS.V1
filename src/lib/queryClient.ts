import { QueryClient } from '@tanstack/react-query'

/**
 * Global TanStack Query client.
 *
 * Defaults chosen for a POS context:
 * - staleTime 30s: POS data (products, customers) can be 30s stale before
 *   background refetch. Short enough to stay fresh, long enough not to hammer
 *   the API on every render.
 * - gcTime 5 min: Unused cached data is kept for 5 minutes before garbage
 *   collection, so navigating back to a screen doesn't reload from scratch.
 * - retry 1: Retry once on network failure (not 3 — POS operators need fast
 *   feedback on errors).
 * - refetchOnWindowFocus true: Keeps data fresh when the cashier alt-tabs
 *   back to the POS window.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      // Do not retry mutations — double-submitting a sale/payment is dangerous.
      retry: 0,
    },
  },
})
