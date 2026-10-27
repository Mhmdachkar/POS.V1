/**
 * Phase 15E — customer activity fetch, merge, summary honesty, cache.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { rpc } from '@/lib/rpc'
import { customerKeys, useRecordPayment } from '@/hooks/useCustomers'
import {
  CUSTOMER_ACTIVITY_DRAWER_LIMIT,
  CUSTOMER_ACTIVITY_PAGE_SIZE,
  emptyActivityMessage,
  fetchCustomerActivity,
  fetchCustomerActivitySummary,
  formatActivityRange,
  formatReturnedItemsSummary,
  mergeActivityEvents,
  saleActivityDescription,
  type CustomerActivityEvent,
} from '@/hooks/useCustomerActivity'
import { invalidateAfterSaleSettled } from '@/lib/cacheInvalidation'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { bilingualPlain } from '@/lib/bilingual/types'

vi.mock('@/lib/rpc', () => ({
  rpc: {
    recordPayment: vi.fn(),
  },
}))

type Row = Record<string, unknown>

function createTableBuilder(table: string, allRows: Row[], calls: string[]) {
  let filtered = [...allRows]
  let range: [number, number] | null = null
  let limit: number | null = null
  const builder: Record<string, unknown> = {}

  builder.select = (...args: unknown[]) => {
    calls.push(`${table}:select:${JSON.stringify(args[1] ?? {})}`)
    filtered = [...allRows]
    range = null
    limit = null
    return builder
  }
  builder.eq = (col: unknown, val: unknown) => {
    calls.push(`${table}:eq:${String(col)}:${String(val)}`)
    const key = String(col)
    filtered = filtered.filter((row) => {
      if (key === 'sales.customer_id') {
        const sales = row.sales as { customer_id?: string } | undefined
        return sales?.customer_id === val || row.customer_id === val
      }
      return row[key] === val
    })
    return builder
  }
  builder.neq = (col: unknown, val: unknown) => {
    calls.push(`${table}:neq:${String(col)}:${String(val)}`)
    filtered = filtered.filter((row) => row[String(col)] !== val)
    return builder
  }
  builder.order = (col: unknown, opts?: { ascending?: boolean }) => {
    calls.push(`${table}:order:${String(col)}:${opts?.ascending === false ? 'desc' : 'asc'}`)
    return builder
  }
  builder.limit = (n: unknown) => {
    calls.push(`${table}:limit:${n}`)
    limit = Number(n)
    return builder
  }
  builder.range = (from: unknown, to: unknown) => {
    calls.push(`${table}:range:${from}-${to}`)
    range = [Number(from), Number(to)]
    return builder
  }
  const execute = () => {
    const count = filtered.length
    let page = filtered
    if (range) page = filtered.slice(range[0], range[1] + 1)
    else if (limit != null) page = filtered.slice(0, limit)
    return Promise.resolve({ data: page, error: null, count })
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    execute().then(resolve, reject)

  return builder
}

function mockTables(tables: Record<string, Row[]>) {
  const calls: string[] = []
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    return createTableBuilder(table, tables[table] ?? [], calls) as never
  })
  return calls
}

function makeSaleRow(i: number, overrides: Row = {}): Row {
  return {
    id: `sale-${i}`,
    receipt_number: `DKR-${String(i).padStart(8, '0')}`,
    created_at: `2026-09-16T${String(10 + (i % 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
    total_cfa: 100 + i,
    balance_added_cfa: i % 2 === 0 ? 100 + i : 0,
    status: 'completed',
    customer_id: 'cust-1',
    ...overrides,
  }
}

describe('activity helpers', () => {
  it('describes credit vs cash sales', () => {
    expect(saleActivityDescription({ balance_added_cfa: 350 })).toBe(
      bilingualPlain(CUSTOMERS.activityCreditAdded),
    )
    expect(saleActivityDescription({ balance_added_cfa: 0 })).toBe(
      bilingualPlain(CUSTOMERS.activityCashSale),
    )
  })

  it('formats returned item summaries without UUIDs', () => {
    expect(formatReturnedItemsSummary([
      { quantity_in_unit: 2, product_name: 'Cola Can 33cl' },
    ])).toBe('2 × Cola Can 33cl')
    expect(emptyActivityMessage('all')).toBe(bilingualPlain(CUSTOMERS.activityEmptyAll))
    expect(emptyActivityMessage('sale')).toBe(bilingualPlain(CUSTOMERS.activityEmptySales))
    expect(emptyActivityMessage('return')).toBe(bilingualPlain(CUSTOMERS.activityEmptyReturns))
    expect(emptyActivityMessage('payment')).toBe(bilingualPlain(CUSTOMERS.activityEmptyPayments))
  })

  it('formats paginated counts newest-page style', () => {
    expect(formatActivityRange(0, 25, 119)).toBe(
      bilingualPlain(CUSTOMERS.activityShowingRange(1, 25, 119)),
    )
    expect(formatActivityRange(1, 25, 119)).toBe(
      bilingualPlain(CUSTOMERS.activityShowingRange(26, 50, 119)),
    )
    expect(formatActivityRange(4, 25, 119)).toBe(
      bilingualPlain(CUSTOMERS.activityShowingRange(101, 119, 119)),
    )
  })

  it('merges events newest first', () => {
    const events: CustomerActivityEvent[] = [
      {
        id: 'old',
        type: 'sale',
        occurredAt: '2026-09-10T10:00:00Z',
        reference: 'DKR-1',
        description: 'Cash sale',
        amountCfa: 10,
        saleId: 'old',
      },
      {
        id: 'new',
        type: 'payment',
        occurredAt: '2026-09-16T10:00:00Z',
        reference: 'Customer payment',
        description: 'Balance payment',
        amountCfa: -5,
        saleId: null,
      },
    ]
    expect(mergeActivityEvents(events).map((e) => e.id)).toEqual(['new', 'old'])
  })
})

describe('fetchCustomerActivity', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset()
  })

  it('limits the drawer window to recent events instead of loading 100+ rows', async () => {
    const sales = Array.from({ length: 100 }, (_, i) => makeSaleRow(i, {
      created_at: `2026-09-01T00:00:${String(i).padStart(2, '0')}Z`,
    }))
    const calls = mockTables({
      sales,
      sale_returns: Array.from({ length: 7 }, (_, i) => ({
        id: `ret-${i}`,
        sale_id: `sale-${i}`,
        refund_amount_cfa: 50,
        created_at: `2026-08-01T00:00:${String(i).padStart(2, '0')}Z`,
        customer_id: 'cust-1',
        sales: { receipt_number: `DKR-${String(i).padStart(8, '0')}`, customer_id: 'cust-1' },
        sale_return_items: [{
          quantity_in_unit: 2,
          sale_items: { products: { name: 'Cola Can 33cl' } },
        }],
      })),
      payments: Array.from({ length: 12 }, (_, i) => ({
        id: `pay-${i}`,
        amount_cfa: 25,
        recorded_at: `2026-07-01T00:00:${String(i).padStart(2, '0')}Z`,
        note: null,
        is_reversed: false,
        payment_type: 'customer_payment',
        sale_id: null,
        customer_id: 'cust-1',
      })),
    })

    const result = await fetchCustomerActivity('cust-1', {
      type: 'all',
      page: 0,
      pageSize: CUSTOMER_ACTIVITY_DRAWER_LIMIT,
    })

    expect(calls).toContain('sales:limit:5')
    expect(calls).toContain('sale_returns:limit:5')
    expect(calls).toContain('payments:limit:5')
    expect(calls.some((c) => c.startsWith('sales:range:'))).toBe(false)
    expect(result.data.length).toBe(CUSTOMER_ACTIVITY_DRAWER_LIMIT)
    expect(result.count).toBe(119)
    expect(result.data.every((event) => event.type === 'sale')).toBe(true)
  })

  it('uses balance_added_cfa for credit sale amounts in the ledger', async () => {
    mockTables({
      sales: [makeSaleRow(0, {
        receipt_number: 'MAIN-00000004',
        total_cfa: 10_000,
        admin_override_total_cfa: 8_000,
        balance_added_cfa: 3_000,
      })],
      sale_returns: [],
      payments: [],
    })

    const result = await fetchCustomerActivity('cust-1', {
      type: 'sale',
      page: 0,
      pageSize: 25,
    })
    expect(result.data[0]?.amountCfa).toBe(3_000)
  })

  it('paginates a single type on the server with range', async () => {
    const sales = Array.from({ length: 80 }, (_, i) => makeSaleRow(i))
    const calls = mockTables({ sales, sale_returns: [], payments: [] })

    const result = await fetchCustomerActivity('cust-1', {
      type: 'sale',
      page: 1,
      pageSize: CUSTOMER_ACTIVITY_PAGE_SIZE,
    })

    expect(calls).toContain('sales:range:25-49')
    expect(calls).toContain('sales:eq:customer_id:cust-1')
    expect(calls).toContain('sales:neq:status:voided')
    expect(result.data).toHaveLength(25)
    expect(result.count).toBe(80)
    expect(result.data[0]?.reference).toBe('DKR-00000025')
  })

  it('maps returns with receipt + item summary and payments without sale linkage', async () => {
    mockTables({
      sales: [],
      sale_returns: [{
        id: 'ret-1',
        sale_id: 'sale-uuid-should-not-leak',
        refund_amount_cfa: 600,
        created_at: '2026-09-15T10:00:00Z',
        customer_id: 'cust-1',
        sales: { receipt_number: 'DKR-00000020', customer_id: 'cust-1' },
        sale_return_items: [{
          quantity_in_unit: 2,
          sale_items: { products: { name: 'Cola Can 33cl' } },
        }],
      }],
      payments: [{
        id: 'pay-1',
        amount_cfa: 500,
        recorded_at: '2026-09-14T10:00:00Z',
        note: null,
        is_reversed: false,
        payment_type: 'customer_payment',
        sale_id: 'sale-should-be-ignored',
        customer_id: 'cust-1',
      }],
    })

    const returns = await fetchCustomerActivity('cust-1', {
      type: 'return',
      page: 0,
      pageSize: 25,
    })
    expect(returns.data[0]?.reference).toBe('DKR-00000020')
    expect(returns.data[0]?.description).toBe(
      `2 × Cola Can 33cl ${bilingualPlain(CUSTOMERS.activityReturnedSuffix)}`,
    )
    expect(returns.data[0]?.amountCfa).toBe(-600)
    expect(returns.data[0]?.reference).not.toContain('sale-uuid')

    const payments = await fetchCustomerActivity('cust-1', {
      type: 'payment',
      page: 0,
      pageSize: 25,
    })
    expect(payments.data[0]?.reference).toBe(
      bilingualPlain(CUSTOMERS.activityCustomerPaymentRef),
    )
    expect(payments.data[0]?.saleId).toBeNull()
    expect(payments.data[0]?.amountCfa).toBe(-500)
  })
})

describe('fetchCustomerActivitySummary', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset()
  })

  it('sums authoritative totals when the amount query is complete', async () => {
    mockTables({
      sales: [
        { total_cfa: 1000, admin_override_total_cfa: null, status: 'completed', customer_id: 'cust-1' },
        { total_cfa: 9000, admin_override_total_cfa: 500, status: 'completed', customer_id: 'cust-1' },
        { total_cfa: 9, admin_override_total_cfa: null, status: 'voided', customer_id: 'cust-1' },
      ],
      sale_returns: [
        { refund_amount_cfa: 200, sales: { customer_id: 'cust-1' }, customer_id: 'cust-1' },
      ],
      payments: [
        { amount_cfa: 150, payment_type: 'customer_payment', is_reversed: false, customer_id: 'cust-1' },
        { amount_cfa: 40, payment_type: 'customer_payment', is_reversed: true, customer_id: 'cust-1' },
      ],
    })

    const summary = await fetchCustomerActivitySummary('cust-1')
    expect(summary.sales).toEqual({ count: 2, totalCfa: 1500 })
    expect(summary.returns).toEqual({ count: 1, totalCfa: 200 })
    expect(summary.payments).toEqual({ count: 1, totalCfa: 150 })
  })

  it('pages through amount rows so large accounts still get a complete total', async () => {
    const calls: string[] = []
    let salesRangeCalls = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.neq = () => builder
      builder.range = (from: unknown, to: unknown) => {
        calls.push(`${table}:range:${from}-${to}`)
        return builder
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (table === 'sales') {
          salesRangeCalls += 1
          if (salesRangeCalls === 1) {
            return Promise.resolve({
              data: Array.from({ length: 500 }, () => ({
                total_cfa: 10,
                admin_override_total_cfa: null,
              })),
              error: null,
              count: 501,
            }).then(resolve, reject)
          }
          return Promise.resolve({
            data: [{ total_cfa: 5, admin_override_total_cfa: null }],
            error: null,
            count: 501,
          }).then(resolve, reject)
        }
        return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject)
      }
      return builder as never
    })

    const summary = await fetchCustomerActivitySummary('cust-1')
    expect(summary.sales.count).toBe(501)
    expect(summary.sales.totalCfa).toBe(5005)
    expect(calls.filter((c) => c.startsWith('sales:range:'))).toEqual([
      'sales:range:0-499',
      'sales:range:500-999',
    ])
  })
})

describe('activity cache invalidation', () => {
  it('invalidates activity after a sale settles', () => {
    const client = new QueryClient()
    const key = customerKeys.activity('cust-1', { type: 'all', page: 0, pageSize: 5 })
    const summaryKey = customerKeys.activitySummary('cust-1')
    client.setQueryData(key, { data: [], count: 0 })
    client.setQueryData(summaryKey, { sales: { count: 1, totalCfa: 1 }, returns: { count: 0, totalCfa: 0 }, payments: { count: 0, totalCfa: 0 } })

    invalidateAfterSaleSettled(client, { saleId: 'sale-1', customerId: 'cust-1' })

    expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    expect(client.getQueryState(summaryKey)?.isInvalidated).toBe(true)
  })

  it('invalidates activity after a return settles via the same sale path', () => {
    const client = new QueryClient()
    const key = customerKeys.activity('cust-1', { type: 'return', page: 0, pageSize: 25 })
    client.setQueryData(key, { data: [], count: 0 })
    invalidateAfterSaleSettled(client, { saleId: 'sale-1', customerId: 'cust-1' })
    expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  })

  it('invalidates activity after a standalone customer payment', async () => {
    vi.mocked(rpc.recordPayment).mockResolvedValue({
      data: {
        payment_id: 'pay-1',
        customer_id: 'cust-1',
        amount_cfa: 100,
        new_balance_owed_cfa: 400,
      },
      error: null,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const key = customerKeys.activity('cust-1', { type: 'all', page: 0, pageSize: 5 })
    client.setQueryData(key, { data: [], count: 0 })

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children)
    const { result } = renderHook(() => useRecordPayment(), { wrapper })

    await result.current.mutateAsync({ p_customer_id: 'cust-1', p_amount_cfa: 100 })
    await waitFor(() => {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    })
  })
})
