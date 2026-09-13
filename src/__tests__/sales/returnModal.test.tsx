/**
 * Phase 8 — ReturnModal interaction and RPC parameter tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReturnModal } from '@/pages/sales/components/ReturnModal'
import { rpc } from '@/lib/rpc'
import { toast } from 'sonner'
import { ERROR_MESSAGES } from '@/lib/errors'
import type { SaleDetailData } from '@/hooks/useSales'

vi.mock('@/lib/rpc', () => ({
  rpc: {
    processReturn: vi.fn(),
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
    id: 'sale-ret-1',
    depot_id: 'depot-a',
    cashier_id: 'cashier-1',
    customer_id: 'cust-1',
    shift_id: null,
    receipt_number: 'DKR-00000100',
    status: 'completed',
    display_currency: 'CFA',
    cfa_to_usd_rate_used: 600,
    subtotal_cfa: 900,
    discount_type: null,
    discount_value: null,
    discount_amount_cfa: 0,
    total_cfa: 900,
    amount_tendered_cfa: 900,
    amount_applied_cfa: 900,
    change_given_cfa: 0,
    balance_added_cfa: 0,
    created_at: '2026-09-12T17:00:00Z',
    customer_name: 'Return Customer',
    customer_phone: null,
    customer_balance_owed_cfa: 0,
    cashier_name: 'Cashier Dakar',
    items: [
      {
        id: 'item-open',
        sale_id: 'sale-ret-1',
        product_id: 'prod-1',
        unit_level: 0,
        quantity_in_unit: 3,
        quantity_pieces: 3,
        unit_price_cfa: 200,
        cost_price_cfa: 100,
        line_total_cfa: 600,
        net_line_total_cfa: 600,
        product_name: 'Water',
        unit_name: 'Bottle',
      },
      {
        id: 'item-done',
        sale_id: 'sale-ret-1',
        product_id: 'prod-2',
        unit_level: 0,
        quantity_in_unit: 1,
        quantity_pieces: 1,
        unit_price_cfa: 300,
        cost_price_cfa: 150,
        line_total_cfa: 300,
        net_line_total_cfa: 300,
        product_name: 'Cola',
        unit_name: 'Can',
      },
    ],
    returns: [
      {
        id: 'ret-prior',
        sale_id: 'sale-ret-1',
        shift_id: null,
        processed_by: 'admin-1',
        reason: null,
        refund_amount_cfa: 300,
        balance_adjustment_cfa: 0,
        cash_refunded_cfa: 300,
        created_at: '2026-09-12T17:10:00Z',
        sale_return_items: [{
          id: 'ri-prior',
          return_id: 'ret-prior',
          sale_item_id: 'item-done',
          quantity_in_unit: 1,
          quantity_pieces: 1,
          refund_amount_cfa: 300,
        }],
      },
    ],
    payments: [],
    ...overrides,
  }
}

function renderModal(
  sale = makeSale(),
  handlers: { onClose?: () => void; onSuccess?: () => void } = {},
) {
  const onClose = handlers.onClose ?? vi.fn()
  const onSuccess = handlers.onSuccess ?? vi.fn()
  render(
    <ReturnModal
      open
      sale={sale}
      shiftId="shift-1"
      onClose={onClose}
      onSuccess={onSuccess}
    />,
  )
  return { onClose, onSuccess }
}

describe('ReturnModal', () => {
  beforeEach(() => {
    vi.mocked(rpc.processReturn).mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('starts selected qty at 0 and shows already-returned / fully returned', () => {
    renderModal()
    expect(screen.getByText(/Original: 3/)).toBeInTheDocument()
    expect(screen.getByText(/Returnable: 3/)).toBeInTheDocument()
    expect(screen.getByText(/Already returned: 1/)).toBeInTheDocument()
    expect(screen.getByText(/Fully returned/)).toBeInTheDocument()
    expect(screen.getByText('Select quantities to return above')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Process Return' })).toBeDisabled()
  })

  it('clamps quantity to the returnable maximum', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: 'Return all' }))
    const qty = screen.getAllByRole('spinbutton')[0]
    expect(qty).toHaveValue(3)
    await user.clear(qty)
    await user.type(qty, '99')
    expect(qty).toHaveValue(3)
  })

  it('shows a proportional refund preview (display only)', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: 'Return all' }))
    expect(screen.getByText('Refund Preview')).toBeInTheDocument()
    expect(screen.getByText('Estimated refund')).toBeInTheDocument()
    expect(screen.getByText(/Server computes authoritative refund amounts/)).toBeInTheDocument()
  })

  it('blocks cash refund above the estimated total', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: 'Return all' }))
    const cash = screen.getByPlaceholderText(/0 –/)
    await user.clear(cash)
    await user.type(cash, '99999')
    expect(screen.getByText(/Cash refund must be between 0 and/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Process Return' })).toBeDisabled()
  })

  it('submits processReturn without quantity_pieces', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockResolvedValue({
      data: {
        return_id: 'ret-new',
        sale_id: 'sale-ret-1',
        new_sale_status: 'partially_returned',
        refund_amount_cfa: 200,
        balance_adjustment_cfa: 0,
        cash_refunded_cfa: 200,
      },
      error: null,
    })
    const { onClose, onSuccess } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Return all' }))

    await user.type(screen.getByLabelText('Reason (optional)'), 'Damaged')
    await user.click(screen.getByRole('button', { name: 'Process Return' }))

    expect(rpc.processReturn).toHaveBeenCalledTimes(1)
    const params = vi.mocked(rpc.processReturn).mock.calls[0][0]
    expect(params.p_sale_id).toBe('sale-ret-1')
    expect(params.p_shift_id).toBe('shift-1')
    expect(params.p_reason).toBe('Damaged')
    expect(params.p_items).toEqual([
      { sale_item_id: 'item-open', quantity_in_unit: 3 },
    ])
    expect(params.p_items[0]).not.toHaveProperty('quantity_pieces')
    expect(params.p_cash_refund_cfa).toBe(0)
    expect(onSuccess).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('keeps the modal open and shows a mapped error on failure', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockResolvedValue({
      data: null,
      error: {
        code: 'RETURN_QTY_EXCEEDED',
        message: ERROR_MESSAGES.RETURN_QTY_EXCEEDED,
      },
    })
    const { onClose, onSuccess } = renderModal()
    await user.click(screen.getByRole('button', { name: 'Return all' }))
    await user.click(screen.getByRole('button', { name: 'Process Return' }))

    expect(toast.error).toHaveBeenCalledWith(ERROR_MESSAGES.RETURN_QTY_EXCEEDED)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Return — DKR-00000100')).toBeInTheDocument()
  })
})
