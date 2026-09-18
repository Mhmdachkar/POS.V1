/**
 * Mobile POS workspace: Produits / Panier tabs instead of a cramped stack.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { POSPage } from '@/pages/pos/POSPage'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { usePOSStore } from '@/stores/posStore'
import type { Staff } from '@/types/database'
import { POS } from '@/lib/bilingual/pos'
import { bilingualAriaLabel } from '../helpers/bilingualQueries'

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useCategories: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/hooks/useProducts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useProductSearch: vi.fn(() => ({
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    })),
    fetchProductSearch: vi.fn(async () => []),
  }
})

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useOpenShifts: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/hooks/useCustomers', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useCustomerSearch: vi.fn(() => ({ data: [], isLoading: false })),
    useCreateCustomer: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }
})

function cashierStaff() {
  return {
    id: 'cashier-1',
    username: 'cashier',
    full_name: 'Cashier Dakar',
    role: 'cashier',
    depot_id: 'depot-a',
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <div className="h-[800px]">
        <POSPage />
      </div>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  usePOSStore.getState().startNewSale()
  useAuthStore.setState({ staff: cashierStaff(), session: null, isLoading: false })
  useDepotStore.setState({
    currentDepotId: 'depot-a',
    currentDepotName: 'Depot Dakar',
    availableDepots: [],
  })
})

describe('POS mobile tabs', () => {
  it('renders Produits / Panier tabs and switches panes', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByTestId('pos-mobile-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('pos-mobile-tab-catalog')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('pos-mobile-tab-cart')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByLabelText(bilingualAriaLabel(POS.searchProducts))).toBeInTheDocument()

    await user.click(screen.getByTestId('pos-mobile-tab-cart'))
    expect(screen.getByTestId('pos-mobile-tab-cart')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('pos-cart-stage')).toBeInTheDocument()
  })

  it('shows view-cart CTA after adding a line from the catalog pane', async () => {
    const user = userEvent.setup()
    usePOSStore.getState().addItem({
      product_id: 'prod-water',
      product_name: 'Water',
      product_photo_url: '',
      unit_level: 0,
      unit_name: 'Piece',
      quantity_in_unit: 1,
      unit_price_cfa: 350,
      cost_price_cfa: 200,
      conversion_to_base: 1,
    })
    renderPage()

    const viewCart = screen.getByTestId('pos-mobile-view-cart')
    expect(viewCart).toBeInTheDocument()
    await user.click(viewCart)
    expect(screen.getByTestId('pos-mobile-tab-cart')).toHaveAttribute('aria-selected', 'true')
  })
})
