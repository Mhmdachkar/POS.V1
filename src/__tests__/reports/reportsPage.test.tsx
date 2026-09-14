/**
 * Phase 12 — ReportsPage behavioral tests.
 * Asserts displayed values from mocked RPC payloads (not snapshots).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { formatCFA, formatPieces } from '@/lib/formatters'
import { downloadCsv } from '@/lib/csvExport'
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
  product_performance: [
    { product_id: 'p-top', name: 'PHASE12_TEST_TOP', net_pieces: 10, net_revenue_cfa: 1600 },
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
    },
  ],
  start_date: '2024-02-10',
  end_date: '2024-02-10',
}

const inventoryPayload: AdminInventoryReport = {
  inventory_value_cfa: 9000,
  current_stock: [
    {
      product_id: 'p-top',
      name: 'PHASE12_TEST_TOP',
      depot_id: 'depot-a',
      current_stock_pieces: 50,
      value_cfa: 5000,
    },
  ],
  low_stock: [
    { product_id: 'p-low', name: 'PHASE12_TEST_LOW', depot_id: 'depot-a', current_stock_pieces: 5 },
  ],
  out_of_stock: [
    { product_id: 'p-out', name: 'PHASE12_TEST_OUT', depot_id: 'depot-a', current_stock_pieces: 0 },
  ],
  period_movement: [{ transaction_type: 'RESTOCK', quantity_pieces: 5 }],
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
}))

const depotState = {
  currentDepotId: null as string | null,
  currentDepotName: null as string | null,
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

describe('ReportsPage', () => {
  beforeEach(() => {
    queryState.sales = { data: salesPayload, isLoading: false, isError: false }
    queryState.inventory = { data: inventoryPayload, isLoading: false, isError: false }
    queryState.customers = { data: customersPayload, isLoading: false, isError: false }
    queryState.cash = { data: cashPayload, isLoading: false, isError: false }
    depotState.currentDepotId = null
    depotState.currentDepotName = null
    vi.mocked(downloadCsv).mockClear()
  })

  it('renders Sales tab KPIs from the RPC payload', () => {
    render(<ReportsPage />)
    expect(screen.getByText('Sales activity')).toBeInTheDocument()
    expect(screen.getByText(hasFormatted(formatCFA(2280)))).toBeInTheDocument()
    expect(screen.getByText('Returns activity')).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatCFA(600))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Net sales')).toBeInTheDocument()
    expect(screen.getByText(hasFormatted(formatCFA(1680)))).toBeInTheDocument()
    expect(screen.getByText('Transactions')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Average sale')).toBeInTheDocument()
    expect(screen.getByText(hasFormatted(formatCFA(570)))).toBeInTheDocument()
    expect(screen.getByText('Gross profit')).toBeInTheDocument()
    expect(screen.getByText(hasFormatted(formatCFA(672)))).toBeInTheDocument()
    expect(screen.getByText('PHASE12_TEST_TOP')).toBeInTheDocument()
    expect(screen.getByText(hasFormatted(`${formatPieces(10)} · ${formatCFA(1600)}`))).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatCFA(300))).length).toBeGreaterThanOrEqual(1)
  })

  it('shows shared date presets including Custom', () => {
    render(<ReportsPage />)
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yesterday' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'This week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'This month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument()
  })

  it('reveals custom date inputs and keeps All depots in the toolbar', async () => {
    const user = userEvent.setup()
    render(<ReportsPage />)
    expect(screen.getByText(/All depots/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByLabelText(/From/)).toBeInTheDocument()
    expect(screen.getByLabelText(/To/)).toBeInTheDocument()
  })

  it('shows the selected depot name in the toolbar', () => {
    depotState.currentDepotId = 'depot-a'
    depotState.currentDepotName = 'Depot Dakar'
    render(<ReportsPage />)
    expect(screen.getByText(/Depot Dakar/)).toBeInTheDocument()
    expect(screen.queryByText(/^All depots/)).not.toBeInTheDocument()
  })

  it('shows a loading state without KPI values', () => {
    queryState.sales = { data: undefined, isLoading: true, isError: false }
    render(<ReportsPage />)
    expect(screen.queryByText('Sales activity')).not.toBeInTheDocument()
    expect(screen.queryByText(hasFormatted(formatCFA(2280)))).not.toBeInTheDocument()
  })

  it('shows an error empty state', () => {
    queryState.sales = { data: undefined, isLoading: false, isError: true }
    render(<ReportsPage />)
    expect(screen.getByText('Failed to load report')).toBeInTheDocument()
  })

  it('renders Inventory values after switching tabs', async () => {
    const user = userEvent.setup()
    render(<ReportsPage />)
    await user.click(screen.getByRole('button', { name: 'Inventory' }))
    expect(screen.getByText('Current inventory value')).toBeInTheDocument()
    expect(screen.getByText(hasFormatted(formatCFA(9000)))).toBeInTheDocument()
    expect(screen.getByText('RESTOCK')).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatPieces(5))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('PHASE12_TEST_LOW')).toBeInTheDocument()
    expect(screen.getByText('PHASE12_TEST_OUT')).toBeInTheDocument()
  })

  it('labels customer outstanding as a global pooled balance when a depot is selected', async () => {
    const user = userEvent.setup()
    depotState.currentDepotId = 'depot-a'
    depotState.currentDepotName = 'Depot Dakar'
    render(<ReportsPage />)
    await user.click(screen.getByRole('button', { name: 'Customers' }))
    expect(screen.getByText('Global outstanding balance')).toBeInTheDocument()
    expect(screen.getByText('Pooled across all depots — not a depot balance')).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatCFA(4000))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Depot-attributed payments (period)')).toBeInTheDocument()
    expect(screen.getByText(hasFormatted(formatCFA(200)))).toBeInTheDocument()
    expect(screen.getByText('Unattributed payments (period)')).toBeInTheDocument()
    expect(screen.getByText(hasFormatted(formatCFA(75)))).toBeInTheDocument()
    expect(screen.getByText('PHASE12_TEST_CUST')).toBeInTheDocument()
    expect(screen.getByText(/never a depot balance/)).toBeInTheDocument()
  })

  it('renders Cash expected, actual, discrepancy, and open shifts', async () => {
    const user = userEvent.setup()
    render(<ReportsPage />)
    await user.click(screen.getByRole('button', { name: 'Cash' }))
    expect(screen.getAllByText(hasFormatted(formatCFA(1000))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(hasFormatted(formatCFA(980)))).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatCFA(-20))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/float/)).toBeInTheDocument()
    expect(screen.getByText('Closed — discrepancy total')).toBeInTheDocument()
  })

  it('exports the Sales CSV with displayed KPI values', async () => {
    const user = userEvent.setup()
    render(<ReportsPage />)
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(downloadCsv).toHaveBeenCalled()
    const first = vi.mocked(downloadCsv).mock.calls[0]
    expect(first[0]).toMatch(/^sales-report-/)
    expect(first[2]).toEqual(expect.arrayContaining([
      ['Sales activity (CFA)', 2280],
      ['Returns activity (CFA)', 600],
      ['Net sales (CFA)', 1680],
      ['Transactions', 4],
      ['Average sale (CFA)', 570],
      ['Gross profit (CFA)', 672],
    ]))
  })
})
