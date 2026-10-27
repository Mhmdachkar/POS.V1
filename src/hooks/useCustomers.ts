/**
 * useCustomers — TanStack Query hooks for customer data and mutations.
 *
 * Customer model:
 *   - Customers are global entities (not depot-scoped).
 *   - RLS: admin=all, cashier=all, depot_staff=none.
 *   - balance_owed_cfa is authoritative and maintained by RPCs — never set client-side.
 *   - Pooled balance model: no payment-to-sale allocation.
 *
 * Phase 6 security fix:
 *   - useCreateCustomer previously used supabase.from('customers').insert() directly.
 *     Phase 3 hardening revoked INSERT on public tables from the authenticated role;
 *     this would throw a PostgreSQL permission error on a live database.
 *   - Fixed: all mutations now go through SECURITY DEFINER RPCs (rpc.createCustomer, etc.)
 *
 * Lifecycle policy:
 *   - Active customers: full POS eligibility, can receive new sales and payments.
 *   - Inactive customers: hidden from POS search; cannot receive new sales (enforced
 *     by complete_sale() backend check); can still receive payments for existing balance
 *     without requiring reactivation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { rpc } from '@/lib/rpc'
import { fetchStaffDisplayNameMap } from '@/lib/staffDisplayNames'
import { parseError } from '@/lib/errors'
import { CACHE_STALE } from '@/lib/cachePolicy'
import type { Customer, Payment } from '@/types/database'
import type {
  CreateCustomerParams,
  UpdateCustomerParams,
  DeactivateCustomerParams,
  ReactivateCustomerParams,
} from '@/types/rpc'

// ─────────────────────────────────────────────────────────────────
// List params / query key factories
// ─────────────────────────────────────────────────────────────────

export type CustomerListFilter = 'all' | 'active' | 'inactive' | 'with_balance'

export interface CustomerListParams {
  page: number
  pageSize: number
  search: string
  filter: CustomerListFilter
}

export const customerKeys = {
  all:      ['customers'] as const,
  search:   (query: string, activeOnly?: boolean) =>
    ['customers', 'search', query, activeOnly ?? false] as const,
  detail:   (id: string)  => ['customers', 'detail', id] as const,
  /** List key includes page + search + filter so caches do not collide across filters. */
  list:     (params: Pick<CustomerListParams, 'page' | 'search' | 'filter'>) =>
    ['customers', 'list', { page: params.page, search: params.search, filter: params.filter }] as const,
  payments: (customerId: string) => ['customers', 'payments', customerId] as const,
  /**
   * Customer-scoped account activity (sales, returns, standalone payments).
   * Nested under `all` so sale/return/payment invalidation of ['customers']
   * refreshes activity without a separate cache system.
   */
  activity: (
    customerId: string,
    filters: { type: 'all' | 'sale' | 'return' | 'payment'; page: number; pageSize: number },
  ) => ['customers', 'activity', customerId, filters] as const,
  activitySummary: (customerId: string) =>
    ['customers', 'activity-summary', customerId] as const,
}

export const paymentKeys = {
  all:        ['payments'] as const,
  list:       (filters: Record<string, unknown>) => ['payments', 'list', filters] as const,
  forCustomer: (customerId: string) => ['payments', 'customer', customerId] as const,
}

// ─────────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────────

async function fetchCustomerSearch(query: string, activeOnly: boolean): Promise<Customer[]> {
  let q = supabase
    .from('customers')
    .select('*')
    .order('name')
    .limit(30)

  if (query.trim()) {
    q = q.or(`name.ilike.%${query.trim()}%,phone.ilike.%${query.trim()}%`)
  }

  if (activeOnly) {
    q = q.eq('is_active', true)
  }

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Customer[]
}

async function fetchCustomer(id: string): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Customer
}

async function fetchCustomerList(params: CustomerListParams): Promise<{ data: Customer[]; count: number }> {
  const { page, pageSize, search, filter } = params
  const from = page * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .order('name')
    .range(from, to)

  if (search.trim()) {
    q = q.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`)
  }

  if (filter === 'active') {
    q = q.eq('is_active', true)
  } else if (filter === 'inactive') {
    q = q.eq('is_active', false)
  } else if (filter === 'with_balance') {
    q = q.gt('balance_owed_cfa', 0)
  }

  const { data, error, count } = await q
  if (error) throw error
  return { data: (data ?? []) as Customer[], count: count ?? 0 }
}

async function fetchCustomerPayments(customerId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('customer_id', customerId)
    .eq('payment_type', 'customer_payment')
    .order('recorded_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as Payment[]
}

interface PaymentListParams {
  page: number
  pageSize: number
  customerSearch: string
  showReversed: boolean
}

async function fetchPaymentList(
  params: PaymentListParams,
): Promise<{ data: Array<Payment & { customer_name: string | null; recorded_by_name: string | null }>; count: number }> {
  const { page, pageSize, customerSearch, showReversed } = params
  const from = page * pageSize
  const to = from + pageSize - 1

  // If filtering by customer name, first resolve matching customer IDs.
  // PostgREST does not support filtering on embedded resource columns directly.
  let customerIdFilter: string[] | null = null
  if (customerSearch.trim()) {
    const { data: matching } = await supabase
      .from('customers')
      .select('id')
      .ilike('name', `%${customerSearch.trim()}%`)
      .limit(200)
    customerIdFilter = (matching ?? []).map((c: any) => c.id)
    // If no matching customers, return empty result immediately
    if (customerIdFilter.length === 0) {
      return { data: [], count: 0 }
    }
  }

  let q = supabase
    .from('payments')
    .select('*, customers(name)', { count: 'exact' })
    .eq('payment_type', 'customer_payment')
    .order('recorded_at', { ascending: false })
    .range(from, to)

  if (!showReversed) {
    q = q.eq('is_reversed', false)
  }

  if (customerIdFilter !== null) {
    q = q.in('customer_id', customerIdFilter)
  }

  const { data, error, count } = await q
  if (error) throw error

  // Flatten join
  const rows = ((data ?? []) as any[]).map((p: any) => ({
    ...p,
    customer_name: p.customers?.name ?? null,
    recorded_by_name: null,
    customers: undefined,
  }))

  const recorderIds = [...new Set(rows.map((p) => p.recorded_by).filter(Boolean))] as string[]
  if (recorderIds.length > 0) {
    const byId = await fetchStaffDisplayNameMap(recorderIds)
    for (const row of rows) {
      row.recorded_by_name = byId.get(row.recorded_by) ?? null
    }
  }

  return { data: rows, count: count ?? 0 }
}

// ─────────────────────────────────────────────────────────────────
// Hooks — read
// ─────────────────────────────────────────────────────────────────

/**
 * useCustomerSearch — debounced customer search by name or phone.
 * @param activeOnly When true, only returns is_active=true customers.
 *   Use true for POS selector (inactive customers are not selectable at POS).
 *   Use false for admin list pages where all customers are shown.
 */
export function useCustomerSearch(query: string, enabled = true, activeOnly = false) {
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  return useQuery({
    queryKey: customerKeys.search(debouncedQuery, activeOnly),
    queryFn:  () => fetchCustomerSearch(debouncedQuery, activeOnly),
    enabled,
    staleTime: CACHE_STALE.customerList,
    placeholderData: (prev) => prev,
  })
}

/**
 * useCustomer — fetch a single customer by ID.
 * Shows current up-to-date balance. Works for both active and inactive customers
 * (needed for historical sale detail views).
 */
export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: customerKeys.detail(id ?? ''),
    queryFn:  () => fetchCustomer(id!),
    enabled:  !!id,
    staleTime: CACHE_STALE.customerDetail,
  })
}

/**
 * useCustomerList — paginated customer list for the /customers page.
 */
export function useCustomerList(params: CustomerListParams) {
  return useQuery({
    queryKey: customerKeys.list({
      page: params.page,
      search: params.search,
      filter: params.filter,
    }),
    queryFn:  () => fetchCustomerList(params),
    staleTime: CACHE_STALE.customerList,
    placeholderData: (prev) => prev,
  })
}

/**
 * useCustomerPayments — recent customer_payment records for a specific customer.
 * RLS ensures cashiers only see payments within their depot.
 */
export function useCustomerPayments(customerId: string | null) {
  return useQuery({
    queryKey: customerKeys.payments(customerId ?? ''),
    queryFn:  () => fetchCustomerPayments(customerId!),
    enabled:  !!customerId,
    staleTime: CACHE_STALE.customerList,
  })
}

/**
 * usePaymentList — paginated customer_payment list for the /payments page.
 * Depot isolation is enforced by the payments RLS policy (Phase 6 amendment).
 */
export function usePaymentList(params: PaymentListParams) {
  return useQuery({
    queryKey: paymentKeys.list(params as unknown as Record<string, unknown>),
    queryFn:  () => fetchPaymentList(params),
    staleTime: CACHE_STALE.customerList,
    placeholderData: (prev) => prev,
  })
}

// ─────────────────────────────────────────────────────────────────
// Hooks — mutations (all via SECURITY DEFINER RPCs)
// ─────────────────────────────────────────────────────────────────

/**
 * useCreateCustomer — create a customer via RPC (Phase 6 security fix).
 *
 * Previously used supabase.from('customers').insert() — this violated Phase 3
 * hardening (INSERT revoked from authenticated role). Now uses rpc.createCustomer()
 * which calls a SECURITY DEFINER function with proper auth and audit.
 *
 * No idempotency key: customer creation is not a financial event.
 * Protect against double-submit via isSubmitting / isPending state in UI.
 */
export function useCreateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateCustomerParams) => {
      const result = await rpc.createCustomer(input)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
    },
  })
}

/**
 * useUpdateCustomer — update name/phone/address via RPC.
 * Does NOT update balance_owed_cfa, is_active, or deactivated_at.
 * Roles: cashier, admin.
 */
export function useUpdateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateCustomerParams) => {
      const result = await rpc.updateCustomer(input)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(variables.p_customer_id) })
    },
  })
}

/**
 * useDeactivateCustomer — soft-deactivate a customer. Admin only.
 * Outstanding balance is preserved. Inactive customers may still receive
 * payments via record_payment() without reactivation.
 */
export function useDeactivateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: DeactivateCustomerParams) => {
      const result = await rpc.deactivateCustomer(input)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(variables.p_customer_id) })
    },
  })
}

/**
 * useReactivateCustomer — restore is_active=true. Admin only.
 * After reactivation the customer is immediately eligible for new POS sales.
 */
export function useReactivateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ReactivateCustomerParams) => {
      const result = await rpc.reactivateCustomer(input)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(variables.p_customer_id) })
    },
  })
}

/**
 * useRecordPayment — standalone debt payment. Roles: cashier, admin.
 * Reduces customer.balance_owed_cfa via record_payment() RPC.
 * Works on both active AND inactive customers (inactive customers may repay existing debt).
 * Pooled model: payment_type='customer_payment', sale_id=NULL.
 */
export function useRecordPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      p_customer_id: string
      p_amount_cfa: number
      p_shift_id?: string | null
      p_note?: string | null
    }) => {
      const result = await rpc.recordPayment(input)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, variables) => {
      // Refresh customer balance (authoritative from server)
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(variables.p_customer_id) })
      // customerKeys.all also covers activity + activity-summary
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
      // Refresh payment lists
      queryClient.invalidateQueries({ queryKey: paymentKeys.all })
      queryClient.invalidateQueries({ queryKey: customerKeys.payments(variables.p_customer_id) })
    },
  })
}

/**
 * useInvalidateCustomers — helper for POS success flow.
 * Call after a credit sale to refresh the customer's balance display.
 */
export function useInvalidateCustomers() {
  const queryClient = useQueryClient()
  return {
    invalidateCustomer: (id: string) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) })
    },
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
    },
  }
}

// Re-export parseError for mutation error handling in components
export { parseError }
