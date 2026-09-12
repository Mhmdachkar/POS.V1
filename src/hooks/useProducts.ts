/**
 * useProducts — TanStack Query hooks for product data.
 *
 * All queries respect depot scoping:
 *   - cashier/depot_staff: locked to their assigned depot (RLS enforces this)
 *   - admin: can pass any depotId or null for cross-depot views
 *
 * Products and units are fetched together (one query per search) because
 * the POS always needs unit prices and conversion factors.
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ProductWithUnits } from '@/types'

// ─────────────────────────────────────────────────────────────────
// Query key factory
// ─────────────────────────────────────────────────────────────────

export const productKeys = {
  all:    ['products'] as const,
  search: (query: string, depotId: string | null) =>
    ['products', 'search', depotId, query] as const,
  detail: (id: string) => ['products', 'detail', id] as const,
}

// ─────────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────────

async function fetchProductSearch(
  query: string,
  depotId: string | null,
): Promise<ProductWithUnits[]> {
  let q = supabase
    .from('products')
    .select('*, product_units(*)')
    .eq('is_active', true)
    .order('name')
    .limit(40)

  if (depotId) {
    q = q.eq('depot_id', depotId)
  }

  if (query.trim()) {
    q = q.ilike('name', `%${query.trim()}%`)
  }

  const { data, error } = await q

  if (error) throw error

  // Sort units by unit_level ascending on each product.
  // Cast to any first because the generated Supabase types don't reflect
  // the joined product_units column in the query result.
  return ((data ?? []) as any[]).map((p: any) => ({
    ...p,
    units: ((p.product_units as any[]) ?? []).sort(
      (a: any, b: any) => a.unit_level - b.unit_level,
    ),
  })) as ProductWithUnits[]
}

// ─────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────

/**
 * useProductSearch — debounced product search within a depot.
 *
 * Uses a 300ms debounce on the query string to avoid hammering the DB
 * on every keystroke. Returns immediately for empty queries (all products).
 *
 * @param query     - The search string (name search, case-insensitive)
 * @param depotId   - null = all depots (admin only); string = single depot
 * @param enabled   - set to false to suspend the query (e.g. when no depot)
 */
export function useProductSearch(
  query: string,
  depotId: string | null,
  enabled = true,
) {
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  return useQuery({
    queryKey: productKeys.search(debouncedQuery, depotId),
    queryFn:  () => fetchProductSearch(debouncedQuery, depotId),
    enabled:  enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev, // keep old results while typing
  })
}

/**
 * useProductDetail — fetch a single product with all its units.
 */
export function useProductDetail(id: string | null) {
  return useQuery({
    queryKey: productKeys.detail(id ?? ''),
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('products')
        .select('*, product_units(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      const row = data as any
      return {
        ...row,
        units: ((row.product_units as any[]) ?? []).sort(
          (a: any, b: any) => a.unit_level - b.unit_level,
        ),
      } as ProductWithUnits
    },
    enabled: !!id,
    staleTime: 30_000,
  })
}

/**
 * Helper: given the product list from a search, find the unit name for a
 * specific (product_id, unit_level) pair.  Used in the sale detail view
 * where products might not be in the current search results.
 */
export function useUnitName(
  productId: string | null,
  unitLevel: number,
): string {
  const { data } = useProductDetail(productId)
  const unit = useMemo(
    () => data?.units.find((u) => u.unit_level === unitLevel),
    [data, unitLevel],
  )
  return unit?.unit_name ?? (unitLevel === 0 ? 'Piece' : unitLevel === 1 ? 'Package' : 'Carton')
}
