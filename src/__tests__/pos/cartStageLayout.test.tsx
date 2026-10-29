/**
 * Cart + payment stage vertical layout:
 * checkout stays bottom-anchored for empty and populated carts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CartPanel } from '@/components/pos/CartPanel'
import { PaymentPanel } from '@/components/pos/PaymentPanel'
import { useOpenShifts } from '@/hooks/useShifts'
import { useCustomerSearch } from '@/hooks/useCustomers'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'
import type { Staff } from '@/types/database'
import { POS } from '@/lib/bilingual/pos'
import { bilingualAriaLabel, getByBilingualRole } from '../helpers/bilingualQueries'

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useOpenShifts: vi.fn(),
  }
})

vi.mock('@/hooks/useCustomers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCustomers')>()
  return {
    ...actual,
    useCustomerSearch: vi.fn(() => ({ data: [], isLoading: false })),
    useCreateCustomer: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }
})

function cashierStaff(): Staff {
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

function addLine(overrides: {
  product_id?: string
  product_name?: string
  quantity_in_unit?: number
} = {}) {
  usePOSStore.getState().addItem({
    product_id: overrides.product_id ?? 'prod-water',
    product_name: overrides.product_name ?? 'Water',
    product_photo_url: '',
    unit_level: 0,
    unit_name: 'Piece',
    quantity_in_unit: overrides.quantity_in_unit ?? 1,
    unit_price_cfa: 350,
    cost_price_cfa: 200,
    conversion_to_base: 1,
  })
}

/** Mirrors POSPage cart-stage composition without product discovery. */
function CartStage() {
  return (
    <div className="flex flex-col min-h-0 h-[720px] w-[480px] overflow-hidden">
      <div
        data-testid="pos-cart-stage"
        className="flex flex-1 flex-col min-h-0 overflow-hidden bg-surface border-b border-border"
      >
        <CartPanel className="flex-1 min-h-0 overflow-hidden" />
        <PaymentPanel
          className="relative z-20 flex-shrink-0 border-t border-border mt-auto overflow-visible"
          depotId="depot-a"
        />
      </div>
    </div>
  )
}

function renderStage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CartStage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  usePOSStore.getState().startNewSale()
  useAuthStore.setState({ staff: cashierStaff(), session: null, isLoading: false })
  vi.mocked(useOpenShifts).mockReturnValue({
    data: [],
    isLoading: false,
  } as never)
  vi.mocked(useCustomerSearch).mockReturnValue({
    data: [],
    isLoading: false,
  } as never)
})

describe('POS cart stage layout', () => {
  it('anchors checkout at the bottom of an empty cart stage', () => {
    renderStage()

    const stage = screen.getByTestId('pos-cart-stage')
    const payment = screen.getByTestId('payment-panel')
    const items = screen.getByTestId('cart-items')

    expect(stage).toHaveClass('flex-1')
    expect(items).toHaveClass('flex-1')
    expect(payment).toHaveClass('flex-shrink-0', 'mt-auto')
    expect(getByBilingualRole('button', POS.completeSaleAria)).toBeInTheDocument()
    expect(stage.lastElementChild).toBe(payment)
  })

  it('keeps checkout bottom-anchored when one cart line is added', () => {
    addLine()
    renderStage()

    const stage = screen.getByTestId('pos-cart-stage')
    const items = screen.getByTestId('cart-items')
    const payment = screen.getByTestId('payment-panel')

    expect(stage).toHaveClass('flex-1')
    expect(items).toHaveClass('flex-1', 'overflow-y-auto')
    expect(payment).toHaveClass('mt-auto', 'flex-shrink-0', 'relative', 'z-20')
    expect(stage.lastElementChild).toBe(payment)
    expect(getByBilingualRole('button', POS.completeSaleAria)).toBeVisible()
    expect(screen.getByText('Water')).toBeInTheDocument()
  })

  it('lets the item area scroll while checkout stays visible for many lines', () => {
    for (let i = 0; i < 12; i += 1) {
      addLine({
        product_id: `prod-${i}`,
        product_name: `Item ${i}`,
        quantity_in_unit: 1,
      })
    }
    renderStage()

    const items = screen.getByTestId('cart-items')
    const payment = screen.getByTestId('payment-panel')
    const stage = screen.getByTestId('pos-cart-stage')

    expect(items).toHaveClass('flex-1', 'overflow-y-auto', 'min-h-0')
    expect(payment).toHaveClass('flex-shrink-0', 'mt-auto')
    expect(stage.lastElementChild).toBe(payment)
    expect(getByBilingualRole('button', POS.completeSaleAria)).toBeInTheDocument()
    expect(screen.getByText('Item 0')).toBeInTheDocument()
    expect(screen.getByText('Item 11')).toBeInTheDocument()
  })

  it('keeps checkout classes stable when the customer picker opens', async () => {
    const user = userEvent.setup()
    addLine()
    renderStage()

    const payment = screen.getByTestId('payment-panel')
    const classesBefore = payment.className

    await user.click(getByBilingualRole('button', POS.selectCustomer))
    const picker = screen.getByTestId('pos-customer-picker')
    expect(picker).toHaveClass('max-h-full')
    expect(payment.className).toBe(classesBefore)
    expect(payment).toHaveClass('mt-auto', 'flex-shrink-0', 'overflow-visible')
    expect(getByBilingualRole('button', POS.completeSaleAria)).toBeInTheDocument()
  })
})
