import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from '@/pages/admin/DashboardPage'
import type { AdminDashboardSummary } from '@/types/rpc'
import type { StockAlertsResult } from '@/hooks/useStockAlerts'

vi.mock('@/hooks/useDashboard', () => ({
  useDashboardSummary: vi.fn(),
}))

vi.mock('@/hooks/useStockAlerts', () => ({
  useStockAlerts: vi.fn(),
}))

const depotState = { currentDepotId: null as string | null, currentDepotName: null as string | null }

vi.mock('@/stores/depotStore', () => ({
  useDepotStore: (sel: (s: typeof depotState) => unknown) => sel(depotState),
}))

import { useDashboardSummary } from '@/hooks/useDashboard'
import { useStockAlerts } from '@/hooks/useStockAlerts'

const summary: AdminDashboardSummary = {
  sales_cfa: 1000,
  gross_profit_cfa: 200,
  txn_count: 2,
  avg_sale_cfa: 500,
  top_products: [],
  hourly_sales: [],
  action_required: {
    low_stock: [
      { product_id: 'stale', name: 'Should not render from RPC', depot_id: 'depot-a', current_stock_pieces: 1 },
    ],
    outstanding_balances_count: 0,
    shift_discrepancies: [],
    exchange_rate: { cfa_to_usd_rate: 620, rate_updated_at: '2026-09-01T00:00:00Z' },
  },
}

const alerts: StockAlertsResult = {
  lowStock: [
    {
      productId: 'prod-onion-abj',
      productName: 'Onion',
      depotId: 'depot-abj',
      depotName: 'Abidjan Depot',
      currentStockPieces: 7,
      threshold: 10,
      kind: 'low_stock',
    },
  ],
  lowStockCount: 1,
  outOfStock: [
    {
      productId: 'prod-matches',
      productName: 'Safety Matches',
      depotId: 'depot-dkr',
      depotName: 'Dakar Depot',
      currentStockPieces: 0,
      threshold: 10,
      kind: 'out_of_stock',
    },
  ],
  outOfStockCount: 1,
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  )
}

describe('Dashboard stock alerts', () => {
  it('renders tracked low stock with depot and threshold, separate from out of stock', () => {
    vi.mocked(useDashboardSummary).mockReturnValue({
      data: summary,
      isLoading: false,
      isError: false,
    } as never)
    vi.mocked(useStockAlerts).mockReturnValue({
      data: alerts,
      isLoading: false,
      isError: false,
    } as never)

    wrap()

    expect(screen.getByText(/Onion.*Abidjan Depot.*7 pièces.*(remaining|restant).*(threshold|seuil|minimum|min\.) 10 pièces/i)).toBeInTheDocument()
    expect(screen.getByText(/Safety Matches.*Dakar Depot.*0 Pièces.*(remaining|restant)/i)).toBeInTheDocument()
    expect(screen.getAllByText(/stock faible|low stock/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/rupture de stock|out of stock/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('Should not render from RPC')).not.toBeInTheDocument()
  })
})
