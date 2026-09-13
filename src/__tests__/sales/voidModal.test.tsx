/**
 * Phase 8 — VoidModal confirmation, RPC params, success/error flows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoidModal } from '@/pages/sales/components/VoidModal'
import { rpc } from '@/lib/rpc'
import { toast } from 'sonner'
import { ERROR_MESSAGES } from '@/lib/errors'
import type { SaleDetailData } from '@/hooks/useSales'

vi.mock('@/lib/rpc', () => ({
  rpc: {
    voidSale: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function makeSale(overrides: Partial<SaleDetailData> = {}): SaleDetailData {
  return {
    id: 'sale-void-1',
    depot_id: 'depot-a',
    cashier_id: 'cashier-1',
    customer_id: 'cust-1',
    shift_id: null,
    receipt_number: 'DKR-00000101',
    status: 'completed',
    display_currency: 'CFA',
    cfa_to_usd_rate_used: 600,
    subtotal_cfa: 1500,
    discount_type: null,
    discount_value: null,
    discount_amount_cfa: 0,
    total_cfa: 1500,
    amount_tendered_cfa: 500,
    amount_applied_cfa: 500,
    change_given_cfa: 0,
    balance_added_cfa: 1000,
    created_at: '2026-09-12T17:00:00Z',
    customer_name: 'Void Customer',
    customer_phone: null,
    customer_balance_owed_cfa: 1000,
    cashier_name: 'Cashier Dakar',
    items: [{
      id: 'item-1',
      sale_id: 'sale-void-1',
      product_id: 'prod-1',
      unit_level: 0,
      quantity_in_unit: 1,
      quantity_pieces: 1,
      unit_price_cfa: 1500,
      cost_price_cfa: 800,
      line_total_cfa: 1500,
      net_line_total_cfa: 1500,
      product_name: 'Rice',
      unit_name: 'Bag',
    }],
    returns: [],
    payments: [{
      id: 'pay-1',
      customer_id: 'cust-1',
      sale_id: 'sale-void-1',
      payment_type: 'sale_payment',
      amount_cfa: 500,
      recorded_at: '2026-09-12T17:00:00Z',
      is_reversed: false,
      reversed_at: null,
    }],
    ...overrides,
  }
}

describe('VoidModal', () => {
  beforeEach(() => {
    vi.mocked(rpc.voidSale).mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('disables Void Sale until the confirmation checkbox is checked', async () => {
    const user = userEvent.setup()
    render(<VoidModal open sale={makeSale()} onClose={vi.fn()} onSuccess={vi.fn()} />)
    const submit = screen.getByRole('button', { name: 'Void Sale' })
    expect(submit).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    expect(submit).toBeEnabled()
  })

  it('lists void consequences including payment reversal and balance', () => {
    render(<VoidModal open sale={makeSale()} onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByText(/Sale status → Voided/)).toBeInTheDocument()
    expect(screen.getByText(/Sale payment reversed/)).toBeInTheDocument()
    expect(screen.getByText(/Customer balance reduced/)).toBeInTheDocument()
  })

  it('submits voidSale with sale id and trimmed reason', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.voidSale).mockResolvedValue({
      data: {
        sale_id: 'sale-void-1',
        voided_at: '2026-09-12T19:00:00Z',
        stock_restored_items: [{ product_id: 'prod-1', quantity_pieces: 1 }],
        balance_reversed_cfa: 1000,
        payment_reversed: true,
      },
      error: null,
    })
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    render(<VoidModal open sale={makeSale()} onClose={onClose} onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText('Reason (optional)'), '  Wrong sale  ')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Void Sale' }))

    expect(rpc.voidSale).toHaveBeenCalledWith({
      p_sale_id: 'sale-void-1',
      p_reason: 'Wrong sale',
    })
    expect(onSuccess).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('keeps the modal open on mapped error', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.voidSale).mockResolvedValue({
      data: null,
      error: { code: 'SALE_VOIDED', message: ERROR_MESSAGES.SALE_VOIDED },
    })
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    render(<VoidModal open sale={makeSale()} onClose={onClose} onSuccess={onSuccess} />)

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Void Sale' }))

    expect(toast.error).toHaveBeenCalledWith(ERROR_MESSAGES.SALE_VOIDED)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Void Sale' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Void Sale' })).toBeInTheDocument()
  })

  it('resets reason and confirmation on cancel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<VoidModal open sale={makeSale()} onClose={onClose} onSuccess={vi.fn()} />)
    await user.type(screen.getByLabelText('Reason (optional)'), 'oops')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
