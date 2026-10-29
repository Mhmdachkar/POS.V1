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
import { fillCashierNames } from '@/lib/staffDisplayNames'
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
  line_discount_cfa: number
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
  serial_number: string | null
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

/** Derived from amount_applied_cfa / balance_added_cfa (no cash|mobile|bank column). */
export type SalePaymentKind = 'cash' | 'credit' | 'mixed'

export interface SalesListFilters {
  depotId?: string | null
  customerId?: string
  cashierId?: string
  shiftId?: string
  status?: SaleStatus | null
  search?: string
  /** Espèces / À crédit / Mixte derived filter. */
  paymentKind?: SalePaymentKind | null
  shiftFilter?: ShiftFilter
  /** Inclusive YMD (Abidjan / UTC+0) */
  startDate?: string
  /** Inclusive YMD (Abidjan / UTC+0) */
  endDate?: string
  fulfillmentStatus?: FulfillmentStatus | null
  page?: number
  pageSize?: number
}

export interface SalesListTotals {
  count: number
  total_cfa: number
  amount_applied_cfa: number
  balance_added_cfa: number
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
  totals: (filters: SalesListFilters) => ['sales', 'totals', filters] as const,
  detail: (id: string) => ['sales', 'detail', id] as const,
  unshiftedSummary: (scope: UnshiftedSalesSummaryFilters) =>
    ['sales', 'list', 'unshifted-summary', scope] as const,
  unshiftedWindow: (scope: UnshiftedShiftWindow) =>
    ['sales', 'list', 'unshifted-window', scope] as const,
}

const EXPORT_ROW_CAP = 2000

function escapeOrValue(value: string): string {
  return value.replace(/[,()]/g, '')
}

async function resolveSalesSearchOrFilter(search: string): Promise<string> {
  const term = search.trim()
  const pattern = `%${term}%`
  const [customersRes, staffRes] = await Promise.all([
    supabase.from('customers').select('id').ilike('name', pattern).limit(100),
    supabase.from('staff').select('id').ilike('full_name', pattern).limit(100),
  ])
  if (customersRes.error) throw customersRes.error
  if (staffRes.error) throw staffRes.error

  const parts = [`receipt_number.ilike.${escapeOrValue(pattern)}`]
  const customerIds = ((customersRes.data ?? []) as Array<{ id: string }>).map((r) => r.id)
  const staffIds = ((staffRes.data ?? []) as Array<{ id: string }>).map((r) => r.id)
  if (customerIds.length > 0) {
    parts.push(`customer_id.in.(${customerIds.map(escapeOrValue).join(',')})`)
  }
  if (staffIds.length > 0) {
    parts.push(`cashier_id.in.(${staffIds.map(escapeOrValue).join(',')})`)
  }
  return parts.join(',')
}

function applyPaymentKindFilter<
  T extends {
    gt: (column: string, value: number) => T
    eq: (column: string, value: string | number) => T
  },
>(q: T, paymentKind?: SalePaymentKind | null): T {
  if (paymentKind === 'cash') {
    return q.gt('amount_applied_cfa', 0).eq('balance_added_cfa', 0)
  }
  if (paymentKind === 'credit') {
    return q.eq('amount_applied_cfa', 0).gt('balance_added_cfa', 0)
  }
  if (paymentKind === 'mixed') {
    return q.gt('amount_applied_cfa', 0).gt('balance_added_cfa', 0)
  }
  return q
}

/**
 * Shared sales list filters (before order/range).
 * Must stay sync on the builder — awaiting a PostgREST builder unwraps its .then().
 */
function applySalesListFilters<
  T extends {
    eq: (column: string, value: string | number) => T
    or: (filters: string) => T
    gte: (column: string, value: string) => T
    lte: (column: string, value: string) => T
    is: (column: string, value: null) => T
    not: (column: string, operator: string, value: null) => T
    gt: (column: string, value: number) => T
  },
>(q: T, filters: SalesListFilters, searchOr: string | null): T {
  let next = q
  if (filters.depotId) {
    next = next.eq('depot_id', filters.depotId)
  }
  if (filters.customerId) {
    next = next.eq('customer_id', filters.customerId)
  }
  if (filters.status) {
    next = next.eq('status', filters.status)
  }
  if (filters.fulfillmentStatus) {
    next = next.eq('sale_fulfillments.status', filters.fulfillmentStatus)
  }
  if (searchOr) {
    next = next.or(searchOr)
  }
  if (filters.cashierId) {
    next = next.eq('cashier_id', filters.cashierId)
  }
  if (filters.shiftId) {
    next = next.eq('shift_id', filters.shiftId)
  } else {
    next = applyShiftFilter(next, filters.shiftFilter)
  }
  next = applyPaymentKindFilter(next, filters.paymentKind)
  if (filters.startDate) {
    next = next.gte('created_at', `${filters.startDate}T00:00:00.000Z`)
  }
  if (filters.endDate) {
    next = next.lte('created_at', `${filters.endDate}T23:59:59.999Z`)
  }
  return next
}

async function resolveSearchOr(filters: SalesListFilters): Promise<string | null> {
  if (!filters.search?.trim()) return null
  return resolveSalesSearchOrFilter(filters.search)
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

function mapSaleListRows(data: unknown[]): SaleListItem[] {
  return (data ?? []).map((row: any) => {
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
}

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

  const searchOr = await resolveSearchOr(filters)
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

  q = applySalesListFilters(q, filters, searchOr)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) throw error

  const items = mapSaleListRows(data ?? [])
  return { data: await fillCashierNames(items), count: count ?? 0 }
}

/** Totals for the full filtered set (not just the current page). */
export async function fetchSalesListTotals(
  filters: SalesListFilters,
): Promise<SalesListTotals> {
  const fulfillmentEmbed =
    filters.fulfillmentStatus != null
      ? 'sale_fulfillments!inner(status)'
      : undefined

  const searchOr = await resolveSearchOr(filters)
  let q = supabase
    .from('sales')
    .select(
      fulfillmentEmbed
        ? `total_cfa, admin_override_total_cfa, amount_applied_cfa, balance_added_cfa, ${fulfillmentEmbed}`
        : 'total_cfa, admin_override_total_cfa, amount_applied_cfa, balance_added_cfa',
      { count: 'exact' },
    )

  q = applySalesListFilters(q, filters, searchOr)

  const { data, error, count } = await q.limit(EXPORT_ROW_CAP)
  if (error) throw error

  let total_cfa = 0
  let amount_applied_cfa = 0
  let balance_added_cfa = 0
  for (const row of data ?? []) {
    const r = row as {
      total_cfa: number
      admin_override_total_cfa: number | null
      amount_applied_cfa: number
      balance_added_cfa: number
    }
    total_cfa += r.admin_override_total_cfa ?? r.total_cfa
    amount_applied_cfa += r.amount_applied_cfa
    balance_added_cfa += r.balance_added_cfa
  }

  return {
    count: count ?? 0,
    total_cfa,
    amount_applied_cfa,
    balance_added_cfa,
  }
}

/** Filtered rows for CSV/Excel (capped). */
export async function fetchSalesListForExport(
  filters: SalesListFilters,
): Promise<{ data: SaleListItem[]; truncated: boolean; count: number }> {
  const fulfillmentEmbed =
    filters.fulfillmentStatus != null
      ? 'sale_fulfillments!inner(status, released_at)'
      : 'sale_fulfillments(status, released_at)'

  const searchOr = await resolveSearchOr(filters)
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

  q = applySalesListFilters(q, filters, searchOr)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .limit(EXPORT_ROW_CAP)
  if (error) throw error

  const items = await fillCashierNames(mapSaleListRows(data ?? []))
  const total = count ?? items.length
  return {
    data: items,
    count: total,
    truncated: total > EXPORT_ROW_CAP,
  }
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
        products!product_id(name, product_units(unit_level, unit_name, serial_number))
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
      line_discount_cfa: Number(item.line_discount_cfa ?? 0),
      line_total_cfa: item.line_total_cfa,
      net_line_total_cfa: item.net_line_total_cfa,
      product_name: product?.name ?? '',
      unit_name: unitRow?.unit_name ?? '',
      serial_number: unitRow?.serial_number ?? null,
    }
  })

  const saleAny = saleRes.data as any
  const ff = embedOne(saleAny.sale_fulfillments)
  const customer = embedOne(saleAny.customers)
  const staff = embedOne(saleAny.staff)
  const releasedBy = embedOne(ff?.released_by_staff)
  const detail = {
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
  const [named] = await fillCashierNames([detail])
  return named
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

/** Totals ignore page/pageSize so changing page does not refetch. */
export function useSalesListTotals(filters: SalesListFilters) {
  const { page: _page, pageSize: _pageSize, ...rest } = filters
  return useQuery({
    queryKey: saleKeys.totals(rest),
    queryFn: () => fetchSalesListTotals(rest),
    staleTime: CACHE_STALE.salesList,
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
