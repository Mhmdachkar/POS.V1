/**
 * Phase 12 — ReportsPage behavioral tests.
 * Asserts displayed values from mocked RPC payloads (not snapshots).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes } from 'react-router-dom'
import { reportsRouteTree } from '@/pages/reports/ReportsRoutes'
import { formatCFA } from '@/lib/formatters'
import { downloadCsv } from '@/lib/csvExport'
import { REPORTS } from '@/lib/bilingual/reports'
import { COMMON } from '@/lib/bilingual/common'
import type {
  AdminCashReport,
  AdminCustomersReport,
  AdminInventoryReport,
  AdminSalesReport,
} from '@/types/rpc'

const salesPayload: AdminSalesReport = {
  sales_activity_cfa: 2280,
  returns_activity_cfa: 600,
  net_sales_cfa: 1680,
  transaction_count: 4,
  average_sale_cfa: 570,
  gross_profit_cfa: 672,
  cogs_cfa: 1008,
  units_sold: 10,
  voided_count: 0,
  voided_amount_cfa: 0,
  amount_applied_cfa: 1680,
  amount_tendered_cfa: 1680,
  balance_added_cfa: 0,
  change_cfa: 0,
  no_shift_count: 0,
  no_shift_amount_cfa: 0,
  product_performance: [
    {
      product_id: 'p-top',
      name: 'PHASE12_TEST_TOP',
      depot_id: 'depot-a',
      depot_name: 'Depot Dakar',
      category_id: null,
      category_name: null,
      units_sold: 10,
      returned_qty: 0,
      net_pieces: 10,
      gross_sales_cfa: 1600,
      returns_cfa: 0,
      net_sales_cfa: 1600,
      net_revenue_cfa: 1600,
      cogs_cfa: 1200,
      gross_profit_cfa: 400,
    },
  ],
  returns: [
    {
      return_id: 'r1',
      sale_id: 's1',
      depot_id: 'depot-a',
      refund_amount_cfa: 300,
      cash_refunded_cfa: 300,
      balance_adjustment_cfa: 0,
      created_at: '2024-02-10T15:00:00.000Z',
      receipt_number: 'DKR-1',
      cashier_name: 'Cashier',
      shift_id: null,
      items: [],
    },
  ],
  by_depot: [],
  by_cashier: [],
  by_category: [],
  by_shift: [],
  with_shift_vs_no_shift: {
    with_shift: { count: 4, sales_activity_cfa: 1680 },
    no_shift: { count: 0, sales_activity_cfa: 0 },
  },
  daily_series: [],
  start_date: '2024-02-10',
  end_date: '2024-02-10',
}

function stockRow(
  overrides: Partial<AdminInventoryReport['current_stock'][number]> &
    Pick<AdminInventoryReport['current_stock'][number], 'product_id' | 'name' | 'current_stock_pieces'>,
): AdminInventoryReport['current_stock'][number] {
  return {
    depot_id: 'depot-a',
    depot_name: 'Depot Dakar',
    category_id: null,
    category_name: null,
    unit_name: 'Piece',
    cost_price_cfa: 100,
    selling_price_cfa: 200,
    stock_value_cost_cfa: overrides.current_stock_pieces * 100,
    stock_value_selling_cfa: overrides.current_stock_pieces * 200,
    stock_status: overrides.current_stock_pieces === 0 ? 'out_of_stock' : overrides.current_stock_pieces <= 5 ? 'low_stock' : 'normal',
    track_low_stock: true,
    low_stock_threshold: 10,
    value_cfa: overrides.current_stock_pieces * 100,
    ...overrides,
  }
}

const inventoryPayload: AdminInventoryReport = {
  inventory_value_cfa: 9000,
  current_stock: [
    stockRow({ product_id: 'p-top', name: 'PHASE12_TEST_TOP', current_stock_pieces: 50, value_cfa: 5000 }),
  ],
  low_stock: [
    stockRow({ product_id: 'p-low', name: 'PHASE12_TEST_LOW', current_stock_pieces: 5 }),
  ],
  out_of_stock: [
    stockRow({ product_id: 'p-out', name: 'PHASE12_TEST_OUT', current_stock_pieces: 0 }),
  ],
  period_movement: [{ transaction_type: 'RESTOCK', quantity_pieces: 5, transaction_count: 1 }],
  adjustment_breakdown: [],
  low_stock_count: 1,
  out_of_stock_count: 1,
  start_date: '2024-02-10',
  end_date: '2024-02-10',
}

const customersPayload: AdminCustomersReport = {
  outstanding_total_cfa: 4000,
  outstanding_count: 1,
  credit_activity_cfa: 400,
  credit_activity_count: 1,
  payment_activity_cfa: 200,
  payment_activity_count: 1,
  unattributed_payment_activity_cfa: 75,
  unattributed_payment_activity_count: 1,
  customers_with_balance: [
    { customer_id: 'c1', name: 'PHASE12_TEST_CUST', balance_owed_cfa: 4000, is_active: true },
  ],
  payments: [],
  unattributed_payments: [],
  balances_are_global: true,
  start_date: '2024-02-10',
  end_date: '2024-02-10',
}

const cashPayload: AdminCashReport = {
  closed_shifts: [
    {
      shift_id: 'sh-closed',
      depot_id: 'depot-a',
      cashier_id: 'admin-1',
      status: 'closed',
      opened_at: '2024-02-28T22:00:00.000Z',
      closed_at: '2024-03-01T01:00:00.000Z',
      opening_float_cfa: 200,
      expected_cash_cfa: 1000,
      actual_cash_cfa: 980,
      discrepancy_cfa: -20,
    },
  ],
  open_shifts: [
    {
      shift_id: 'sh-open',
      depot_id: 'depot-a',
      cashier_id: 'admin-1',
      status: 'open',
      opened_at: '2024-02-10T08:00:00.000Z',
      closed_at: null,
      opening_float_cfa: 100,
      expected_cash_cfa: null,
      actual_cash_cfa: null,
      discrepancy_cfa: null,
    },
  ],
  closed_expected_total_cfa: 1000,
  closed_actual_total_cfa: 980,
  closed_discrepancy_total_cfa: -20,
  start_date: '2024-03-01',
  end_date: '2024-03-01',
}

const queryState = {
  sales: { data: salesPayload as AdminSalesReport | undefined, isLoading: false, isError: false },
  inventory: { data: inventoryPayload as AdminInventoryReport | undefined, isLoading: false, isError: false },
  customers: { data: customersPayload as AdminCustomersReport | undefined, isLoading: false, isError: false },
  cash: { data: cashPayload as AdminCashReport | undefined, isLoading: false, isError: false },
}

vi.mock('@/hooks/useReports', () => ({
  useSalesReport: () => queryState.sales,
  useInventoryReport: () => queryState.inventory,
  useCustomersReport: () => queryState.customers,
  useCashReport: () => queryState.cash,
  useAdminCostReport: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
  }),
}))

const depotState = {
  currentDepotId: null as string | null,
  currentDepotName: null as string | null,
  availableDepots: [] as Array<{ id: string; name: string }>,
  setCurrentDepot: (_id: string | null, _name: string | null) => {},
}

vi.mock('@/stores/depotStore', () => ({
  useDepotStore: (sel: (s: typeof depotState) => unknown) => sel(depotState),
}))

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useDepotOptions: vi.fn(() => ({
      data: [
        { id: 'depot-a', name: 'Depot Dakar', code: 'DKR' },
        { id: 'depot-b', name: 'Depot Abidjan', code: 'ABJ' },
      ],
      isLoading: false,
    })),
    useCategories: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/hooks/useStaff', () => ({
  useStaffList: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('@/hooks/useSales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSales')>()
  return {
    ...actual,
    useSalesList: vi.fn(() => ({ data: { data: [], count: 0 }, isLoading: false })),
    useSaleDetail: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
  }
})

vi.mock('@/lib/csvExport', () => ({
  downloadCsv: vi.fn(),
}))

function hasFormatted(value: string) {
  const compact = value.replace(/\s/g, '')
  return (_content: string, node: Element | null) =>
    (node?.textContent ?? '').replace(/\s/g, '') === compact
}

function renderReports(path = '/reports/sales/summary') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <Routes>{reportsRouteTree()}</Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ReportsPage', () => {
  beforeEach(() => {
    queryState.sales = { data: salesPayload, isLoading: false, isError: false }
    queryState.inventory = { data: inventoryPayload, isLoading: false, isError: false }
    queryState.customers = { data: customersPayload, isLoading: false, isError: false }
    queryState.cash = { data: cashPayload, isLoading: false, isError: false }
    depotState.currentDepotId = null
    depotState.currentDepotName = null
    vi.mocked(downloadCsv).mockClear()
    window.history.replaceState(null, '', '/')
  })

  it('renders Sales tab KPIs from the RPC payload', () => {
    renderReports()
    expect(screen.getByText(REPORTS.grossSales.fr)).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatCFA(2280))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(REPORTS.returnsMetric.fr).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(hasFormatted(formatCFA(-600))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(REPORTS.netSales.fr)).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatCFA(1680))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(REPORTS.cogs.fr)).toBeInTheDocument()
    expect(screen.getByText(REPORTS.grossProfit.fr)).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatCFA(672))).length).toBeGreaterThanOrEqual(1)
  })

  it('shows shared date presets including Custom', () => {
    renderReports()
    expect(screen.getByRole('button', { name: REPORTS.presetToday.fr })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: REPORTS.presetYesterday.fr })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: REPORTS.presetThisWeek.fr })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: REPORTS.presetThisMonth.fr })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: REPORTS.presetCustom.fr })).toBeInTheDocument()
  })

  it('reveals custom date inputs and keeps All depots in the toolbar', async () => {
    const user = userEvent.setup()
    renderReports()
    expect(screen.getByText(new RegExp(COMMON.allDepots.fr, 'i'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: REPORTS.presetCustom.fr }))
    expect(screen.getByText(REPORTS.dateFrom.fr)).toBeInTheDocument()
    expect(screen.getByText(REPORTS.dateTo.fr)).toBeInTheDocument()
  })

  it('shows the selected depot name in the toolbar', () => {
    depotState.currentDepotId = 'depot-a'
    depotState.currentDepotName = 'Depot Dakar'
    renderReports()
    expect(screen.getByText(/Depot Dakar/)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(`^${COMMON.allDepots.fr}`))).not.toBeInTheDocument()
  })

  it('shows a loading state without KPI values', () => {
    queryState.sales = { data: undefined, isLoading: true, isError: false }
    renderReports()
    expect(screen.queryByText(REPORTS.grossSales.fr)).not.toBeInTheDocument()
    expect(screen.queryByText(hasFormatted(formatCFA(2280)))).not.toBeInTheDocument()
  })

  it('shows an error empty state', () => {
    queryState.sales = { data: undefined, isLoading: false, isError: true }
    renderReports()
    expect(screen.getByText(REPORTS.failedReport.fr)).toBeInTheDocument()
  })

  it('renders Inventory values after switching tabs', async () => {
    const user = userEvent.setup()
    renderReports()
    await user.click(screen.getByRole('tab', { name: REPORTS.groupStock.fr }))
    expect(screen.getAllByText(REPORTS.currentInventoryValue.fr).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(hasFormatted(formatCFA(9000))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('PHASE12_TEST_LOW')).toBeInTheDocument()
    expect(screen.getByText('PHASE12_TEST_OUT')).toBeInTheDocument()
  })

  it('labels customer outstanding as a global pooled balance when a depot is selected', async () => {
    const user = userEvent.setup()
    depotState.currentDepotId = 'depot-a'
    depotState.currentDepotName = 'Depot Dakar'
    renderReports()
    await user.click(screen.getByRole('tab', { name: REPORTS.groupCustomers.fr }))
    expect(screen.getByText(REPORTS.receivable.fr)).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatCFA(4000))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(REPORTS.creditGranted.fr)).toBeInTheDocument()
    expect(screen.getByText(REPORTS.collectedOnReceivables.fr)).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatCFA(200))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('PHASE12_TEST_CUST')).toBeInTheDocument()
  })

  it('renders Cash expected, actual, discrepancy, and open shifts', async () => {
    const user = userEvent.setup()
    renderReports()
    await user.click(screen.getByRole('tab', { name: REPORTS.groupCash.fr }))
    await user.click(screen.getByRole('tab', { name: REPORTS.reportZ.fr }))
    expect(screen.getAllByText(hasFormatted(formatCFA(1000))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(hasFormatted(formatCFA(980))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(hasFormatted(formatCFA(-20))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Fermé — écart total')).toBeInTheDocument()
    expect(screen.getByText(REPORTS.openShifts.fr)).toBeInTheDocument()
  })

  it('exports the Sales CSV with displayed KPI values', async () => {
    const user = userEvent.setup()
    renderReports()
    await user.click(screen.getByRole('button', { name: COMMON.export.fr }))
    await user.click(screen.getByRole('button', { name: COMMON.exportCsv.fr }))
    expect(downloadCsv).toHaveBeenCalled()
    const first = vi.mocked(downloadCsv).mock.calls[0]
    expect(first[0]).toMatch(/^Rapport_Ventes_/i)
    expect(JSON.stringify(first[2])).toContain('2280')
  })
})
