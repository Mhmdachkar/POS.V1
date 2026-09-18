import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CategoriesPage } from '@/pages/admin/CategoriesPage'
import { SettingsPage } from '@/pages/admin/SettingsPage'
import { DashboardPage } from '@/pages/admin/DashboardPage'
import { InventoryPage } from '@/pages/inventory/InventoryPage'
import { ProductDetailDrawer } from '@/pages/inventory/components/ProductDetailDrawer'
import type { ProductWithUnits } from '@/types'
import type { AdminDashboardSummary } from '@/types/rpc'
import { ADMIN } from '@/lib/bilingual/admin'

vi.mock('@/hooks/useAdminCategories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAdminCategories')>()
  return {
    ...actual,
    useAdminCategoryTree: vi.fn(() => ({
      data: actual.buildCategoryTree([
        { id: 'root', parent_id: null, name: 'Drinks', is_active: true, created_at: '2026-09-01T00:00:00Z' },
        { id: 'child', parent_id: 'root', name: 'Soda', is_active: false, created_at: '2026-09-01T00:00:00Z' },
      ]),
      isLoading: false,
      isError: false,
    })),
    useAdminCategoryList: vi.fn(() => ({ data: [], isLoading: false })),
    useCreateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useUpdateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useDeactivateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useReactivateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useCategoryProducts: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/hooks/useBusinessSettings', () => ({
  useBusinessSettings: vi.fn(() => ({
    data: {
      id: true,
      business_name: 'VHM',
      logo_url: null,
      cfa_to_usd_rate: 620,
      rate_updated_at: '2026-09-01T00:00:00Z',
      rate_updated_by: null,
      updated_at: '2026-09-01T00:00:00Z',
    },
    isLoading: false,
    isError: false,
  })),
  useUpdateBusinessSettings: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}))

const summary: AdminDashboardSummary = {
  sales_cfa: 1000,
  gross_profit_cfa: 200,
  txn_count: 2,
  avg_sale_cfa: 500,
  top_products: [{ product_id: 'p1', name: 'Water', net_pieces: 3 }],
  hourly_sales: [{ hour: 10, sales_cfa: 1000 }],
  action_required: {
    low_stock: [],
    outstanding_balances_count: 1,
    shift_discrepancies: [],
    exchange_rate: { cfa_to_usd_rate: 620, rate_updated_at: '2026-09-01T00:00:00Z' },
  },
}

vi.mock('@/hooks/useDashboard', () => ({
  useDashboardSummary: vi.fn(() => ({ data: summary, isLoading: false, isError: false })),
}))

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useInventoryList: vi.fn(() => ({ data: { data: [], count: 0 }, isLoading: false, isError: false })),
    useInventoryActivity: vi.fn(() => ({ data: [], isLoading: false })),
    useCategories: vi.fn(() => ({ data: [], isLoading: false })),
    useDepotOptions: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/hooks/useStockAlerts', () => ({
  useStockAlerts: vi.fn(() => ({
    data: { lowStock: [], lowStockCount: 0, outOfStock: [], outOfStockCount: 0 },
    isLoading: false,
    isError: false,
  })),
}))

vi.mock('@/hooks/useProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useProducts')>()
  const product: ProductWithUnits = {
    id: 'p1',
    depot_id: 'depot-a',
    category_id: 'c1',
    name: 'Water',
    photo_url: 'https://placehold.co/1',
    current_stock_pieces: 40,
    track_low_stock: false,
    low_stock_threshold: null,
    is_active: true,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    units: [],
  }
  return {
    ...actual,
    useProductDetail: vi.fn(() => ({ data: product, isLoading: false })),
  }
})

vi.mock('@/hooks/useAdminProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAdminProducts')>()
  return {
    ...actual,
    useCreateProduct: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useUpdateProduct: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useDeactivateProduct: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useReactivateProduct: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }
})

const depotState = { currentDepotId: null as string | null, currentDepotName: null as string | null }

vi.mock('@/stores/depotStore', () => ({
  useDepotStore: (sel: (s: typeof depotState) => unknown) => sel(depotState),
}))

const authState = { staff: { role: 'admin', id: 'admin-1' } }

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: typeof authState) => unknown) => sel(authState),
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('Admin gates and copy', () => {
  it('explains that category reactivate does not restore children or products', async () => {
    const user = userEvent.setup()
    wrap(<CategoriesPage />)
    await user.click(screen.getByRole('button', { name: /Drinks/ }))
    expect(screen.getByText('Soda')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: ADMIN.reactivate.fr }))
    expect(screen.getByText(ADMIN.reactivateCategoryMessage.fr, { exact: false })).toBeInTheDocument()
  })

  it('asks for confirmation when the exchange rate changes', async () => {
    const user = userEvent.setup()
    wrap(<SettingsPage />)
    const rate = screen.getByTestId('settings-rate')
    await user.clear(rate)
    await user.type(rate, '700')
    await user.click(screen.getByRole('button', { name: new RegExp(ADMIN.saveSettings.fr, 'i') }))
    expect(screen.getByRole('heading', { name: new RegExp(ADMIN.updateExchangeRate.fr, 'i') })).toBeInTheDocument()
    expect(screen.getByText(ADMIN.updateRateConfirm.fr, { exact: false })).toBeInTheDocument()
  })

  it('renders a today-only dashboard without date-range controls', () => {
    wrap(<DashboardPage />)
    expect(screen.getByText(ADMIN.dashboardToday.fr)).toBeInTheDocument()
    expect(screen.queryByLabelText(/date range/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/export/i)).not.toBeInTheDocument()
    expect(screen.getByText('Water')).toBeInTheDocument()
  })

  it('hides New Product when All Depots is selected', () => {
    depotState.currentDepotId = null
    wrap(<InventoryPage />)
    expect(screen.queryByRole('button', { name: /new product/i })).not.toBeInTheDocument()
  })

  it('hides product admin mutations in All Depots', () => {
    depotState.currentDepotId = null
    wrap(<ProductDetailDrawer productId="p1" onClose={() => undefined} />)
    expect(screen.queryByRole('button', { name: /edit product/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /deactivate product/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restock/i })).toBeInTheDocument()
  })
})
