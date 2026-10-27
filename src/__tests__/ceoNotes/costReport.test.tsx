/**
 * CEO Notes — Cost report tab + ReportCostTab fixture rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportCostTab } from '@/pages/reports/tabs/ReportCostTab'
import { reportsRouteTree } from '@/pages/reports/ReportsRoutes'
import { MemoryRouter, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { REPORTS } from '@/lib/bilingual/reports'
import { formatCFA, formatPieces } from '@/lib/formatters'
import type { AdminCostReport } from '@/lib/rpc'
import type {
  AdminCashReport,
  AdminCustomersReport,
  AdminInventoryReport,
  AdminSalesReport,
} from '@/types/rpc'

const costFixture: AdminCostReport = {
  inventory_cost: [
    {
      product_id: 'p1',
      product_name: 'Onion Sack',
      photo_url: '',
      depot_id: 'depot-a',
      depot_name: 'Depot Dakar',
      category_id: 'cat-food',
      category_name: 'Food',
      current_stock_pieces: 120,
      serial_number: 'ON-PCE-001',
      cost_price_cfa: 100,
      selling_price_cfa: 150,
      inventory_value_at_cost: 12000,
      inventory_value_at_selling: 18000,
      potential_profit: 6000,
      is_active: true,
    },
  ],
  inventory_totals: {
    total_inventory_value_at_cost: 12000,
    total_inventory_value_at_selling: 18000,
    total_potential_profit: 6000,
  },
  restock_log: [
    {
      stock_entry_id: 'se-1',
      entered_at: '2026-09-10T08:00:00.000Z',
      depot_id: 'depot-a',
      depot_name: 'Depot Dakar',
      product_id: 'p1',
      product_name: 'Onion Sack',
      category_name: 'Food',
      unit_level: 0,
      unit_name: 'Piece',
      serial_number: 'ON-PCE-001',
      quantity_in_unit: 50,
      quantity_pieces: 50,
      unit_cost_price_cfa: 100,
      total_cost_cfa: 5000,
      note: 'Weekly restock',
      entered_by_name: 'Admin User',
    },
  ],
  period_totals: {
    total_restock_quantity_pieces: 50,
    total_restock_cost_cfa: 5000,
  },
  filters: {
    depot_id: null,
    start_date: '2026-09-01',
    end_date: '2026-09-18',
    category_id: null,
    product_id: null,
  },
}

const salesStub: AdminSalesReport = {
  sales_activity_cfa: 0,
  returns_activity_cfa: 0,
  net_sales_cfa: 0,
  transaction_count: 0,
  average_sale_cfa: 0,
  gross_profit_cfa: 0,
  cogs_cfa: 0,
  units_sold: 0,
  voided_count: 0,
  voided_amount_cfa: 0,
  no_shift_count: 0,
  no_shift_amount_cfa: 0,
  amount_applied_cfa: 0,
  amount_tendered_cfa: 0,
  balance_added_cfa: 0,
  change_cfa: 0,
  product_performance: [],
  returns: [],
  by_depot: [],
  by_cashier: [],
  by_category: [],
  by_shift: [],
  with_shift_vs_no_shift: {
    with_shift: { count: 0, sales_activity_cfa: 0 },
    no_shift: { count: 0, sales_activity_cfa: 0 },
  },
  daily_series: [],
  start_date: '2026-09-01',
  end_date: '2026-09-18',
}

const inventoryStub: AdminInventoryReport = {
  inventory_value_cfa: 0,
  current_stock: [],
  low_stock: [],
  out_of_stock: [],
  period_movement: [],
  adjustment_breakdown: [],
  low_stock_count: 0,
  out_of_stock_count: 0,
  start_date: '2026-09-01',
  end_date: '2026-09-18',
}

const customersStub: AdminCustomersReport = {
  outstanding_total_cfa: 0,
  outstanding_count: 0,
  credit_activity_cfa: 0,
  credit_activity_count: 0,
  payment_activity_cfa: 0,
  payment_activity_count: 0,
  unattributed_payment_activity_cfa: 0,
  unattributed_payment_activity_count: 0,
  reversed_payment_activity_cfa: 0,
  reversed_payment_activity_count: 0,
  customers_with_balance: [],
  payments: [],
  unattributed_payments: [],
  balances_are_global: true,
  start_date: '2026-09-01',
  end_date: '2026-09-18',
}

const cashStub: AdminCashReport = {
  closed_shifts: [],
  open_shifts: [],
  closed_expected_total_cfa: 0,
  closed_actual_total_cfa: 0,
  closed_discrepancy_total_cfa: 0,
  start_date: '2026-09-01',
  end_date: '2026-09-18',
}

const queryState = {
  sales: { data: salesStub as AdminSalesReport | undefined, isLoading: false, isError: false, isFetching: false },
  inventory: { data: inventoryStub as AdminInventoryReport | undefined, isLoading: false, isError: false, isFetching: false },
  customers: { data: customersStub as AdminCustomersReport | undefined, isLoading: false, isError: false, isFetching: false },
  cash: { data: cashStub as AdminCashReport | undefined, isLoading: false, isError: false, isFetching: false },
  cost: { data: costFixture as AdminCostReport | undefined, isLoading: false, isError: false, isFetching: false },
}

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  LineChart: () => null,
  BarChart: () => null,
  Bar: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

vi.mock('@/hooks/useReports', () => ({
  useSalesReport: () => queryState.sales,
  useInventoryReport: () => queryState.inventory,
  useCustomersReport: () => queryState.customers,
  useCashReport: () => queryState.cash,
  useAdminCostReport: () => queryState.cost,
}))

vi.mock('@/hooks/useSales', () => ({
  useSalesList: vi.fn(() => ({ data: { data: [], count: 0 }, isLoading: false })),
  useUnshiftedSalesSummary: vi.fn(() => ({ data: undefined })),
  useUnshiftedSalesForShiftWindow: vi.fn(() => ({ data: undefined })),
}))

vi.mock('@/hooks/useTransfers', () => ({
  useTransfersList: vi.fn(() => ({ data: { data: [], count: 0 }, isLoading: false, isError: false })),
}))

vi.mock('@/hooks/useAuditLog', () => ({
  useAuditLog: vi.fn(() => ({ data: { data: [], count: 0 }, isLoading: false, isError: false })),
}))

vi.mock('@/hooks/useStaff', () => ({
  useStaffList: vi.fn(() => ({ data: { data: [], count: 0 }, isLoading: false })),
}))

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useDepotOptions: vi.fn(() => ({
      data: [{ id: 'depot-a', name: 'Depot Dakar', code: 'DKR' }],
      isLoading: false,
    })),
    useCategories: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/pages/sales/components/SaleDetailDrawer', () => ({ SaleDetailDrawer: () => null }))
vi.mock('@/pages/inventory/components/ProductDetailDrawer', () => ({ ProductDetailDrawer: () => null }))
vi.mock('@/pages/customers/components/CustomerDetailDrawer', () => ({ CustomerDetailDrawer: () => null }))
vi.mock('@/pages/shifts/components/ShiftDetailDrawer', () => ({ ShiftDetailDrawer: () => null }))
vi.mock('@/pages/transfers/components/TransferDetailDrawer', () => ({ TransferDetailDrawer: () => null }))
vi.mock('@/pages/admin/components/AuditDetailDrawer', () => ({ AuditDetailDrawer: () => null }))

const depotState = {
  currentDepotId: null as string | null,
  currentDepotName: null as string | null,
  availableDepots: [] as Array<{ id: string; name: string }>,
  setCurrentDepot: (_id: string | null, _name: string | null) => {},
}

vi.mock('@/stores/depotStore', () => ({
  useDepotStore: (sel: (s: typeof depotState) => unknown) => sel(depotState),
}))

function hasFormatted(value: string) {
  const compact = value.replace(/\s/g, '')
  return (_content: string, node: Element | null) =>
    (node?.textContent ?? '').replace(/\s/g, '') === compact
}

describe('CEO Notes — ReportCostTab', () => {
  it('renders inventory totals and restock log from AdminCostReport fixture', () => {
    render(<ReportCostTab cost={costFixture} showDepotColumn />)

    expect(screen.getByText(REPORTS.inventoryValueAtCost.fr)).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatCFA(12000))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(hasFormatted(formatCFA(18000))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(hasFormatted(formatCFA(6000))).length).toBeGreaterThanOrEqual(1)

    expect(screen.getByText(REPORTS.totalRestockCost.fr)).toBeInTheDocument()
    expect(screen.getAllByText(hasFormatted(formatCFA(5000))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(formatPieces(50)).length).toBeGreaterThanOrEqual(1)

    expect(screen.getByText(REPORTS.currentInventoryCost.fr)).toBeInTheDocument()
    expect(screen.getAllByText('Onion Sack').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('ON-PCE-001').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(REPORTS.restockLog.fr)).toBeInTheDocument()
    expect(screen.getByText('Weekly restock')).toBeInTheDocument()
    expect(screen.getByText('2026-09-10')).toBeInTheDocument()
  })
})

describe('CEO Notes — ReportsPage cost tab', () => {
  beforeEach(() => {
    queryState.cost = { data: costFixture, isLoading: false, isError: false, isFetching: false }
    depotState.currentDepotId = null
  })

  it('includes Cost tab and renders ReportCostTab content', async () => {
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/reports/sales/summary']}>
        <QueryClientProvider client={client}>
          <Routes>{reportsRouteTree()}</Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    const costTab = screen.getByRole('tab', { name: new RegExp(REPORTS.cost.fr, 'i') })
    expect(costTab).toBeInTheDocument()
    await user.click(costTab)

    expect(screen.getByText(REPORTS.inventoryValueAtCost.fr)).toBeInTheDocument()
    expect(screen.getAllByText('Onion Sack').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Weekly restock')).toBeInTheDocument()
  })
})
