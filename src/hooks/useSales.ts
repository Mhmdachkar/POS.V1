/**
 * useSales — TanStack Query hooks for sales data.
 *
 * Provides:
 *   useSalesList   — paginated, filterable sales list
 *   useSaleDetail  — single sale with items, returns, payments
 *   useInvalidateSales — after mutation, refreshes affected caches
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Sale, SaleStatus } from '@/types/database'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface SaleListItem extends Sale {
  customer_name: string | null
  cashier_name: string | null
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
  items: SaleItemDetail[]
  returns: SaleReturnDetail[]
  payments: SalePaymentDetail[]
}

export interface SalesListFilters {
  depotId?: string | null
  customerId?: string
  status?: SaleStatus | null
  search?: string
  page?: number
  pageSize?: number
}

// ─────────────────────────────────────────────────────────────────
// Query key factory
// ─────────────────────────────────────────────────────────────────

export const saleKeys = {
  all:    ['sales'] as const,
  lists:  () => ['sales', 'list'] as const,
  list:   (filters: SalesListFilters) => ['sales', 'list', filters] as const,
  detail: (id: string) => ['sales', 'detail', id] as const,
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
  let q = supabase
    .from('sales')
    .select(
      `
      *,
      customers!customer_id(name),
      staff!cashier_id(full_name)
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

  if (filters.search?.trim()) {
    q = q.ilike('receipt_number', `%${filters.search.trim()}%`)
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) throw error

  const items: SaleListItem[] = (data ?? []).map((row: any) => ({
    ...row,
    customer_name: row.customers?.name ?? null,
    cashier_name: row.staff?.full_name ?? null,
  }))

  return { data: items, count: count ?? 0 }
}

async function fetchSaleDetail(id: string): Promise<SaleDetailData> {
  // Fetch sale + customer + cashier
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select(
      `
      *,
      customers!customer_id(name, phone, balance_owed_cfa),
      staff!cashier_id(full_name)
      `,
    )
    .eq('id', id)
    .single()

  if (saleError) throw saleError

  // Fetch sale items + product names
  const { data: itemsRaw, error: itemsError } = await supabase
    .from('sale_items')
    .select(
      `
      *,
      products!product_id(name, product_units(unit_level, unit_name))
      `,
    )
    .eq('sale_id', id)
    .order('id')

  if (itemsError) throw itemsError

  // Fetch sale returns + return items
  const { data: returnsRaw, error: returnsError } = await supabase
    .from('sale_returns')
    .select(`*, sale_return_items(*)`)
    .eq('sale_id', id)
    .order('created_at')

  if (returnsError) throw returnsError

  // Fetch payments for this sale
  const { data: paymentsRaw, error: paymentsError } = await supabase
    .from('payments')
    .select('*')
    .eq('sale_id', id)
    .order('recorded_at')

  if (paymentsError) throw paymentsError

  // Build items with resolved product/unit names
  const items: SaleItemDetail[] = (itemsRaw ?? []).map((item: any) => {
    const product = item.products
    const unitRow = (product?.product_units ?? []).find(
      (u: any) => u.unit_level === item.unit_level,
    )
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
      product_name: product?.name ?? 'Unknown Product',
      unit_name:
        unitRow?.unit_name ??
        (item.unit_level === 0 ? 'Piece' : item.unit_level === 1 ? 'Package' : 'Carton'),
    }
  })

  const saleAny = sale as any
  return {
    ...(sale as any),
    customer_name: saleAny.customers?.name ?? null,
    customer_phone: saleAny.customers?.phone ?? null,
    customer_balance_owed_cfa: saleAny.customers?.balance_owed_cfa ?? null,
    cashier_name: saleAny.staff?.full_name ?? null,
    items,
    returns: (returnsRaw ?? []) as SaleReturnDetail[],
    payments: (paymentsRaw ?? []) as SalePaymentDetail[],
  }
}

// ─────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────

export function useSalesList(filters: SalesListFilters) {
  return useQuery({
    queryKey: saleKeys.list(filters),
    queryFn:  () => fetchSalesList(filters),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  })
}

export function useSaleDetail(id: string | null) {
  return useQuery({
    queryKey: saleKeys.detail(id ?? ''),
    queryFn:  () => fetchSaleDetail(id!),
    enabled:  !!id,
    staleTime: 10_000,
  })
}

/**
 * useInvalidateSales — call after any sale mutation (complete, return, void).
 * Invalidates list + the specific sale detail.
 */
export function useInvalidateSales() {
  const queryClient = useQueryClient()
  return (saleId?: string) => {
    queryClient.invalidateQueries({ queryKey: saleKeys.lists() })
    if (saleId) {
      queryClient.invalidateQueries({ queryKey: saleKeys.detail(saleId) })
    }
  }
}
