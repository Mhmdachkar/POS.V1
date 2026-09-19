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
import { CACHE_GC, CACHE_STALE, keepPlaceholderWhen } from '@/lib/cachePolicy'
import type { ProductWithUnits } from '@/types'

// ─────────────────────────────────────────────────────────────────
// Query key factory
// ─────────────────────────────────────────────────────────────────

export const productKeys = {
  all:      ['products'] as const,
  searches: () => ['products', 'search'] as const,
  search:   (query: string, depotId: string | null, categoryId?: string | null) =>
    ['products', 'search', depotId, query, categoryId ?? null] as const,
  detail:   (id: string) => ['products', 'detail', id] as const,
  stockAlertsAll: () => ['products', 'stock-alerts'] as const,
  stockAlerts: (depotId: string | null) =>
    ['products', 'stock-alerts', depotId] as const,
}

// ─────────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────────

/** Full depot browse for POS — must cover the EYO catalog (~262+). */
export const POS_CATALOG_LIMIT = 500

export async function fetchProductSearch(
  query: string,
  depotId: string | null,
  categoryId?: string | null,
): Promise<ProductWithUnits[]> {
  let q = supabase
    .from('products')
    .select('*, product_units(*)')
    .eq('is_active', true)
    .order('name')
    .limit(POS_CATALOG_LIMIT)

  if (depotId) {
    q = q.eq('depot_id', depotId)
  }

  if (categoryId) {
    q = q.eq('category_id', categoryId)
  }

  if (query.trim()) {
    // CEO Notes: also search by serial number (case-insensitive)
    // First, find products matching by serial number
    const trimmed = query.trim()
    const { data: serialData } = await supabase
      .from('product_units')
      .select('product_id')
      .ilike('serial_number', `%${trimmed}%`)
      .limit(POS_CATALOG_LIMIT)

    const serialProductIds = (serialData ?? []).map((r: any) => r.product_id as string)

    if (serialProductIds.length > 0) {
      // OR: match by name or by serial-found product IDs
      q = q.or(`name.ilike.%${trimmed}%,id.in.(${serialProductIds.join(',')})`)
    } else {
      q = q.ilike('name', `%${trimmed}%`)
    }
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
  categoryId?: string | null,
) {
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  return useQuery({
    queryKey: productKeys.search(debouncedQuery, depotId, categoryId),
    queryFn:  () => fetchProductSearch(debouncedQuery, depotId, categoryId),
    enabled:  enabled,
    staleTime: CACHE_STALE.catalog,
    gcTime: CACHE_GC.catalog,
    placeholderData: keepPlaceholderWhen((prevKey) => prevKey[2] === depotId),
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
    staleTime: CACHE_STALE.catalog,
    gcTime: CACHE_GC.catalog,
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
