/**
 * Phase 13D / 14B-2 — PaymentPanel checkout rules, in-flight lock, shift UX.
 * Phase 18B — stock guard + stale INSUFFICIENT_STOCK handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PaymentPanel } from '@/components/pos/PaymentPanel'
import { PosStockProvider } from '@/components/pos/PosStockProvider'
import { rpc } from '@/lib/rpc'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'
import type { Customer, Staff } from '@/types/database'
import type { CompleteSaleResult } from '@/types/rpc'
import type { ProductWithUnits } from '@/types'
import { NAV } from '@/lib/bilingual/nav'
import { POS } from '@/lib/bilingual/pos'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { useOpenShifts, type ShiftListItem } from '@/hooks/useShifts'
import {
  bilingualAriaLabel,
  expectToastErrorFr,
} from '../helpers/bilingualQueries'

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
    useOpenShifts: vi.fn(),
  }
})

function openShift(): ShiftListItem {
  return {
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

function namedCustomer(): Customer {
  return {
    id: 'cust-1',
    name: 'Aminata Diallo',
    phone: '77000000',
    address: null,
    balance_owed_cfa: 1500,
    is_active: true,
    deactivated_at: null,
    created_by: 'admin-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
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

function stockProduct(stock = 50): ProductWithUnits {
  return {
    id: 'prod-001',
    depot_id: 'depot-a',
    category_id: 'cat-bev',
    name: 'Water',
    photo_url: '',
    current_stock_pieces: stock,
    track_low_stock: false,
    low_stock_threshold: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    units: [],
  }
}

function renderPanel(
  depotId: string | null = 'depot-a',
  products: ProductWithUnits[] = [stockProduct(50)],
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <PosStockProvider products={products}>
          <PaymentPanel depotId={depotId} />
        </PosStockProvider>
      </QueryClientProvider>,
    ),
  }
}

describe('PaymentPanel', () => {
  beforeEach(() => {
    usePOSStore.getState().startNewSale()
    useAuthStore.setState({
      staff: cashierStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    vi.mocked(rpc.completeSale).mockReset()
    vi.mocked(rpc.completeSale).mockResolvedValue({ data: saleResult, error: null })
    vi.mocked(useOpenShifts).mockReturnValue({
      data: [openShift()],
      isLoading: false,
    } as never)
  })

  it('disables commit when the cart is empty', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
    expect(screen.getByText(POS.addProductsBegin.fr)).toBeInTheDocument()
    expect(screen.queryByLabelText(bilingualAriaLabel(POS.cashReceived))).not.toBeInTheDocument()
    expect(screen.queryByText(/Amount applied|Montant appliqué/i)).not.toBeInTheDocument()
  })

  it('shows the walk-in credit warning and disables commit', () => {
    addLine()
    usePOSStore.getState().setCashTendered(0)
    renderPanel()
    expect(screen.getByText(POS.creditNeedsCustomer.fr)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-describedby', expect.stringContaining('pos-credit-warning'))
  })

  it('does not show the walk-in warning for a selected-customer credit sale', () => {
    addLine()
    usePOSStore.getState().setCustomer(namedCustomer())
    usePOSStore.getState().setCashTendered(0)
    renderPanel()
    expect(screen.queryByText(POS.creditNeedsCustomer.fr)).not.toBeInTheDocument()
    expect(screen.getByText(POS.onAccount.fr)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeEnabled()
  })

  it('keeps commit disabled when the discount is invalid', () => {
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    usePOSStore.getState().setDiscountType('percent')
    usePOSStore.getState().setDiscountValue(150)
    renderPanel()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
    expect(screen.getByText(POS.discountPercentError.fr, { exact: false })).toBeInTheDocument()
  })

  it('B2: typing 150% in the discount field keeps Complete disabled at CFA 0', () => {
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    usePOSStore.getState().setDiscountType('percent')
    renderPanel()
    const input = screen.getByLabelText(bilingualAriaLabel(POS.discountValue))
    fireEvent.change(input, { target: { value: '150' } })
    expect(input).toHaveValue(150)
    expect(screen.getByText(POS.discountPercentError.fr, { exact: false })).toBeInTheDocument()
    expect(screen.getByTestId('checkout-total')).toHaveTextContent(/0/)
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
  })

  it('B2: cashier cannot complete a 100% discount (total CFA 0)', () => {
    addLine()
    usePOSStore.getState().setDiscountType('percent')
    usePOSStore.getState().setDiscountValue(100)
    usePOSStore.getState().setCashTendered(0)
    renderPanel()
    expect(screen.getByTestId('checkout-total')).toHaveTextContent(/0/)
    expect(screen.getByText(POS.zeroTotalNeedsAdmin.fr)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
  })

  it('B2: admin completes a 0-total sale only after entering a reason', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      staff: adminStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    addLine()
    usePOSStore.getState().setDiscountType('percent')
    usePOSStore.getState().setDiscountValue(100)
    usePOSStore.getState().setCashTendered(0)
    renderPanel()
    const complete = screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })
    expect(complete).toBeDisabled()
    await user.type(
      screen.getByLabelText(bilingualAriaLabel(POS.priceExceptionReason)),
      'Courtesy waiver',
    )
    expect(complete).toBeEnabled()
    await user.click(complete)
    await waitFor(() => expect(rpc.completeSale).toHaveBeenCalledTimes(1))
    expect(vi.mocked(rpc.completeSale).mock.calls[0][0]).toMatchObject({
      p_discount_type: 'percent',
      p_discount_value: 100,
      p_price_exception_reason: 'Courtesy waiver',
    })
  })

  it('keeps commit disabled when cash is negative', () => {
    addLine()
    usePOSStore.getState().setCashTendered(-1)
    renderPanel()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
    expect(screen.getByText(POS.cashNegative.fr, { exact: false })).toBeInTheDocument()
  })

  it('invokes completeSale with the existing payload on commit', async () => {
    const user = userEvent.setup()
    addLine(3, 350)
    usePOSStore.getState().setCashTendered(1050)
    renderPanel()

    await user.click(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) }))

    await waitFor(() => expect(rpc.completeSale).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(rpc.completeSale).mock.calls[0][0]
    expect(payload).toMatchObject({
      p_depot_id: 'depot-a',
      p_customer_id: null,
      p_amount_tendered_cfa: 1050,
      p_display_currency: 'CFA',
      p_discount_type: null,
      p_discount_value: null,
      p_shift_id: 'shift-1',
      p_cart_items: [
        { product_id: 'prod-001', unit_level: 0, quantity_in_unit: 3 },
      ],
    })
    expect('quantity_pieces' in payload.p_cart_items[0]).toBe(false)
    expect(payload.p_idempotency_key).toBe(usePOSStore.getState().idempotencyKey)
  })

  it('does not internally scroll', () => {
    renderPanel()
    const panel = screen.getByTestId('payment-panel')
    expect(panel.className).not.toMatch(/overflow-y-auto/)
    expect(panel.className).not.toMatch(/max-h-\[60vh\]/)
    expect(panel).toHaveClass('flex-shrink-0')
  })

  it('exposes CustomerChip listbox ARIA on the select trigger', async () => {
    const user = userEvent.setup()
    addLine()
    renderPanel()
    const trigger = screen.getByRole('button', { name: bilingualAriaLabel(POS.selectCustomer) })
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('listbox', { name: bilingualAriaLabel(NAV.customers) }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: new RegExp(POS.walkIn.fr, 'i') })).toBeInTheDocument()
  })

  it('does not change walk-in credit state when the picker opens', async () => {
    const user = userEvent.setup()
    addLine()
    usePOSStore.getState().setCashTendered(0)
    renderPanel()
    expect(usePOSStore.getState().isWalkIn).toBe(true)
    await user.click(screen.getByRole('button', { name: bilingualAriaLabel(POS.selectCustomer) }))
    expect(usePOSStore.getState().isWalkIn).toBe(true)
    expect(usePOSStore.getState().customer).toBeNull()
    expect(screen.getByText(POS.creditNeedsCustomer.fr)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
    expect(screen.getByTestId('pos-customer-picker')).toHaveClass('absolute', 'max-h-64')
    expect(screen.getByTestId('payment-panel')).not.toHaveClass('overflow-y-auto')
  })

  it('B8: submits the open shift id with the sale', async () => {
    const user = userEvent.setup()
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    renderPanel()
    expect(screen.queryByText(SHIFT_COPY.openShiftRequired.fr)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) }))
    await waitFor(() => expect(rpc.completeSale).toHaveBeenCalledTimes(1))
    expect(vi.mocked(rpc.completeSale).mock.calls[0][0].p_shift_id).toBe('shift-1')
  })

  it('B8: disables Complete and shows a French message when no open shift exists', () => {
    vi.mocked(useOpenShifts).mockReturnValue({ data: [], isLoading: false } as never)
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    renderPanel()
    expect(screen.getByText(SHIFT_COPY.openShiftRequired.fr)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
  })

  it('B8: admin completion still sends the depot open shift', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      staff: adminStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    renderPanel('depot-a')
    await user.click(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) }))
    await waitFor(() => expect(rpc.completeSale).toHaveBeenCalledTimes(1))
    expect(vi.mocked(rpc.completeSale).mock.calls[0][0].p_shift_id).toBe('shift-1')
  })

  it('ignores a second rapid Complete and reuses the same idempotency key', async () => {
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    let release!: (value: { data: CompleteSaleResult; error: null }) => void
    vi.mocked(rpc.completeSale).mockImplementation(
      () => new Promise((resolve) => { release = resolve }),
    )
    renderPanel()
    const button = screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(rpc.completeSale).toHaveBeenCalledTimes(1)
    const key = vi.mocked(rpc.completeSale).mock.calls[0][0].p_idempotency_key
    release({ data: saleResult, error: null })
    await waitFor(() => expect(usePOSStore.getState().saleResult).toEqual(saleResult))
    expect(usePOSStore.getState().idempotencyKey).toBe(key)
  })

  it('shows coaching and disables Complete when walk-in cash is short', () => {
    addLine(1, 1000)
    usePOSStore.getState().setCashTendered(500)
    renderPanel()
    expect(screen.getByText(POS.creditNeedsCustomer.fr)).toBeInTheDocument()
    expect(screen.getByText(POS.onAccount.fr)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
  })

  it('shows On account and enables Complete for a customer short-cash sale', () => {
    addLine(1, 1000)
    usePOSStore.getState().setCustomer(namedCustomer())
    usePOSStore.getState().setCashTendered(500)
    renderPanel()
    expect(screen.queryByText(POS.creditNeedsCustomer.fr)).not.toBeInTheDocument()
    expect(screen.getByTestId('checkout-result')).toHaveTextContent(POS.onAccount.fr)
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeEnabled()
  })

  it('omits Change, On account, and Amount applied when cash is exact', () => {
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    renderPanel()
    expect(screen.queryByTestId('checkout-result')).not.toBeInTheDocument()
    expect(screen.queryByText(POS.change.fr)).not.toBeInTheDocument()
    expect(screen.queryByText(POS.onAccount.fr)).not.toBeInTheDocument()
    expect(screen.queryByText(/Amount applied|Montant appliqué/i)).not.toBeInTheDocument()
    expect(screen.queryByText(POS.cashReceived.fr)).not.toBeInTheDocument()
    expect(screen.getByLabelText(bilingualAriaLabel(POS.cashReceived))).toBeInTheDocument()
    expect(screen.getByTestId('checkout-total')).toBeInTheDocument()
  })

  it('shows Subtotal and Discount rows only when a discount is applied', () => {
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    usePOSStore.getState().setDiscountType('flat')
    usePOSStore.getState().setDiscountValue(100)
    renderPanel()
    expect(screen.getByText(POS.subtotal.fr)).toBeInTheDocument()
    expect(screen.getByText(POS.discount.fr)).toBeInTheDocument()
    expect(screen.getByTestId('checkout-total')).toBeInTheDocument()
  })

  it('disables Complete and hides cash when no depot is selected', () => {
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    renderPanel(null)
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
    expect(screen.queryByLabelText(bilingualAriaLabel(POS.cashReceived))).not.toBeInTheDocument()
    expect(screen.getByText(POS.addProductsBegin.fr)).toBeInTheDocument()
  })

  it('blocks Complete when cart exceeds known stock', () => {
    addLine(11, 100)
    usePOSStore.getState().setCashTendered(1100)
    renderPanel('depot-a', [stockProduct(10)])
    expect(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) })).toBeDisabled()
    expect(screen.getByText(POS.cartExceedsStock.fr)).toBeInTheDocument()
    expect(rpc.completeSale).not.toHaveBeenCalled()
  })

  it('allows Complete at exact available stock', async () => {
    const user = userEvent.setup()
    addLine(10, 100)
    usePOSStore.getState().setCashTendered(1000)
    renderPanel('depot-a', [stockProduct(10)])
    await user.click(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) }))
    await waitFor(() => expect(rpc.completeSale).toHaveBeenCalledTimes(1))
  })

  it('shows Stock changed message and refreshes catalog on INSUFFICIENT_STOCK', async () => {
    const user = userEvent.setup()
    addLine(7, 100)
    usePOSStore.getState().setCashTendered(700)
    vi.mocked(rpc.completeSale).mockResolvedValue({
      data: null,
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: 'Not enough stock available for this product.',
        details: { available_pieces: 4, product_name: 'Water' },
      },
    })
    const { client } = renderPanel('depot-a', [stockProduct(10)])
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    await user.click(screen.getByRole('button', { name: bilingualAriaLabel(POS.completeSaleAria) }))
    await waitFor(() =>
      expectToastErrorFr(toast.error, 'Stock insuffisant. Seulement 4 disponibles.'),
    )
    expect(rpc.completeSale).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['products'] }),
    )
    expect(usePOSStore.getState().saleResult).toBeNull()
  })
})

describe('PaymentPanel Enter-to-complete wiring', () => {
  beforeEach(() => {
    usePOSStore.getState().startNewSale()
    useAuthStore.setState({
      staff: cashierStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    vi.mocked(rpc.completeSale).mockReset()
    vi.mocked(rpc.completeSale).mockResolvedValue({ data: saleResult, error: null })
    vi.mocked(useOpenShifts).mockReturnValue({
      data: [openShift()],
      isLoading: false,
    } as never)
  })

  async function readyExactSale() {
    addLine()
    usePOSStore.getState().setCashTendered(1000)
    renderPanel()
    document.body.tabIndex = 0
    document.body.focus()
  }

  it('submits from body focus when all gates pass and preventDefault only then', async () => {
    await readyExactSale()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    const prevent = vi.spyOn(event, 'preventDefault')
    document.dispatchEvent(event)
    expect(prevent).toHaveBeenCalled()
    await waitFor(() => expect(rpc.completeSale).toHaveBeenCalledTimes(1))
  })

  it('does not submit or preventDefault when the cash input is focused', async () => {
    await readyExactSale()
    const input = screen.getByLabelText(bilingualAriaLabel(POS.cashReceived))
    input.focus()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    const prevent = vi.spyOn(event, 'preventDefault')
    input.dispatchEvent(event)
    expect(prevent).not.toHaveBeenCalled()
    expect(rpc.completeSale).not.toHaveBeenCalled()
  })

  it('does not submit when canSubmit is false', () => {
    renderPanel()
    document.body.tabIndex = 0
    document.body.focus()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    const prevent = vi.spyOn(event, 'preventDefault')
    document.dispatchEvent(event)
    expect(prevent).not.toHaveBeenCalled()
    expect(rpc.completeSale).not.toHaveBeenCalled()
  })
})
