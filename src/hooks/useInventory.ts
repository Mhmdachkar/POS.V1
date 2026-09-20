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
  findProductIdsBySerial,
  findProductIdsMatchingNameOrSerial,
  nameOrSerialOrFilter,
} from '@/lib/productSearch'
import { markReportsAndDashboardStale, type CacheInvalidator } from '@/lib/cacheInvalidation'
import { CACHE_GC, CACHE_STALE, keepPlaceholderWhen } from '@/lib/cachePolicy'
import {
  type InventoryListFilters,
  type ProductWithUnits,
  type StockStatus,
} from '@/types'
import type {
  Category,
  InventoryTransaction,
  InventoryTransactionType,
} from '@/types/database'
import { resolveReportDateRange } from '@/lib/reportDates'
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
/** List columns only — avoids `*` plus unused embed fields on every filter change. */
export const INVENTORY_LIST_SELECT =
  'id, depot_id, category_id, name, photo_url, current_stock_pieces, track_low_stock, low_stock_threshold, is_low_stock, is_active, created_at, updated_at, product_units(unit_level, unit_name, serial_number, conversion_to_base, relative_quantity, cost_price_cfa, selling_price_cfa), categories(name)'

export const STOCK_ACTIVITY_PAGE_SIZE = 50
export const STOCK_ACTIVITY_SELECT =
  '*, staff!created_by(full_name), products!product_id!inner(name, is_active), depots!depot_id(name, code)'

export type StockActivityDatePreset = 'today' | 'this_week' | 'this_month' | 'all'

export interface StockActivityFilters {
  depotId: string | null
  search: string
  transactionType: InventoryTransactionType | 'all'
  datePreset: StockActivityDatePreset
  page: number
  pageSize: number
}

export const inventoryKeys = {
  lists: () => ['inventory', 'list'] as const,
  list: (filters: InventoryListFilters) => ['inventory', 'list', filters] as const,
  activity: (productId: string) => ['inventory', 'activity', productId] as const,
  stockActivities: () => ['inventory', 'stock-activity'] as const,
  stockActivity: (filters: StockActivityFilters) =>
    ['inventory', 'stock-activity', filters] as const,
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

export interface StockActivityRow extends InventoryTransaction {
  staff_name: string | null
  product_name: string
  product_is_active: boolean
  depot_name: string | null
  depot_code: string | null
}

export interface StockActivityResult {
  data: StockActivityRow[]
  count: number
}

export interface InventoryListResult {
  data: InventoryListItem[]
  count: number
}

// ─────────────────────────────────────────────────────────────────
// Query helpers (exported for tests)
// ─────────────────────────────────────────────────────────────────

/**
 * Apply stock-status predicates on current_stock_pieces / is_low_stock.
 * Must be called BEFORE .range() / pagination.
 * Low Stock is the generated is_low_stock flag (tracked + in range), not a global 10-piece rule.
 */
export function applyInventoryStockStatusFilter<
  T extends {
    lte: (column: string, value: number) => T
    gt: (column: string, value: number) => T
    eq: (column: string, value: boolean | number | string) => T
  },
>(q: T, stockStatus: StockStatus | 'all'): T {
  if (stockStatus === 'out_of_stock') {
    return q.lte('current_stock_pieces', 0)
  }
  if (stockStatus === 'low_stock') {
    return q.eq('is_low_stock', true)
  }
  if (stockStatus === 'healthy') {
    return q.gt('current_stock_pieces', 0).eq('is_low_stock', false)
  }
  return q
}

export function stockStatusPredicates(stockStatus: StockStatus | 'all') {
  if (stockStatus === 'out_of_stock') {
    return { lte: [['current_stock_pieces', 0] as const] }
  }
  if (stockStatus === 'low_stock') {
    return { eq: [['is_low_stock', true] as const] }
  }
  if (stockStatus === 'healthy') {
    return {
      gt: [['current_stock_pieces', 0] as const],
      eq: [['is_low_stock', false] as const],
    }
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

/**
 * Hierarchical remainder breakdown of base-piece stock (display only, never stored).
 * Highest conversion first: e.g. 1234 with carton=600, package=12 → 2 / 2 / 10.
 *
 * Note: when opening stock is an exact multiple of carton size (EYO seed),
 * package and piece counts are 0 — that means no loose remainder, not that
 * packing rules are missing. Packing rules live in relative_quantity.
 */
export function stockHierarchyBreakdown(
  pieces: number,
  units: Array<{ unit_level: number; unit_name: string; conversion_to_base: number }>,
): Array<{ unit_level: number; unit_name: string; count: number }> {
  const sorted = [...units].sort((a, b) => b.unit_level - a.unit_level)
  let remaining = Math.max(0, Math.floor(pieces))
  const rows: Array<{ unit_level: number; unit_name: string; count: number }> = []

  for (const unit of sorted) {
    const conv = Number(unit.conversion_to_base)
    if (unit.unit_level === 0) {
      rows.push({ unit_level: unit.unit_level, unit_name: unit.unit_name, count: remaining })
      remaining = 0
      continue
    }
    if (!(conv > 0)) {
      rows.push({ unit_level: unit.unit_level, unit_name: unit.unit_name, count: 0 })
      continue
    }
    const count = Math.floor(remaining / conv)
    remaining = remaining % conv
    rows.push({ unit_level: unit.unit_level, unit_name: unit.unit_name, count })
  }

  return rows.sort((a, b) => b.unit_level - a.unit_level)
}

/** Packing rules from relative_quantity (not stock remainders). */
export function packingRulesFromUnits(
  units: Array<{
    unit_level: number
    unit_name: string
    relative_quantity: number | null
    conversion_to_base: number
  }>,
): {
  piecesPerPackage: number | null
  packagesPerCarton: number | null
  piecesPerCarton: number | null
  packageName: string
  cartonName: string
  pieceName: string
} {
  const sorted = [...units].sort((a, b) => a.unit_level - b.unit_level)
  const piece = sorted.find((u) => u.unit_level === 0)
  const pkg = sorted.find((u) => u.unit_level === 1)
  const ctn = sorted.find((u) => u.unit_level === 2)
  const piecesPerPackage =
    pkg?.relative_quantity != null && Number(pkg.relative_quantity) > 0
      ? Number(pkg.relative_quantity)
      : pkg && Number(pkg.conversion_to_base) > 0
        ? Number(pkg.conversion_to_base)
        : null
  const packagesPerCarton =
    ctn?.relative_quantity != null && Number(ctn.relative_quantity) > 0
      ? Number(ctn.relative_quantity)
      : piecesPerPackage && ctn && Number(ctn.conversion_to_base) > 0
        ? Number(ctn.conversion_to_base) / piecesPerPackage
        : null
  const piecesPerCarton =
    ctn && Number(ctn.conversion_to_base) > 0
      ? Number(ctn.conversion_to_base)
      : piecesPerPackage && packagesPerCarton
        ? piecesPerPackage * packagesPerCarton
        : null
  return {
    piecesPerPackage,
    packagesPerCarton,
    piecesPerCarton,
    packageName: pkg?.unit_name ?? 'Paquet',
    cartonName: ctn?.unit_name ?? 'Carton',
    pieceName: piece?.unit_name ?? 'Pièce',
  }
}

/** Smallest configured selling unit (level 0, else 1, else 2). */
export function primarySellingUnit<T extends { unit_level: number }>(
  units: T[] | null | undefined,
): T | null {
  if (!units || units.length === 0) return null
  return [...units].sort((a, b) => a.unit_level - b.unit_level)[0] ?? null
}

export function invalidateAfterStockMutation(
  queryClient: CacheInvalidator,
  productId: string,
) {
  queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() })
  queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) })
  queryClient.invalidateQueries({ queryKey: inventoryKeys.activity(productId) })
  queryClient.invalidateQueries({ queryKey: inventoryKeys.stockActivities() })
  queryClient.invalidateQueries({ queryKey: productKeys.searches() })
  queryClient.invalidateQueries({ queryKey: productKeys.stockAlertsAll() })
  markReportsAndDashboardStale(queryClient)
}

/**
 * Abidjan/UTC+0 calendar-day bounds (same convention as audit_log).
 * `all` returns null so the query omits created_at predicates.
 */
export function stockActivityCreatedAtBounds(
  preset: StockActivityDatePreset,
  now: Date = new Date(),
): { from: string; toExclusive: string } | null {
  if (preset === 'all') return null
  const range = resolveReportDateRange(preset, undefined, undefined, now)
  const next = new Date(`${range.endDate}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return {
    from: `${range.startDate}T00:00:00.000Z`,
    toExclusive: next.toISOString(),
  }
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
    .select(INVENTORY_LIST_SELECT, { count: 'exact' })
    .order('name')

  if (filters.depotId) {
    q = q.eq('depot_id', filters.depotId)
  }

  if (filters.search.trim()) {
    const trimmed = filters.search.trim()
    const serialProductIds = await findProductIdsBySerial(trimmed)
    q = q.or(nameOrSerialOrFilter(trimmed, serialProductIds))
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

type StockActivityQueryRow = InventoryTransaction & {
  staff?: { full_name?: string } | null
  products?: { name?: string; is_active?: boolean } | { name?: string; is_active?: boolean }[] | null
  depots?: { name?: string; code?: string } | { name?: string; code?: string }[] | null
}

function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function mapStockActivityRow(row: StockActivityQueryRow): StockActivityRow {
  const { staff, products, depots, ...rest } = row
  const product = embedOne(products)
  const depot = embedOne(depots)
  return {
    ...(rest as InventoryTransaction),
    staff_name: staff?.full_name ?? null,
    product_name: product?.name ?? '—',
    product_is_active: product?.is_active !== false,
    depot_name: depot?.name ?? null,
    depot_code: depot?.code ?? null,
  }
}

export async function fetchStockActivity(
  filters: StockActivityFilters,
): Promise<StockActivityResult> {
  const from = filters.page * filters.pageSize
  const to = from + filters.pageSize - 1
  const dateBounds = stockActivityCreatedAtBounds(filters.datePreset)

  let q = supabase
    .from('inventory_transactions')
    .select(STOCK_ACTIVITY_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filters.depotId) {
    q = q.eq('depot_id', filters.depotId)
  }

  if (filters.transactionType !== 'all') {
    q = q.eq('transaction_type', filters.transactionType)
  }

  if (dateBounds) {
    q = q.gte('created_at', dateBounds.from).lt('created_at', dateBounds.toExclusive)
  }

  if (filters.search.trim()) {
    const matchingIds = await findProductIdsMatchingNameOrSerial(filters.search, {
      depotId: filters.depotId,
    })
    if (matchingIds.length === 0) {
      return { data: [], count: 0 }
    }
    q = q.in('product_id', matchingIds)
  }

  q = q.range(from, to)

  const { data, error, count } = await q
  if (error) throw error

  return {
    data: ((data ?? []) as StockActivityQueryRow[]).map(mapStockActivityRow),
    count: count ?? 0,
  }
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
    staleTime: CACHE_STALE.operational,
    placeholderData: keepPlaceholderWhen((prevKey) => {
      const prev = prevKey[2] as InventoryListFilters | undefined
      return prev?.depotId === queryFilters.depotId
    }),
  })
}

export function useInventoryActivity(productId: string | null) {
  return useQuery({
    queryKey: inventoryKeys.activity(productId ?? ''),
    queryFn: () => fetchInventoryActivity(productId!),
    enabled: !!productId,
    staleTime: CACHE_STALE.operational,
  })
}

export function useStockActivity(filters: StockActivityFilters) {
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(filters.search),
      INVENTORY_SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [filters.search])

  const queryFilters: StockActivityFilters = {
    ...filters,
    search: debouncedSearch,
  }

  return useQuery({
    queryKey: inventoryKeys.stockActivity(queryFilters),
    queryFn: () => fetchStockActivity(queryFilters),
    staleTime: CACHE_STALE.operational,
    placeholderData: keepPlaceholderWhen((prevKey) => {
      const prev = prevKey[2] as StockActivityFilters | undefined
      return prev?.depotId === queryFilters.depotId
    }),
  })
}

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: fetchActiveCategories,
    staleTime: CACHE_STALE.categories,
    gcTime: CACHE_GC.categories,
  })
}

export function useDepotOptions() {
  return useQuery({
    queryKey: depotOptionKeys.all,
    queryFn: fetchDepotOptions,
    staleTime: CACHE_STALE.depotOptions,
    gcTime: CACHE_GC.depotOptions,
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
