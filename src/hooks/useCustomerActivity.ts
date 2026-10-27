/**
 * useCustomerActivity — customer-scoped sales / returns / payments timeline.
 *
 * Activity is an explanatory event list, not a ledger.
 * Current balance always comes from customer.balance_owed_cfa.
 *
 * Standalone customer_payment rows are never treated as allocated to a sale.
 * Returns are first-class events (not inferred from sale status).
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CACHE_STALE, keepPlaceholderWhen } from '@/lib/cachePolicy'
import { customerKeys } from '@/hooks/useCustomers'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { bilingualPlain } from '@/lib/bilingual/types'
import { authoritativeFinalSaleTotal } from '@/lib/saleTotals'

export const CUSTOMER_ACTIVITY_DRAWER_LIMIT = 5
export const CUSTOMER_ACTIVITY_PAGE_SIZE = 25

export type CustomerActivityType = 'sale' | 'return' | 'payment'
export type CustomerActivityTypeFilter = 'all' | CustomerActivityType

export interface CustomerActivityFilters {
  type: CustomerActivityTypeFilter
  page: number
  pageSize: number
}

export interface CustomerActivityEvent {
  id: string
  type: CustomerActivityType
  occurredAt: string
  reference: string
  description: string
  amountCfa: number
  /** Original sale id for sale/return rows so existing sale detail can open. */
  saleId: string | null
  isReversed?: boolean
  /** After this event, newest-first. The first row equals Solde dû. */
  runningBalanceCfa?: number
}

export interface CustomerActivityResult {
  data: CustomerActivityEvent[]
  count: number
}

export interface CustomerActivitySummaryMetric {
  count: number
  /** Null when the amount column was truncated and a lifetime total would be incomplete. */
  totalCfa: number | null
}

export interface CustomerActivitySummary {
  sales: CustomerActivitySummaryMetric
  returns: CustomerActivitySummaryMetric
  payments: CustomerActivitySummaryMetric
}

const SALE_ACTIVITY_SELECT =
  'id, receipt_number, created_at, total_cfa, admin_override_total_cfa, balance_added_cfa, status, customer_id'

const RETURN_ACTIVITY_SELECT = `
  id,
  sale_id,
  refund_amount_cfa,
  balance_adjustment_cfa,
  created_at,
  sales!inner(receipt_number, customer_id),
  sale_return_items(
    quantity_in_unit,
    sale_items(products(name))
  )
`

const PAYMENT_ACTIVITY_SELECT =
  'id, amount_cfa, recorded_at, note, is_reversed, payment_type, sale_id, customer_id'

function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

async function unwrap<T>(
  query: PromiseLike<{ data: T | null; error: unknown; count?: number | null }>,
): Promise<{ data: T; count: number }> {
  const { data, error, count } = await query
  if (error) throw error
  return { data: (data ?? []) as T, count: count ?? 0 }
}

function completeTotal(values: number[], count: number): number | null {
  if (count === 0) return 0
  if (values.length < count) return null
  return values.reduce((sum, n) => sum + n, 0)
}

export function saleActivityDescription(sale: {
  balance_added_cfa?: number | null
  status?: string | null
}): string {
  if (sale.status === 'voided') return bilingualPlain(CUSTOMERS.activitySaleCancelled)
  return (sale.balance_added_cfa ?? 0) > 0
    ? bilingualPlain(CUSTOMERS.activityCreditAdded)
    : bilingualPlain(CUSTOMERS.activityCashSale)
}

export function formatReturnedItemsSummary(
  items: Array<{ quantity_in_unit?: number | null; product_name?: string | null }>,
): string {
  if (items.length === 0) return bilingualPlain(CUSTOMERS.activityReturnedItems)
  return items
    .map((item) => {
      const qty = Number(item.quantity_in_unit ?? 0)
      const name = item.product_name?.trim() || 'Item'
      return `${qty} × ${name}`
    })
    .join(', ')
}

export function emptyActivityMessage(type: CustomerActivityTypeFilter): string {
  if (type === 'sale') return bilingualPlain(CUSTOMERS.activityEmptySales)
  if (type === 'return') return bilingualPlain(CUSTOMERS.activityEmptyReturns)
  if (type === 'payment') return bilingualPlain(CUSTOMERS.activityEmptyPayments)
  return bilingualPlain(CUSTOMERS.activityEmptyAll)
}

export function formatActivityRange(page: number, pageSize: number, count: number): string {
  if (count === 0) return bilingualPlain(CUSTOMERS.activityShowingZero)
  const from = page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, count)
  return bilingualPlain(CUSTOMERS.activityShowingRange(from, to, count))
}

export function mergeActivityEvents(events: CustomerActivityEvent[]): CustomerActivityEvent[] {
  return [...events].sort((a, b) => {
    const byTime = b.occurredAt.localeCompare(a.occurredAt)
    if (byTime !== 0) return byTime
    return b.id.localeCompare(a.id)
  })
}

/** Newest-first: first running balance equals the current Solde dû. */
export function withRunningBalances(
  events: CustomerActivityEvent[],
  currentBalanceCfa: number,
): CustomerActivityEvent[] {
  let running = currentBalanceCfa
  return events.map((event) => {
    const next = { ...event, runningBalanceCfa: running }
    if (!event.isReversed) running -= event.amountCfa
    return next
  })
}

/** Only the unpaid part moves the customer balance. A cash sale nets to 0. */
function saleActivityAmountCfa(row: Record<string, unknown>): number {
  return Number(row.balance_added_cfa ?? 0)
}

function mapSaleEvent(row: Record<string, unknown>): CustomerActivityEvent {
  const receipt = typeof row.receipt_number === 'string' ? row.receipt_number : 'Sale'
  return {
    id: String(row.id),
    type: 'sale',
    occurredAt: String(row.created_at),
    reference: receipt,
    description: saleActivityDescription({
      balance_added_cfa: Number(row.balance_added_cfa ?? 0),
      status: typeof row.status === 'string' ? row.status : null,
    }),
    amountCfa: saleActivityAmountCfa(row),
    saleId: String(row.id),
  }
}

function productNameFromReturnItem(item: Record<string, unknown>): string {
  const saleItem = embedOne(item.sale_items as Record<string, unknown> | Record<string, unknown>[] | null)
  const product = embedOne(
    (saleItem?.products as { name?: string } | { name?: string }[] | null | undefined) ?? null,
  )
  return product?.name?.trim() || 'Item'
}

function mapReturnEvent(row: Record<string, unknown>): CustomerActivityEvent {
  const sale = embedOne(row.sales as { receipt_number?: string } | { receipt_number?: string }[] | null)
  const receipt = sale?.receipt_number?.trim() || 'Original sale'
  const rawItems = Array.isArray(row.sale_return_items) ? row.sale_return_items : []
  const items = rawItems.map((item) => {
    const rec = (item ?? {}) as Record<string, unknown>
    return {
      quantity_in_unit: Number(rec.quantity_in_unit ?? 0),
      product_name: productNameFromReturnItem(rec),
    }
  })
  const summary = formatReturnedItemsSummary(items)
  return {
    id: String(row.id),
    type: 'return',
    occurredAt: String(row.created_at),
    reference: receipt,
    description: `${summary} ${bilingualPlain(CUSTOMERS.activityReturnedSuffix)}`,
    amountCfa: -Number(row.balance_adjustment_cfa ?? 0),
    saleId: typeof row.sale_id === 'string' ? row.sale_id : null,
  }
}

function mapPaymentEvent(row: Record<string, unknown>): CustomerActivityEvent {
  const note =
    typeof row.note === 'string' && row.note.trim()
      ? row.note.trim()
      : bilingualPlain(CUSTOMERS.activityBalancePayment)
  return {
    id: String(row.id),
    type: 'payment',
    occurredAt: String(row.recorded_at),
    reference: bilingualPlain(CUSTOMERS.activityCustomerPaymentRef),
    description: note,
    amountCfa: -Number(row.amount_cfa ?? 0),
    saleId: null,
    isReversed: row.is_reversed === true,
  }
}

function applyWindow<T extends { limit: (n: number) => T; range: (from: number, to: number) => T }>(
  query: T,
  filters: CustomerActivityFilters,
  mode: 'window' | 'page',
): T {
  if (mode === 'window') {
    return query.limit((filters.page + 1) * filters.pageSize)
  }
  const from = filters.page * filters.pageSize
  const to = from + filters.pageSize - 1
  return query.range(from, to)
}

async function fetchSaleEvents(
  customerId: string,
  filters: CustomerActivityFilters,
  mode: 'window' | 'page',
): Promise<CustomerActivityResult> {
  let q = supabase
    .from('sales')
    .select(SALE_ACTIVITY_SELECT, { count: 'exact' })
    .eq('customer_id', customerId)
    .neq('status', 'voided')
    .gt('balance_added_cfa', 0)
    .order('created_at', { ascending: false })
  q = applyWindow(q, filters, mode)
  const { data, count } = await unwrap<Record<string, unknown>[]>(q)
  return { data: data.map(mapSaleEvent), count }
}

async function fetchReturnEvents(
  customerId: string,
  filters: CustomerActivityFilters,
  mode: 'window' | 'page',
): Promise<CustomerActivityResult> {
  let q = supabase
    .from('sale_returns')
    .select(RETURN_ACTIVITY_SELECT, { count: 'exact' })
    .eq('sales.customer_id', customerId)
    .order('created_at', { ascending: false })
  q = applyWindow(q, filters, mode)
  const { data, count } = await unwrap<Record<string, unknown>[]>(q)
  return { data: data.map(mapReturnEvent), count }
}

async function fetchPaymentEvents(
  customerId: string,
  filters: CustomerActivityFilters,
  mode: 'window' | 'page',
): Promise<CustomerActivityResult> {
  let q = supabase
    .from('payments')
    .select(PAYMENT_ACTIVITY_SELECT, { count: 'exact' })
    .eq('customer_id', customerId)
    .eq('payment_type', 'customer_payment')
    .order('recorded_at', { ascending: false })
  q = applyWindow(q, filters, mode)
  const { data, count } = await unwrap<Record<string, unknown>[]>(q)
  return { data: data.map(mapPaymentEvent), count }
}

export async function fetchCustomerActivity(
  customerId: string,
  filters: CustomerActivityFilters,
): Promise<CustomerActivityResult> {
  if (filters.type === 'sale') {
    return fetchSaleEvents(customerId, filters, 'page')
  }
  if (filters.type === 'return') {
    return fetchReturnEvents(customerId, filters, 'page')
  }
  if (filters.type === 'payment') {
    return fetchPaymentEvents(customerId, filters, 'page')
  }

  const [sales, returns, payments] = await Promise.all([
    fetchSaleEvents(customerId, filters, 'window'),
    fetchReturnEvents(customerId, filters, 'window'),
    fetchPaymentEvents(customerId, filters, 'window'),
  ])

  const merged = mergeActivityEvents([...sales.data, ...returns.data, ...payments.data])
  const from = filters.page * filters.pageSize
  return {
    data: merged.slice(from, from + filters.pageSize),
    count: sales.count + returns.count + payments.count,
  }
}

const SUMMARY_PAGE_SIZE = 500

async function fetchAllSummaryRows<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[]; count: number }>,
): Promise<{ data: T[]; count: number }> {
  const first = await fetchPage(0, SUMMARY_PAGE_SIZE - 1)
  const rows = [...first.data]
  const count = first.count
  while (rows.length < count) {
    const from = rows.length
    const page = await fetchPage(from, from + SUMMARY_PAGE_SIZE - 1)
    if (page.data.length === 0) break
    rows.push(...page.data)
    if (page.data.length < SUMMARY_PAGE_SIZE) break
  }
  return { data: rows, count }
}

export async function fetchCustomerActivitySummary(
  customerId: string,
): Promise<CustomerActivitySummary> {
  const [sales, returns, payments] = await Promise.all([
    fetchAllSummaryRows<{
      total_cfa: number
      admin_override_total_cfa?: number | null
    }>((from, to) =>
      unwrap(
        supabase
          .from('sales')
          .select('total_cfa, admin_override_total_cfa', { count: 'exact' })
          .eq('customer_id', customerId)
          .neq('status', 'voided')
          .range(from, to),
      ),
    ),
    fetchAllSummaryRows<{ refund_amount_cfa: number }>((from, to) =>
      unwrap(
        supabase
          .from('sale_returns')
          .select('refund_amount_cfa, sales!inner(customer_id)', { count: 'exact' })
          .eq('sales.customer_id', customerId)
          .range(from, to),
      ),
    ),
    fetchAllSummaryRows<{ amount_cfa: number }>((from, to) =>
      unwrap(
        supabase
          .from('payments')
          .select('amount_cfa', { count: 'exact' })
          .eq('customer_id', customerId)
          .eq('payment_type', 'customer_payment')
          .eq('is_reversed', false)
          .range(from, to),
      ),
    ),
  ])

  return {
    sales: {
      count: sales.count,
      totalCfa: completeTotal(
        sales.data.map((row) =>
          authoritativeFinalSaleTotal({
            total_cfa: Number(row.total_cfa ?? 0),
            admin_override_total_cfa:
              row.admin_override_total_cfa == null ? null : Number(row.admin_override_total_cfa),
          }),
        ),
        sales.count,
      ),
    },
    returns: {
      count: returns.count,
      totalCfa: completeTotal(
        returns.data.map((row) => Number(row.refund_amount_cfa ?? 0)),
        returns.count,
      ),
    },
    payments: {
      count: payments.count,
      totalCfa: completeTotal(
        payments.data.map((row) => Number(row.amount_cfa ?? 0)),
        payments.count,
      ),
    },
  }
}

export function useCustomerActivity(customerId: string | null, filters: CustomerActivityFilters) {
  return useQuery({
    queryKey: customerKeys.activity(customerId ?? '', filters),
    queryFn: () => fetchCustomerActivity(customerId!, filters),
    enabled: !!customerId,
    staleTime: CACHE_STALE.customerDetail,
    placeholderData: keepPlaceholderWhen((prevKey) => {
      const prevFilters = prevKey[3] as CustomerActivityFilters | undefined
      return prevKey[2] === customerId && prevFilters?.type === filters.type
    }),
  })
}

export function useCustomerActivitySummary(customerId: string | null) {
  return useQuery({
    queryKey: customerKeys.activitySummary(customerId ?? ''),
    queryFn: () => fetchCustomerActivitySummary(customerId!),
    enabled: !!customerId,
    staleTime: CACHE_STALE.customerDetail,
  })
}
