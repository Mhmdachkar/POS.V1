/**
 * useSales — TanStack Query hooks for sales data.
 *
 * Provides:
 *   useSalesList   — paginated, filterable sales list
 *   useSaleDetail  — single sale with items, returns, payments
 *   useInvalidateSales — after mutation, refreshes affected caches
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { embedOne } from '@/lib/embed'
import { supabase } from '@/lib/supabase'
import { invalidateAfterSaleSettled } from '@/lib/cacheInvalidation'
import { CACHE_STALE, keepPlaceholderWhen } from '@/lib/cachePolicy'
import { sumUnshiftedSales, type ShiftFilter, type UnshiftedSalesTotals } from '@/lib/shiftAttribution'
import type { Sale, SaleStatus } from '@/types/database'
import type { FulfillmentStatus, SaleFulfillmentRow } from '@/lib/printPayload'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface SaleListItem extends Sale {
  customer_name: string | null
  cashier_name: string | null
  cashier_role: string | null
  shift_opened_at: string | null
  shift_closed_at: string | null
  fulfillment_status: FulfillmentStatus | null
  fulfillment_released_at: string | null
}

export interface SaleReturnItemDetail {
  id: string
  return_id: string
  sale_item_id: string
  quantity_in_unit: number
  quantity_pieces: number
  refund_amount_cfa: number
}

export interface SaleReturnDetail {
  id: string
  sale_id: string
  shift_id: string | null
  processed_by: string
  reason: string | null
  refund_amount_cfa: number
  balance_adjustment_cfa: number
  cash_refunded_cfa: number
  created_at: string
  sale_return_items: SaleReturnItemDetail[]
}

export interface SaleItemDetail {
  id: string
  sale_id: string
  product_id: string
  unit_level: number
  quantity_in_unit: number
  quantity_pieces: number
  unit_price_cfa: number
  cost_price_cfa: number
  line_total_cfa: number
  net_line_total_cfa: number
  product_name: string
  unit_name: string
}

export interface SalePaymentDetail {
  id: string
  customer_id: string | null
  sale_id: string | null
  payment_type: string
  amount_cfa: number
  recorded_at: string
  is_reversed: boolean
  reversed_at: string | null
}

export interface SaleDetailData extends Sale {
  customer_name: string | null
  customer_phone: string | null
  customer_balance_owed_cfa: number | null
  cashier_name: string | null
  cashier_role: string | null
  shift_opened_at?: string | null
  shift_closed_at?: string | null
  fulfillment: SaleFulfillmentRow | null
  items: SaleItemDetail[]
  returns: SaleReturnDetail[]
  payments: SalePaymentDetail[]
}

export interface SalesListFilters {
  depotId?: string | null
  customerId?: string
  cashierId?: string
  shiftId?: string
  status?: SaleStatus | null
  search?: string
  shiftFilter?: ShiftFilter
  /** Inclusive YMD (Abidjan / UTC+0) */
  startDate?: string
  /** Inclusive YMD (Abidjan / UTC+0) */
  endDate?: string
  fulfillmentStatus?: FulfillmentStatus | null
  page?: number
  pageSize?: number
}

export interface UnshiftedSalesSummaryFilters {
  depotId?: string | null
  search?: string
}

export interface UnshiftedShiftWindow {
  cashierId: string
  openedAt: string
  closedAt: string | null
}

// ─────────────────────────────────────────────────────────────────
// Query key factory
// ─────────────────────────────────────────────────────────────────

export const saleKeys = {
  all:    ['sales'] as const,
  lists:  () => ['sales', 'list'] as const,
  list:   (filters: SalesListFilters) => ['sales', 'list', filters] as const,
  detail: (id: string) => ['sales', 'detail', id] as const,
  unshiftedSummary: (scope: UnshiftedSalesSummaryFilters) =>
    ['sales', 'list', 'unshifted-summary', scope] as const,
  unshiftedWindow: (scope: UnshiftedShiftWindow) =>
    ['sales', 'list', 'unshifted-window', scope] as const,
}

const SALE_SHIFT_EMBED = 'shifts!shift_id(opened_at, closed_at, status)'

function flattenShiftEmbed(row: {
  shifts?: { opened_at?: string; closed_at?: string | null } | { opened_at?: string; closed_at?: string | null }[] | null
}): { shift_opened_at: string | null; shift_closed_at: string | null } {
  const shift = embedOne(row.shifts)
  return {
    shift_opened_at: shift?.opened_at ?? null,
    shift_closed_at: shift?.closed_at ?? null,
  }
}

function applyShiftFilter<
  T extends {
    is: (column: string, value: null) => T
    not: (column: string, operator: string, value: null) => T
  },
>(q: T, shiftFilter?: ShiftFilter): T {
  if (shiftFilter === 'no_shift') {
    return q.is('shift_id', null)
  }
  if (shiftFilter === 'with_shift') {
    return q.not('shift_id', 'is', null)
  }
  return q
}

// ─────────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────────

export async function fetchSalesList(filters: SalesListFilters): Promise<{
  data: SaleListItem[]
  count: number
}> {
  const page = filters.page ?? 0
  const pageSize = filters.pageSize ?? 30
  const from = page * pageSize
  const to = from + pageSize - 1

  // Filters are applied before order/range so pagination is on the
  // filtered set (PostgREST also does this; the JS call order must
  // match for filter-aware clients and tests).
  const fulfillmentEmbed =
    filters.fulfillmentStatus != null
      ? 'sale_fulfillments!inner(status, released_at)'
      : 'sale_fulfillments(status, released_at)'

  let q = supabase
    .from('sales')
    .select(
      `
      *,
      customers!customer_id(name),
      staff!cashier_id(full_name, role),
      ${fulfillmentEmbed},
      ${SALE_SHIFT_EMBED}
      `,
      { count: 'exact' },
    )

  if (filters.depotId) {
    q = q.eq('depot_id', filters.depotId)
  }

  if (filters.customerId) {
    q = q.eq('customer_id', filters.customerId)
  }

  if (filters.status) {
    q = q.eq('status', filters.status)
  }

  if (filters.fulfillmentStatus) {
    q = q.eq('sale_fulfillments.status', filters.fulfillmentStatus)
  }

  if (filters.search?.trim()) {
    q = q.ilike('receipt_number', `%${filters.search.trim()}%`)
  }

  if (filters.cashierId) {
    q = q.eq('cashier_id', filters.cashierId)
  }

  if (filters.shiftId) {
    q = q.eq('shift_id', filters.shiftId)
  } else {
    q = applyShiftFilter(q, filters.shiftFilter)
  }

  if (filters.startDate) {
    q = q.gte('created_at', `${filters.startDate}T00:00:00.000Z`)
  }

  if (filters.endDate) {
    q = q.lte('created_at', `${filters.endDate}T23:59:59.999Z`)
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) throw error

  const items: SaleListItem[] = (data ?? []).map((row: any) => {
    const ff = embedOne(row.sale_fulfillments)
    const customer = embedOne(row.customers)
    const staff = embedOne(row.staff)
    return {
      ...row,
      customer_name: customer?.name ?? null,
      cashier_name: staff?.full_name ?? null,
      cashier_role: staff?.role ?? null,
      fulfillment_status: ff?.status ?? null,
      fulfillment_released_at: ff?.released_at ?? null,
      ...flattenShiftEmbed(row),
    }
  })

  return { data: items, count: count ?? 0 }
}

export async function fetchSaleDetail(id: string): Promise<SaleDetailData> {
  const [saleRes, itemsRes, returnsRes, paymentsRes] = await Promise.all([
    supabase
      .from('sales')
      .select(
        `
        *,
        customers!customer_id(name, phone, balance_owed_cfa),
        staff!cashier_id(full_name, role),
        sale_fulfillments(
          status,
          released_at,
          released_by,
          depot_id,
          created_at,
          released_by_staff:staff!sale_fulfillments_released_by_fkey(full_name)
        ),
        ${SALE_SHIFT_EMBED}
        `,
      )
      .eq('id', id)
      .single(),
    supabase
      .from('sale_items')
      .select(
        `
        *,
        products!product_id(name, product_units(unit_level, unit_name))
        `,
      )
      .eq('sale_id', id)
      .order('id'),
    supabase
      .from('sale_returns')
      .select(`*, sale_return_items(*)`)
      .eq('sale_id', id)
      .order('created_at'),
    supabase
      .from('payments')
      .select('*')
      .eq('sale_id', id)
      .order('recorded_at'),
  ])

  if (saleRes.error) throw saleRes.error
  if (itemsRes.error) throw itemsRes.error
  if (returnsRes.error) throw returnsRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const items: SaleItemDetail[] = (itemsRes.data ?? []).map((item: any) => {
    const product = embedOne(item.products)
    const units = product?.product_units ?? []
    const unitRow = units.find((u: any) => u.unit_level === item.unit_level)
    return {
      id: item.id,
      sale_id: item.sale_id,
      product_id: item.product_id,
      unit_level: item.unit_level,
      quantity_in_unit: item.quantity_in_unit,
      quantity_pieces: item.quantity_pieces,
      unit_price_cfa: item.unit_price_cfa,
      cost_price_cfa: item.cost_price_cfa,
      line_total_cfa: item.line_total_cfa,
      net_line_total_cfa: item.net_line_total_cfa,
      product_name: product?.name ?? '',
      unit_name: unitRow?.unit_name ?? '',
    }
  })

  const saleAny = saleRes.data as any
  const ff = embedOne(saleAny.sale_fulfillments)
  const customer = embedOne(saleAny.customers)
  const staff = embedOne(saleAny.staff)
  const releasedBy = embedOne(ff?.released_by_staff)
  return {
    ...(saleAny as any),
    customer_name: customer?.name ?? null,
    customer_phone: customer?.phone ?? null,
    customer_balance_owed_cfa: customer?.balance_owed_cfa ?? null,
    cashier_name: staff?.full_name ?? null,
    cashier_role: staff?.role ?? null,
    fulfillment: ff
      ? ({
          sale_id: id,
          depot_id: ff.depot_id,
          status: ff.status,
          released_at: ff.released_at,
          released_by: ff.released_by,
          released_by_name: releasedBy?.full_name ?? null,
          created_at: ff.created_at,
        } satisfies SaleFulfillmentRow)
      : null,
    ...flattenShiftEmbed(saleAny),
    items,
    returns: (returnsRes.data ?? []) as SaleReturnDetail[],
    payments: (paymentsRes.data ?? []) as SalePaymentDetail[],
  }
}

// ─────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────

export async function fetchUnshiftedSalesSummary(
  filters: UnshiftedSalesSummaryFilters,
): Promise<UnshiftedSalesTotals> {
  let q = supabase
    .from('sales')
    .select('total_cfa, status')
    .is('shift_id', null)
    .neq('status', 'voided')

  if (filters.depotId) {
    q = q.eq('depot_id', filters.depotId)
  }

  if (filters.search?.trim()) {
    q = q.ilike('receipt_number', `%${filters.search.trim()}%`)
  }

  const { data, error } = await q
  if (error) throw error
  return sumUnshiftedSales((data ?? []) as Array<{ total_cfa: number; status: string }>)
}

export async function fetchUnshiftedSalesForShiftWindow(
  window: UnshiftedShiftWindow,
  now: Date = new Date(),
): Promise<UnshiftedSalesTotals> {
  const until = window.closedAt ?? now.toISOString()
  const { data, error } = await supabase
    .from('sales')
    .select('total_cfa, status')
    .eq('cashier_id', window.cashierId)
    .is('shift_id', null)
    .neq('status', 'voided')
    .gte('created_at', window.openedAt)
    .lt('created_at', until)

  if (error) throw error
  return sumUnshiftedSales((data ?? []) as Array<{ total_cfa: number; status: string }>)
}

export function useSalesList(filters: SalesListFilters) {
  return useQuery({
    queryKey: saleKeys.list(filters),
    queryFn:  () => fetchSalesList(filters),
    staleTime: CACHE_STALE.salesList,
    placeholderData: keepPlaceholderWhen((prevKey) => {
      const prev = prevKey[2] as SalesListFilters | undefined
      return (prev?.depotId ?? null) === (filters.depotId ?? null)
    }),
  })
}

export function useSaleDetail(id: string | null) {
  return useQuery({
    queryKey: saleKeys.detail(id ?? ''),
    queryFn:  () => fetchSaleDetail(id!),
    enabled:  !!id,
    staleTime: CACHE_STALE.salesDetail,
  })
}

export function useUnshiftedSalesSummary(filters: UnshiftedSalesSummaryFilters, enabled: boolean) {
  return useQuery({
    queryKey: saleKeys.unshiftedSummary(filters),
    queryFn: () => fetchUnshiftedSalesSummary(filters),
    enabled,
    staleTime: CACHE_STALE.salesList,
  })
}

export function useUnshiftedSalesForShiftWindow(window: UnshiftedShiftWindow | null) {
  return useQuery({
    queryKey: saleKeys.unshiftedWindow(window ?? { cashierId: '', openedAt: '', closedAt: null }),
    queryFn: () => fetchUnshiftedSalesForShiftWindow(window!),
    enabled: !!window,
    staleTime: CACHE_STALE.salesList,
  })
}

/**
 * useInvalidateSales — call after any sale mutation (complete, return, void).
 */
export function useInvalidateSales() {
  const queryClient = useQueryClient()
  return (saleId?: string, customerId?: string, shiftId?: string) => {
    invalidateAfterSaleSettled(queryClient, { saleId, customerId, shiftId })
  }
}
