/**
 * CEO Notes — Admin total override on checkout; cashiers never send override.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CheckoutSummary } from '@/components/pos/CheckoutSummary'
import { PaymentPanel } from '@/components/pos/PaymentPanel'
import { PosStockProvider } from '@/components/pos/PosStockProvider'
import { rpc } from '@/lib/rpc'
import { useAuthStore } from '@/stores/authStore'
import { computeTotals, effectiveFinalTotal, usePOSStore } from '@/stores/posStore'
import { POS } from '@/lib/bilingual/pos'
import { bilingualAriaLabel } from '../helpers/bilingualQueries'
import type { Staff } from '@/types/database'
import type { ProductWithUnits } from '@/types'
import type { CompleteSaleResult } from '@/types/rpc'
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/lib/rpc', () => ({
  rpc: {
    completeSale: vi.fn(),
  },
}))

vi.mock('@/hooks/useCustomers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCustomers')>()
  return {
    ...actual,
    useCustomerSearch: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useOpenShifts: vi.fn(() => ({
      data: [{
        id: 'shift-1',
        depot_id: 'depot-a',
        cashier_id: 'cashier-1',
        opening_float_cfa: 1000,
        opened_at: '2026-09-13T08:00:00Z',
        closed_at: null,
        closed_by: null,
        expected_cash_cfa: null,
        actual_cash_cfa: null,
        discrepancy_cfa: null,
        status: 'open',
        depot_name: 'Depot Dakar',
        cashier_name: 'Cashier Dakar',
        closed_by_name: null,
      }],
      isLoading: false,
    })),
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

function adminStaff(): Staff {
  return {
    id: 'admin-1',
    username: 'admin',
    full_name: 'Admin User',
    role: 'admin',
    depot_id: null,
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

const saleResult: CompleteSaleResult = {
  sale_id: 'sale-abc',
  receipt_number: 'DKR-00000042',
  subtotal_cfa: 1000,
  discount_amount_cfa: 0,
  total_cfa: 1000,
  amount_tendered_cfa: 1000,
  amount_applied_cfa: 1000,
  change_given_cfa: 0,
  balance_added_cfa: 0,
  customer_id: null,
  payment_id: null,
  idempotent: false,
}

function addLine(qty = 1, price = 1000) {
  usePOSStore.getState().addItem({
    product_id: 'prod-001',
    product_name: 'Water',
    product_photo_url: '',
    unit_level: 0,
    unit_name: 'Piece',
    quantity_in_unit: qty,
    unit_price_cfa: price,
    cost_price_cfa: 600,
    conversion_to_base: 1,
  })
}

/** Four-line cart totaling 9100 CFA (CEO Notes payment scenarios). */
function addNineThousandOneHundredCart() {
  const lines = [
    { id: 'prod-water', name: 'Mineral Water 1.5L', price: 1500 },
    { id: 'prod-detergent', name: 'Laundry Detergent 2kg', price: 3500 },
    { id: 'prod-bleach', name: 'Household Bleach 1L', price: 2000 },
    { id: 'prod-coffee', name: 'Ground Coffee 250g', price: 2100 },
  ]
  for (const line of lines) {
    usePOSStore.getState().addItem({
      product_id: line.id,
      product_name: line.name,
      product_photo_url: '',
      unit_level: 0,
      unit_name: 'Piece',
      quantity_in_unit: 1,
      unit_price_cfa: line.price,
      cost_price_cfa: Math.round(line.price * 0.6),
      conversion_to_base: 1,
    })
  }
}

function stockProduct(): ProductWithUnits {
  return {
    id: 'prod-001',
    depot_id: 'depot-a',
    category_id: 'cat-bev',
    name: 'Water',
    photo_url: '',
    current_stock_pieces: 50,
    track_low_stock: false,
    low_stock_threshold: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    units: [],
  }
}

function renderPayment() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PosStockProvider products={[stockProduct()]}>
        <PaymentPanel depotId="depot-a" />
      </PosStockProvider>
    </QueryClientProvider>,
  )
}

describe('CEO Notes — effective final total', () => {
  beforeEach(() => {
    usePOSStore.getState().startNewSale()
  })

  it('A: no override → effective final total = calculated total', () => {
    addNineThousandOneHundredCart()
    const { totals, overrideTotalCfa } = usePOSStore.getState()
    expect(totals.total_cfa).toBe(9100)
    expect(overrideTotalCfa).toBeNull()
    expect(effectiveFinalTotal(totals.total_cfa, overrideTotalCfa)).toBe(9100)
  })

  it('B: admin override → effective final total = adjusted total', () => {
    addNineThousandOneHundredCart()
    usePOSStore.getState().setOverrideTotalCfa(7000)
    const { totals, overrideTotalCfa } = usePOSStore.getState()
    expect(totals.total_cfa).toBe(9100)
    expect(overrideTotalCfa).toBe(7000)
    expect(effectiveFinalTotal(totals.total_cfa, overrideTotalCfa)).toBe(7000)
  })

  it('C/D: cash 7000 / 8000 against override 7000 → applied/change use adjusted total', () => {
    addNineThousandOneHundredCart()
    usePOSStore.getState().setOverrideTotalCfa(7000)

    usePOSStore.getState().setCashTendered(7000)
    expect(usePOSStore.getState().totals).toMatchObject({
      total_cfa: 9100,
      amount_applied_cfa: 7000,
      change_given_cfa: 0,
      balance_added_cfa: 0,
    })

    usePOSStore.getState().setCashTendered(8000)
    expect(usePOSStore.getState().totals).toMatchObject({
      total_cfa: 9100,
      amount_applied_cfa: 7000,
      change_given_cfa: 1000,
      balance_added_cfa: 0,
    })
  })

  it('E: cash 5000 against override 7000 → balance added 2000', () => {
    addNineThousandOneHundredCart()
    usePOSStore.getState().setOverrideTotalCfa(7000)
    usePOSStore.getState().setCashTendered(5000)
    expect(usePOSStore.getState().totals).toMatchObject({
      amount_applied_cfa: 5000,
      change_given_cfa: 0,
      balance_added_cfa: 2000,
    })
  })

  it('changing override recalculates payment fields immediately', () => {
    addNineThousandOneHundredCart()
    usePOSStore.getState().setCashTendered(7000)
    usePOSStore.getState().setOverrideTotalCfa(7000)
    expect(usePOSStore.getState().totals.change_given_cfa).toBe(0)

    usePOSStore.getState().setOverrideTotalCfa(6500)
    expect(usePOSStore.getState().totals).toMatchObject({
      amount_applied_cfa: 6500,
      change_given_cfa: 500,
      balance_added_cfa: 0,
    })
  })

  it('H: resetting override restores calculated total payment math', () => {
    addNineThousandOneHundredCart()
    usePOSStore.getState().setOverrideTotalCfa(7000)
    usePOSStore.getState().setCashTendered(9100)
    usePOSStore.getState().setOverrideTotalCfa(null)
    expect(usePOSStore.getState().overrideTotalCfa).toBeNull()
    expect(usePOSStore.getState().totals).toMatchObject({
      total_cfa: 9100,
      amount_applied_cfa: 9100,
      change_given_cfa: 0,
      balance_added_cfa: 0,
    })
  })

  it('I: override does not change line/catalog prices or computed subtotal', () => {
    addNineThousandOneHundredCart()
    const before = usePOSStore.getState()
    const linePrices = before.items.map((i) => ({
      unit_price_cfa: i.unit_price_cfa,
      cost_price_cfa: i.cost_price_cfa,
      conversion_to_base: i.conversion_to_base,
      quantity_in_unit: i.quantity_in_unit,
      line_total_cfa: i.line_total_cfa,
    }))
    usePOSStore.getState().setOverrideTotalCfa(7000)
    const after = usePOSStore.getState()
    expect(after.totals.subtotal_cfa).toBe(9100)
    expect(after.totals.total_cfa).toBe(9100)
    expect(after.items.map((i) => ({
      unit_price_cfa: i.unit_price_cfa,
      cost_price_cfa: i.cost_price_cfa,
      conversion_to_base: i.conversion_to_base,
      quantity_in_unit: i.quantity_in_unit,
      line_total_cfa: i.line_total_cfa,
    }))).toEqual(linePrices)
  })

  it('computeTotals with override matches store payment fields', () => {
    addNineThousandOneHundredCart()
    const items = usePOSStore.getState().items
    const preview = computeTotals(items, null, 0, 8000, 7000)
    expect(preview).toMatchObject({
      total_cfa: 9100,
      amount_applied_cfa: 7000,
      change_given_cfa: 1000,
      balance_added_cfa: 0,
    })
  })
})

describe('CEO Notes — CheckoutSummary override visibility', () => {
  beforeEach(() => {
    usePOSStore.getState().startNewSale()
    addLine()
  })

  it('shows override input for admin', () => {
    useAuthStore.setState({
      staff: adminStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    render(<CheckoutSummary />)
    expect(screen.getByLabelText(POS.overrideTotalAria.fr)).toBeInTheDocument()
    expect(screen.getByText(POS.modifyTotal.fr)).toBeInTheDocument()
  })

  it('hides override input for cashier', () => {
    useAuthStore.setState({
      staff: cashierStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    render(<CheckoutSummary />)
    expect(screen.queryByLabelText(POS.overrideTotalAria.fr)).not.toBeInTheDocument()
    expect(screen.queryByText(POS.modifyTotal.fr)).not.toBeInTheDocument()
  })

  it('removing override restores calculated total', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      staff: adminStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    const calculated = usePOSStore.getState().totals.total_cfa
    render(<CheckoutSummary />)

    const input = screen.getByLabelText(POS.overrideTotalAria.fr)
    await user.clear(input)
    await user.type(input, '750')
    expect(usePOSStore.getState().overrideTotalCfa).toBe(750)
    expect(screen.getByText(POS.adjustedTotal.fr)).toBeInTheDocument()
    expect(screen.getByText(POS.calculatedTotal.fr)).toBeInTheDocument()

    await user.clear(input)
    expect(usePOSStore.getState().overrideTotalCfa).toBeNull()
    expect(screen.queryByText(POS.adjustedTotal.fr)).not.toBeInTheDocument()
    expect(screen.getByTestId('checkout-total')).toBeInTheDocument()
    expect(usePOSStore.getState().totals.total_cfa).toBe(calculated)
  })

  it('shows change against adjusted total after override', () => {
    useAuthStore.setState({
      staff: adminStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    usePOSStore.getState().startNewSale()
    addNineThousandOneHundredCart()
    usePOSStore.getState().setOverrideTotalCfa(7000)
    usePOSStore.getState().setCashTendered(8000)
    render(<CheckoutSummary />)
    expect(screen.getByText(POS.adjustedTotal.fr)).toBeInTheDocument()
    expect(screen.getByTestId('checkout-result')).toBeInTheDocument()
    expect(usePOSStore.getState().totals.change_given_cfa).toBe(1000)
  })
})

describe('CEO Notes — PaymentPanel override payload', () => {
  beforeEach(() => {
    usePOSStore.getState().startNewSale()
    vi.mocked(rpc.completeSale).mockReset()
    vi.mocked(rpc.completeSale).mockResolvedValue({ data: saleResult, error: null })
  })

  it('F: admin passes p_override_total_cfa only when override is set', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      staff: adminStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    addLine()
    // Cash covers calculated total so walk-in credit gate does not block submit;
    // override still goes on the RPC payload.
    usePOSStore.getState().setCashTendered(1000)
    usePOSStore.getState().setOverrideTotalCfa(800)
    usePOSStore.getState().setPriceExceptionReason('Price match')
    renderPayment()

    await user.click(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) }))
    await waitFor(() => expect(rpc.completeSale).toHaveBeenCalledTimes(1))
    expect(vi.mocked(rpc.completeSale).mock.calls[0][0]).toMatchObject({
      p_override_total_cfa: 800,
      p_price_exception_reason: 'Price match',
      p_shift_id: 'shift-1',
    })
  })

  it('admin sends p_override_total_cfa: null when override is not set', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      staff: adminStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    usePOSStore.getState().setOverrideTotalCfa(null)
    renderPayment()

    await user.click(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) }))
    await waitFor(() => expect(rpc.completeSale).toHaveBeenCalledTimes(1))
    expect(vi.mocked(rpc.completeSale).mock.calls[0][0]).toMatchObject({
      p_override_total_cfa: null,
    })
  })

  it('G: cashier never passes p_override_total_cfa even if store has a value', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      staff: cashierStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    usePOSStore.getState().setOverrideTotalCfa(500)
    renderPayment()

    await user.click(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) }))
    await waitFor(() => expect(rpc.completeSale).toHaveBeenCalledTimes(1))
    expect(vi.mocked(rpc.completeSale).mock.calls[0][0]).not.toHaveProperty('p_override_total_cfa')
  })

  it('credit gate uses adjusted total (cash covering override unblocks walk-in)', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      staff: adminStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    addNineThousandOneHundredCart()
    usePOSStore.getState().setOverrideTotalCfa(7000)
    usePOSStore.getState().setPriceExceptionReason('Manager adjustment')
    // Covers adjusted total but not calculated 9100 — must still submit
    usePOSStore.getState().setCashTendered(7000)
    expect(usePOSStore.getState().totals.balance_added_cfa).toBe(0)
    renderPayment()

    await user.click(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) }))
    await waitFor(() => expect(rpc.completeSale).toHaveBeenCalledTimes(1))
    expect(vi.mocked(rpc.completeSale).mock.calls[0][0]).toMatchObject({
      p_override_total_cfa: 7000,
      p_amount_tendered_cfa: 7000,
      p_price_exception_reason: 'Manager adjustment',
    })
  })

  it('B3: Complete stays disabled when override is 0 or above calculated total', () => {
    useAuthStore.setState({
      staff: adminStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    usePOSStore.getState().setOverrideTotalCfa(0)
    usePOSStore.getState().setPriceExceptionReason('too low')
    const { unmount } = renderPayment()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
    expect(screen.getByText(POS.overrideOutOfRange.fr)).toBeInTheDocument()
    unmount()

    usePOSStore.getState().setOverrideTotalCfa(1001)
    renderPayment()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
    expect(screen.getByText(POS.overrideOutOfRange.fr)).toBeInTheDocument()
  })

  it('B3: 99999, 0, and -100 do not replace the displayed payable', () => {
    useAuthStore.setState({
      staff: adminStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    addLine()
    const calculated = usePOSStore.getState().totals.total_cfa
    expect(calculated).toBeGreaterThan(0)
    for (const bad of [99999, 0, -100]) {
      usePOSStore.getState().setOverrideTotalCfa(bad)
      expect(effectiveFinalTotal(usePOSStore.getState().totals.total_cfa, bad)).toBe(calculated)
    }
    renderPayment()
    expect(screen.getByText(POS.overrideOutOfRange.fr)).toBeInTheDocument()
    expect(screen.getByTestId('checkout-total')).toHaveTextContent(/1[\s\u00a0\u202f]?000/)
    expect(screen.queryByText(POS.adjustedTotal.fr)).not.toBeInTheDocument()
  })

  it('B3: Complete stays disabled when override is set without a reason', () => {
    useAuthStore.setState({
      staff: adminStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    usePOSStore.getState().setOverrideTotalCfa(800)
    renderPayment()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
    expect(screen.getByText(POS.overrideNeedsReason.fr)).toBeInTheDocument()
  })
})
