/**
 * useInventory — TanStack Query hooks for inventory list, activity, and mutations.
 *
 * Reads: products + inventory_transactions (SELECT via RLS).
 * Writes: only rpc.restockProduct / rpc.adjustInventory.
 * Never INSERT/UPDATE/DELETE products, stock_entries, inventory_adjustments,
 * or inventory_transactions from the client.
 *
 * Stock-status filtering is applied as PostgREST predicates on
 * current_stock_pieces BEFORE .range() so pagination and count stay correct.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { rpc } from '@/lib/rpc'
import { productKeys } from '@/hooks/useProducts'
import {
  LOW_STOCK_THRESHOLD_PIECES,
  type InventoryListFilters,
  type ProductWithUnits,
  type StockStatus,
} from '@/types'
import type { Category, InventoryTransaction } from '@/types/database'
import type {
  AdjustInventoryParams,
  InventoryAdjustmentType,
  RestockProductParams,
} from '@/types/rpc'

export const INVENTORY_PAGE_SIZE = 30
export const INVENTORY_SEARCH_DEBOUNCE_MS = 300
export const INVENTORY_ACTIVITY_LIMIT = 50
export const INVENTORY_ACTIVITY_SELECT = '*, staff!created_by(full_name)'
export const INACTIVE_PRODUCT_MESSAGE = 'Product is inactive'

export const inventoryKeys = {
  lists: () => ['inventory', 'list'] as const,
  list: (filters: InventoryListFilters) => ['inventory', 'list', filters] as const,
  activity: (productId: string) => ['inventory', 'activity', productId] as const,
}

export const categoryKeys = {
  all: ['categories'] as const,
}

export const depotOptionKeys = {
  all: ['depots', 'options'] as const,
}

export type InventoryListItem = ProductWithUnits & {
  category_name: string
}

export interface InventoryActivityRow extends InventoryTransaction {
  staff_name: string | null
}

export interface InventoryListResult {
  data: InventoryListItem[]
  count: number
}

// ─────────────────────────────────────────────────────────────────
// Query helpers (exported for tests)
// ─────────────────────────────────────────────────────────────────

/**
 * Apply stock-status predicates on current_stock_pieces.
 * Must be called BEFORE .range() / pagination.
 */
export function applyInventoryStockStatusFilter<
  T extends {
    lte: (column: string, value: number) => T
    gt: (column: string, value: number) => T
  },
>(q: T, stockStatus: StockStatus | 'all'): T {
  if (stockStatus === 'out_of_stock') {
    return q.lte('current_stock_pieces', 0)
  }
  if (stockStatus === 'low_stock') {
    return q.gt('current_stock_pieces', 0).lte('current_stock_pieces', LOW_STOCK_THRESHOLD_PIECES)
  }
  if (stockStatus === 'healthy') {
    return q.gt('current_stock_pieces', LOW_STOCK_THRESHOLD_PIECES)
  }
  return q
}

export function stockStatusPredicates(stockStatus: StockStatus | 'all') {
  if (stockStatus === 'out_of_stock') {
    return { lte: [['current_stock_pieces', 0] as const] }
  }
  if (stockStatus === 'low_stock') {
    return {
      gt: [['current_stock_pieces', 0] as const],
      lte: [['current_stock_pieces', LOW_STOCK_THRESHOLD_PIECES] as const],
    }
  }
  if (stockStatus === 'healthy') {
    return { gt: [['current_stock_pieces', LOW_STOCK_THRESHOLD_PIECES] as const] }
  }
  return {}
}

export function toAdjustmentRpcQuantity(
  type: InventoryAdjustmentType,
  uiQuantity: number,
): number {
  if (type === 'DAMAGE' || type === 'LOSS' || type === 'EXPIRY') {
    return -Math.abs(uiQuantity)
  }
  return uiQuantity
}

export function toRestockRpcParams(
  productId: string,
  data: { unit_level: number; quantity_in_unit: number; note?: string | null },
): RestockProductParams {
  return {
    p_product_id: productId,
    p_unit_level: data.unit_level,
    p_quantity_in_unit: data.quantity_in_unit,
    p_note: data.note?.trim() || null,
  }
}

export function toAdjustRpcParams(
  productId: string,
  type: InventoryAdjustmentType,
  uiQuantity: number,
  reason?: string | null,
): AdjustInventoryParams {
  return {
    p_product_id: productId,
    p_adjustment_type: type,
    p_quantity_pieces: toAdjustmentRpcQuantity(type, uiQuantity),
    p_reason: reason?.trim() || null,
  }
}

export const restockFormSchema = z.object({
  unit_level: z.coerce.number().int().min(0).max(2),
  quantity_in_unit: z.coerce.number().positive('Quantity must be greater than zero'),
  note: z.string().optional(),
})

export const adjustmentFormSchema = z
  .object({
    adjustment_type: z.enum(['DAMAGE', 'LOSS', 'COUNT_CORRECTION', 'EXPIRY', 'OTHER']),
    quantity: z.coerce.number().refine(
      (n) => !Number.isNaN(n) && n !== 0,
      'Quantity cannot be zero',
    ),
    reason: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      (data.adjustment_type === 'DAMAGE' ||
        data.adjustment_type === 'LOSS' ||
        data.adjustment_type === 'EXPIRY') &&
      data.quantity <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: 'Enter a quantity greater than zero.',
      })
    }
    if (data.adjustment_type === 'OTHER' && !data.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Reason is required for OTHER adjustments.',
      })
    }
  })

export function formatDerivedUnitQuantity(pieces: number, conversionToBase: number): number {
  if (conversionToBase <= 0) return 0
  return parseFloat((pieces / conversionToBase).toFixed(3))
}

export function invalidateAfterStockMutation(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown },
  productId: string,
) {
  queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() })
  queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) })
  queryClient.invalidateQueries({ queryKey: inventoryKeys.activity(productId) })
  queryClient.invalidateQueries({ queryKey: ['products', 'search'] })
}

function mapProductRow(row: Record<string, unknown>): InventoryListItem {
  const units = ((row.product_units as Array<{ unit_level: number }>) ?? []).slice().sort(
    (a, b) => a.unit_level - b.unit_level,
  )
  const categories = row.categories as { name?: string } | null
  return {
    ...(row as unknown as ProductWithUnits),
    units: units as InventoryListItem['units'],
    category_name: categories?.name ?? '—',
  }
}

export async function fetchInventoryList(
  filters: InventoryListFilters,
): Promise<InventoryListResult> {
  const from = filters.page * filters.pageSize
  const to = from + filters.pageSize - 1

  let q = supabase
    .from('products')
    .select('*, product_units(*), categories(name)', { count: 'exact' })
    .order('name')

  if (filters.depotId) {
    q = q.eq('depot_id', filters.depotId)
  }

  if (filters.search.trim()) {
    q = q.ilike('name', `%${filters.search.trim()}%`)
  }

  if (filters.categoryId) {
    q = q.eq('category_id', filters.categoryId)
  }

  q = applyInventoryStockStatusFilter(q, filters.stockStatus)

  q = q.range(from, to)

  const { data, error, count } = await q
  if (error) throw error

  return {
    data: ((data ?? []) as Record<string, unknown>[]).map(mapProductRow),
    count: count ?? 0,
  }
}

export async function fetchInventoryActivity(
  productId: string,
): Promise<InventoryActivityRow[]> {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select(INVENTORY_ACTIVITY_SELECT)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(INVENTORY_ACTIVITY_LIMIT)

  if (error) throw error

  return ((data ?? []) as Array<InventoryTransaction & { staff?: { full_name?: string } | null }>).map(
    (row) => ({
      ...row,
      staff_name: row.staff?.full_name ?? null,
    }),
  )
}

export async function fetchActiveCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, parent_id, is_active, created_at')
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return (data ?? []) as Category[]
}

export async function fetchDepotOptions(): Promise<Array<{
  id: string
  name: string
  code: string
  is_active: boolean
}>> {
  const { data, error } = await supabase
    .from('depots')
    .select('id, name, code, is_active')
    .order('name')

  if (error) throw error
  return (data ?? []) as Array<{
    id: string
    name: string
    code: string
    is_active: boolean
  }>
}

// ─────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────

export function useInventoryList(filters: InventoryListFilters) {
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), INVENTORY_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [filters.search])

  const queryFilters: InventoryListFilters = {
    ...filters,
    search: debouncedSearch,
  }

  return useQuery({
    queryKey: inventoryKeys.list(queryFilters),
    queryFn: () => fetchInventoryList(queryFilters),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}

export function useInventoryActivity(productId: string | null) {
  return useQuery({
    queryKey: inventoryKeys.activity(productId ?? ''),
    queryFn: () => fetchInventoryActivity(productId!),
    enabled: !!productId,
    staleTime: 30_000,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: fetchActiveCategories,
    staleTime: 300_000,
  })
}

export function useDepotOptions() {
  return useQuery({
    queryKey: depotOptionKeys.all,
    queryFn: fetchDepotOptions,
    staleTime: 300_000,
  })
}

export function useRestockProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: RestockProductParams) => {
      const result = await rpc.restockProduct(input)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, variables) => {
      invalidateAfterStockMutation(queryClient, variables.p_product_id)
    },
  })
}

export function useAdjustInventory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AdjustInventoryParams) => {
      const result = await rpc.adjustInventory(input)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, variables) => {
      invalidateAfterStockMutation(queryClient, variables.p_product_id)
    },
  })
}
