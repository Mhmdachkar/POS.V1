/**
 * Phase 14B-2 — active-tab scoped report queries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { rpc } from '@/lib/rpc'
import {
  normalizeSalesReport,
  reportKeys,
  useCashReport,
  useCustomersReport,
  useInventoryReport,
  useSalesReport,
} from '@/hooks/useReports'
import type { AdminSalesReport } from '@/types/rpc'

vi.mock('@/lib/rpc', () => ({
  rpc: {
    adminReportSales: vi.fn(),
    adminReportInventory: vi.fn(),
    adminReportCustomers: vi.fn(),
    adminReportCash: vi.fn(),
  },
}))

const salesPayload = {
  sales_activity_cfa: 100,
  returns_activity_cfa: 0,
  net_sales_cfa: 100,
  transaction_count: 1,
  average_sale_cfa: 100,
  gross_profit_cfa: 40,
  cogs_cfa: 60,
  units_sold: 5,
  voided_count: 0,
  voided_amount_cfa: 0,
  no_shift_count: 0,
  no_shift_amount_cfa: 0,
  amount_applied_cfa: 100,
  amount_tendered_cfa: 100,
  balance_added_cfa: 0,
  change_cfa: 0,
  product_performance: [],
  returns: [],
  by_depot: [],
  by_cashier: [],
  by_category: [],
  by_shift: [],
  with_shift_vs_no_shift: {
    with_shift: { count: 1, sales_activity_cfa: 100 },
    no_shift: { count: 0, sales_activity_cfa: 0 },
  },
  daily_series: [],
  start_date: '2026-09-16',
  end_date: '2026-09-16',
} satisfies AdminSalesReport

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('normalizeSalesReport', () => {
  it('derives cogs from Phase 12 payload and fills empty breakdown arrays', () => {
    const phase12 = {
      sales_activity_cfa: 1000,
      returns_activity_cfa: 200,
      net_sales_cfa: 800,
      transaction_count: 5,
      average_sale_cfa: 200,
      gross_profit_cfa: 320,
      product_performance: [],
      returns: [],
      start_date: '2026-01-01',
      end_date: '2026-01-31',
    } as AdminSalesReport

    const normalized = normalizeSalesReport(phase12)

    expect(normalized.cogs_cfa).toBe(480)
    expect(normalized.units_sold).toBe(0)
    expect(normalized.product_performance).toEqual([])
    expect(normalized.returns).toEqual([])
    expect(normalized.by_depot).toEqual([])
    expect(normalized.by_cashier).toEqual([])
    expect(normalized.by_category).toEqual([])
    expect(normalized.by_shift).toEqual([])
    expect(normalized.daily_series).toEqual([])
    expect(normalized.with_shift_vs_no_shift).toEqual({
      with_shift: { count: 0, sales_activity_cfa: 0 },
      no_shift: { count: 0, sales_activity_cfa: 0 },
    })
  })
})

describe('useReports enabled gating', () => {
  beforeEach(() => {
    vi.mocked(rpc.adminReportSales).mockReset().mockResolvedValue({ data: salesPayload, error: null })
    vi.mocked(rpc.adminReportInventory).mockReset().mockResolvedValue({ data: {} as never, error: null })
    vi.mocked(rpc.adminReportCustomers).mockReset().mockResolvedValue({ data: {} as never, error: null })
    vi.mocked(rpc.adminReportCash).mockReset().mockResolvedValue({ data: {} as never, error: null })
  })

  it('does not call RPC when the sales query is disabled', async () => {
    renderHook(
      () => useSalesReport(null, '2026-09-16', '2026-09-16', false),
      { wrapper: wrapper() },
    )
    await waitFor(() => {
      expect(rpc.adminReportSales).not.toHaveBeenCalled()
    })
  })

  it('only the enabled kind executes', async () => {
    renderHook(
      () => {
        useSalesReport(null, '2026-09-16', '2026-09-16', true)
        useInventoryReport(null, '2026-09-16', '2026-09-16', false)
        useCustomersReport(null, '2026-09-16', '2026-09-16', false)
        useCashReport(null, '2026-09-16', '2026-09-16', false)
      },
      { wrapper: wrapper() },
    )
    await waitFor(() => {
      expect(rpc.adminReportSales).toHaveBeenCalledTimes(1)
    })
    expect(rpc.adminReportInventory).not.toHaveBeenCalled()
    expect(rpc.adminReportCustomers).not.toHaveBeenCalled()
    expect(rpc.adminReportCash).not.toHaveBeenCalled()
  })

  it('changing params while disabled does not execute', async () => {
    const { rerender } = renderHook(
      ({ depotId }: { depotId: string | null }) =>
        useSalesReport(depotId, '2026-09-16', '2026-09-16', false),
      { wrapper: wrapper(), initialProps: { depotId: null as string | null } },
    )
    rerender({ depotId: 'depot-a' })
    await waitFor(() => {
      expect(rpc.adminReportSales).not.toHaveBeenCalled()
    })
  })

  it('changing params while enabled refetches that query', async () => {
    const { rerender } = renderHook(
      ({ depotId }: { depotId: string | null }) =>
        useSalesReport(depotId, '2026-09-16', '2026-09-16', true),
      { wrapper: wrapper(), initialProps: { depotId: null as string | null } },
    )
    await waitFor(() => {
      expect(rpc.adminReportSales).toHaveBeenCalledTimes(1)
    })
    rerender({ depotId: 'depot-a' })
    await waitFor(() => {
      expect(rpc.adminReportSales).toHaveBeenCalledTimes(2)
    })
    expect(rpc.adminReportSales).toHaveBeenLastCalledWith({
      p_depot_id: 'depot-a',
      p_start_date: '2026-09-16',
      p_end_date: '2026-09-16',
    })
  })

  it('reportKeys include kind, depot, and dates', () => {
    const params = {
      p_depot_id: 'depot-a',
      p_start_date: '2026-09-16',
      p_end_date: '2026-09-16',
    }
    expect(reportKeys.sales(params)).toEqual(['reports', 'sales', params])
    expect(reportKeys.inventory(params)[1]).toBe('inventory')
    expect(reportKeys.customers(params)[1]).toBe('customers')
    expect(reportKeys.cash(params)[1]).toBe('cash')
  })
})
