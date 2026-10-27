/**
 * Phase 8 / 13E-remediation — ReturnModal interaction and RPC parameter tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReturnModal } from '@/pages/sales/components/ReturnModal'
import { rpc } from '@/lib/rpc'
import { toast } from 'sonner'
import { ERROR_MESSAGES } from '@/lib/errors'
import { messageForCodePlain } from '@/lib/bilingual/errors'
import { expectToastErrorFr } from '../helpers/bilingualQueries'
import { formatCFA } from '@/lib/formatters'
import { roundCfa2 } from '@/lib/returnRefundPreview'
import { useAuthStore } from '@/stores/authStore'
import { useOpenShifts, type ShiftListItem } from '@/hooks/useShifts'
import type { SaleDetailData, SaleItemDetail } from '@/hooks/useSales'
import type { Staff } from '@/types/database'

vi.mock('@/lib/rpc', () => ({
  rpc: {
    processReturn: vi.fn(),
  },
}))

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useOpenShifts: vi.fn(),
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function makeItem(overrides: Partial<SaleItemDetail> = {}): SaleItemDetail {
  return {
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
    ...overrides,
  }
}

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
    admin_override_total_cfa: null,
    amount_tendered_cfa: 900,
    amount_applied_cfa: 900,
    change_given_cfa: 0,
    balance_added_cfa: 0,
    created_at: '2026-09-12T17:00:00Z',
    customer_name: 'Return Customer',
    customer_phone: null,
    customer_balance_owed_cfa: 0,
    cashier_name: 'Cashier',
    items: [
      makeItem(),
      makeItem({
        id: 'item-done',
        product_id: 'prod-2',
        quantity_in_unit: 1,
        quantity_pieces: 1,
        unit_price_cfa: 300,
        cost_price_cfa: 150,
        line_total_cfa: 300,
        net_line_total_cfa: 300,
        product_name: 'Cola',
        unit_name: 'Can',
      }),
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

function creditSale19600(): SaleDetailData {
  return makeSale({
    id: 'sale-credit-1',
    receipt_number: 'DKR-00000069',
    customer_id: 'cust-1',
    balance_added_cfa: 19600,
    customer_balance_owed_cfa: 550,
    total_cfa: 19600,
    subtotal_cfa: 19600,
    amount_tendered_cfa: 0,
    amount_applied_cfa: 0,
    items: [
      makeItem({
        id: 'item-cola',
        sale_id: 'sale-credit-1',
        product_name: 'Cola Can 33cl',
        unit_name: 'Pack',
        quantity_in_unit: 1,
        quantity_pieces: 1,
        unit_price_cfa: 1600,
        line_total_cfa: 1600,
        net_line_total_cfa: 1600,
      }),
      makeItem({
        id: 'item-rice',
        sale_id: 'sale-credit-1',
        product_id: 'prod-rice',
        product_name: 'Parboiled Rice 25kg',
        unit_name: 'Sack',
        quantity_in_unit: 1,
        quantity_pieces: 1,
        unit_price_cfa: 18000,
        line_total_cfa: 18000,
        net_line_total_cfa: 18000,
      }),
    ],
    returns: [],
  })
}

function walkInSale19600(): SaleDetailData {
  return makeSale({
    id: 'sale-walkin-1',
    receipt_number: 'DKR-00000070',
    customer_id: null,
    customer_name: null,
    balance_added_cfa: 0,
    customer_balance_owed_cfa: null,
    total_cfa: 19600,
    subtotal_cfa: 19600,
    amount_tendered_cfa: 19600,
    amount_applied_cfa: 19600,
    items: [
      makeItem({
        id: 'item-walkin',
        sale_id: 'sale-walkin-1',
        product_name: 'Mixed cart',
        quantity_in_unit: 1,
        quantity_pieces: 1,
        unit_price_cfa: 19600,
        line_total_cfa: 19600,
        net_line_total_cfa: 19600,
      }),
    ],
    returns: [],
  })
}

function expectFormattedCFA(amount: number, atLeast = 1) {
  const matches = screen.getAllByText((_, el) => el?.textContent === formatCFA(amount))
  expect(matches.length).toBeGreaterThanOrEqual(atLeast)
}

function processingShift(): ShiftListItem {
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
    cashier_name: 'Cashier',
    closed_by_name: null,
  }
}

function cashierStaff(): Staff {
  return {
    id: 'cashier-1',
    username: 'cashier',
    full_name: 'Cashier',
    role: 'cashier',
    depot_id: 'depot-a',
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function renderModal(
  sale = makeSale(),
  handlers: { onClose?: () => void; onSuccess?: () => void } = {},
  shiftId: string | null = 'shift-1',
) {
  const onClose = handlers.onClose ?? vi.fn()
  const onSuccess = handlers.onSuccess ?? vi.fn()
  render(
    <ReturnModal
      open
      sale={sale}
      shiftId={shiftId}
      onClose={onClose}
      onSuccess={onSuccess}
    />,
  )
  return { onClose, onSuccess }
}

const successResult = {
  data: {
    return_id: 'ret-new',
    sale_id: 'sale-ret-1',
    new_sale_status: 'partially_returned' as const,
    refund_amount_cfa: 200,
    balance_adjustment_cfa: 0,
    cash_refunded_cfa: 200,
  },
  error: null,
}

describe('ReturnModal', () => {
  beforeEach(() => {
    useAuthStore.setState({
      staff: cashierStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    vi.mocked(useOpenShifts).mockReturnValue({
      data: [processingShift()],
      isLoading: false,
    } as never)
    vi.mocked(rpc.processReturn).mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('starts selected qty at 0 and shows already-returned / fully returned', () => {
    renderModal()
    expect(screen.getByText(/Vendu\s*:\s*3|Sold:\s*3/i)).toBeInTheDocument()
    expect(screen.getByText(/Returnable: 3|Retournable: 3/i)).toBeInTheDocument()
    expect(screen.getByText(/déjà retourné: 1|already returned: 1/i)).toBeInTheDocument()
    expect(screen.getByText(/entièrement retourné|fully returned/i)).toBeInTheDocument()
    expect(
      screen.getAllByText(/choisissez les quantités|select quantities to return above/i).length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /traiter un retour|process return/i })).toBeDisabled()
  })

  it('clamps quantity to the returnable maximum', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    const qty = screen.getByRole('spinbutton')
    expect(qty).toHaveValue(3)
    await user.clear(qty)
    await user.type(qty, '99')
    expect(qty).toHaveValue(3)
  })

  it('shows a C1 refund preview with numbered CFA values', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    expect(screen.getAllByText(/aperçu remboursement|refund preview/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/remboursement total|total refund/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/déduit du solde|off balance due/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/remboursement espèces|cash refund/i).length).toBeGreaterThan(0)
    expect(screen.queryByPlaceholderText(/0 –/)).not.toBeInTheDocument()
    // Walk-in-like sale (no credit): cash = full 600, balance = 0
    expectFormattedCFA(600)
    expectFormattedCFA(0)
  })

  it('updates preview when return quantity changes', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    expectFormattedCFA(600)

    const qty = screen.getByRole('spinbutton')
    const stepper = qty.parentElement!
    const minus = stepper.querySelectorAll('button')[0]
    await user.click(minus)
    await user.click(minus)
    expect(qty).toHaveValue(1)
    expect(screen.getAllByText(/remboursement total|total refund/i).length).toBeGreaterThan(0)
    expectFormattedCFA(200)
  })

  it('never renders a blank cash refund amount', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    const cashLabel = screen.getAllByText(/remboursement espèces|cash refund/i)[0]
    const cashRow = cashLabel.closest('div')
    expect(cashRow?.textContent).toContain(formatCFA(600))
    expect(cashRow?.textContent).toMatch(/\d[\s\u202f]*CFA/)
  })

  it('submits credit return with computed cash 19050, not 0', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockResolvedValue({
      ...successResult,
      data: {
        ...successResult.data,
        sale_id: 'sale-credit-1',
        refund_amount_cfa: 19600,
        balance_adjustment_cfa: 550,
        cash_refunded_cfa: 19050,
      },
    })
    const { onClose, onSuccess } = renderModal(creditSale19600())

    await user.click(screen.getAllByRole('button', { name: /tout retourner|return all/i })[0])
    await user.click(screen.getAllByRole('button', { name: /tout retourner|return all/i })[1])

    expectFormattedCFA(19600)
    expectFormattedCFA(550)
    expectFormattedCFA(19050)

    await user.type(screen.getByLabelText(/Reason \(optional\)|Motif \(facultatif\)/i), 'Damaged')
    await user.click(screen.getByRole('button', { name: /traiter un retour|process return/i }))

    expect(rpc.processReturn).toHaveBeenCalledTimes(1)
    const params = vi.mocked(rpc.processReturn).mock.calls[0][0]
    expect(params.p_sale_id).toBe('sale-credit-1')
    expect(params.p_shift_id).toBe('shift-1')
    expect(params.p_reason).toBe('Damaged')
    expect(params.p_cash_refund_cfa).toBe(19050)
    expect(params.p_items).toEqual([
      { sale_item_id: 'item-cola', quantity_in_unit: 1, refund_amount_cfa: 1600 },
      { sale_item_id: 'item-rice', quantity_in_unit: 1, refund_amount_cfa: 18000 },
    ])
    expect(params.p_items[0]).not.toHaveProperty('quantity_pieces')
    expect(params.p_items[1]).not.toHaveProperty('quantity_pieces')
    expect(onSuccess).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('submits walk-in return with p_cash_refund_cfa equal to full refund', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockResolvedValue({
      ...successResult,
      data: {
        ...successResult.data,
        sale_id: 'sale-walkin-1',
        refund_amount_cfa: 19600,
        balance_adjustment_cfa: 0,
        cash_refunded_cfa: 19600,
      },
    })
    renderModal(walkInSale19600())

    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    expectFormattedCFA(0)
    expectFormattedCFA(19600)

    await user.click(screen.getByRole('button', { name: /traiter un retour|process return/i }))

    const params = vi.mocked(rpc.processReturn).mock.calls[0][0]
    expect(params.p_sale_id).toBe('sale-walkin-1')
    expect(params.p_cash_refund_cfa).toBe(19600)
    expect(params.p_cash_refund_cfa).not.toBe(0)
    expect(params.p_items).toEqual([
      { sale_item_id: 'item-walkin', quantity_in_unit: 1, refund_amount_cfa: 19600 },
    ])
    expect(params.p_items[0]).not.toHaveProperty('quantity_pieces')
    expect(params.p_shift_id).toBe('shift-1')
    expect(params.p_reason).toBeNull()
  })

  it('submits processReturn without quantity_pieces (no-credit sale sends full cash)', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockResolvedValue(successResult)
    const { onClose, onSuccess } = renderModal()

    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    await user.type(screen.getByLabelText(/Reason \(optional\)|Motif \(facultatif\)/i), 'Damaged')
    await user.click(screen.getByRole('button', { name: /traiter un retour|process return/i }))

    expect(rpc.processReturn).toHaveBeenCalledTimes(1)
    const params = vi.mocked(rpc.processReturn).mock.calls[0][0]
    expect(params.p_sale_id).toBe('sale-ret-1')
    expect(params.p_shift_id).toBe('shift-1')
    expect(params.p_reason).toBe('Damaged')
    expect(params.p_items).toEqual([
      { sale_item_id: 'item-open', quantity_in_unit: 3, refund_amount_cfa: 600 },
    ])
    expect(params.p_items[0]).not.toHaveProperty('quantity_pieces')
    expect(params.p_cash_refund_cfa).toBe(600)
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
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    await user.click(screen.getByRole('button', { name: /traiter un retour|process return/i }))

    expectToastErrorFr(toast.error, messageForCodePlain('RETURN_QTY_EXCEEDED'))
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getAllByText(/Retour — DKR-00000100|Return — DKR-00000100/).length,
    ).toBeGreaterThan(0)
  })

  it('maps cash_refund_does_not_match_computed to a specific toast', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockResolvedValue({
      data: null,
      error: {
        code: 'INVALID_AMOUNT',
        message: ERROR_MESSAGES.INVALID_AMOUNT,
        details: { reason: 'cash_refund_does_not_match_computed' },
      },
    })
    renderModal(creditSale19600())
    await user.click(screen.getAllByRole('button', { name: /tout retourner|return all/i })[0])
    await user.click(screen.getAllByRole('button', { name: /tout retourner|return all/i })[1])
    await user.click(screen.getByRole('button', { name: /traiter un retour|process return/i }))

    expectToastErrorFr(
      toast.error,
      messageForCodePlain('INVALID_AMOUNT', { reason: 'cash_refund_does_not_match_computed' }),
    )
    expect(toast.error).not.toHaveBeenCalledWith(ERROR_MESSAGES.INVALID_AMOUNT)
  })

  it('keeps generic INVALID_AMOUNT text when reason is absent', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockResolvedValue({
      data: null,
      error: {
        code: 'INVALID_AMOUNT',
        message: ERROR_MESSAGES.INVALID_AMOUNT,
      },
    })
    renderModal()
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    await user.click(screen.getByRole('button', { name: /traiter un retour|process return/i }))

    expectToastErrorFr(toast.error, messageForCodePlain('INVALID_AMOUNT'))
  })

  it('submits C3 residual cash for remaining qty 2 after a 1-of-3 return, not unrounded proportion', async () => {
    const user = userEvent.setup()
    const net = 950
    const firstChunk = roundCfa2(net / 3)
    const residual = roundCfa2(net - firstChunk)
    const unroundedRemaining = (2 / 3) * net

    vi.mocked(rpc.processReturn).mockResolvedValue({
      ...successResult,
      data: {
        ...successResult.data,
        sale_id: 'sale-c3',
        new_sale_status: 'returned',
        refund_amount_cfa: residual,
        balance_adjustment_cfa: 0,
        cash_refunded_cfa: residual,
      },
    })

    renderModal(
      makeSale({
        id: 'sale-c3',
        receipt_number: 'DKR-00000950',
        customer_id: null,
        customer_name: null,
        balance_added_cfa: 0,
        customer_balance_owed_cfa: null,
        discount_type: 'flat',
        discount_value: 100,
        discount_amount_cfa: 100,
        subtotal_cfa: 1050,
        total_cfa: 950,
        amount_tendered_cfa: 950,
        amount_applied_cfa: 950,
        items: [
          makeItem({
            id: 'item-c3',
            sale_id: 'sale-c3',
            product_name: 'Mineral Water 1.5L',
            quantity_in_unit: 3,
            quantity_pieces: 3,
            unit_price_cfa: 350,
            line_total_cfa: 1050,
            net_line_total_cfa: 950,
          }),
        ],
        returns: [
          {
            id: 'ret-c3-first',
            sale_id: 'sale-c3',
            shift_id: null,
            processed_by: 'cashier-1',
            reason: null,
            refund_amount_cfa: firstChunk,
            balance_adjustment_cfa: 0,
            cash_refunded_cfa: firstChunk,
            created_at: '2026-09-12T17:10:00Z',
            sale_return_items: [{
              id: 'ri-c3-first',
              return_id: 'ret-c3-first',
              sale_item_id: 'item-c3',
              quantity_in_unit: 1,
              quantity_pieces: 1,
              refund_amount_cfa: firstChunk,
            }],
          },
        ],
      }),
    )

    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    expect(screen.getByRole('spinbutton')).toHaveValue(2)
    await user.click(screen.getByRole('button', { name: /traiter un retour|process return/i }))

    const params = vi.mocked(rpc.processReturn).mock.calls[0][0]
    expect(params.p_items).toEqual([
      { sale_item_id: 'item-c3', quantity_in_unit: 2, refund_amount_cfa: residual },
    ])
    expect(params.p_items[0]).not.toHaveProperty('quantity_pieces')
    expect(params.p_cash_refund_cfa).toBe(residual)
    expect(params.p_cash_refund_cfa).toBe(633.33)
    expect(params.p_cash_refund_cfa).not.toBe(unroundedRemaining)
    expect(params.p_cash_refund_cfa).not.toBe(firstChunk * 2)
  })

  it('sends the processing shift, never the original sale shift', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockResolvedValue(successResult)
    renderModal(makeSale({ shift_id: 'sale-original-shift' }))
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    expect(
      screen.getAllByText(/remboursement compte dans le service|refund counts in the current shift/i).length,
    ).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /traiter un retour|process return/i }))
    expect(vi.mocked(rpc.processReturn).mock.calls[0][0].p_shift_id).toBe('shift-1')
    expect(vi.mocked(rpc.processReturn).mock.calls[0][0].p_shift_id).not.toBe('sale-original-shift')
  })

  it('B8: blocks a return without an open shift', async () => {
    const user = userEvent.setup()
    vi.mocked(useOpenShifts).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(rpc.processReturn).mockResolvedValue(successResult)
    renderModal(makeSale(), {}, null)
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    expect(
      screen.getAllByText(/ouvrez un service pour traiter ce retour|open a shift to process this return/i).length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /traiter un retour|process return/i })).toBeDisabled()
    expect(rpc.processReturn).not.toHaveBeenCalled()
  })

  it('B8: falls back to the depot open shift when the preferred id is stale', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockResolvedValue(successResult)
    renderModal(makeSale(), {}, 'stale-shift')
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    await user.click(screen.getByRole('button', { name: /traiter un retour|process return/i }))
    expect(vi.mocked(rpc.processReturn).mock.calls[0][0].p_shift_id).toBe('shift-1')
  })

  it('lets the cashier refund less than the full value while still returning stock qty', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockResolvedValue({
      ...successResult,
      data: {
        ...successResult.data,
        refund_amount_cfa: 150,
        cash_refunded_cfa: 150,
      },
    })
    renderModal()
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    const refundInput = screen.getByLabelText(/montant à rembourser|refund amount/i)
    await user.clear(refundInput)
    await user.type(refundInput, '150')
    expectFormattedCFA(150)
    await user.click(screen.getByRole('button', { name: /traiter un retour|process return/i }))
    const params = vi.mocked(rpc.processReturn).mock.calls[0][0]
    expect(params.p_items).toEqual([
      { sale_item_id: 'item-open', quantity_in_unit: 3, refund_amount_cfa: 150 },
    ])
    expect(params.p_cash_refund_cfa).toBe(150)
  })

  it('clamps a typed refund above the selected-qty maximum', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    const refundInput = screen.getByLabelText(/montant à rembourser|refund amount/i)
    await user.clear(refundInput)
    await user.type(refundInput, '9999')
    expect(refundInput).toHaveValue('600')
  })

  it('B1: refunds an overridden sale as a share of the payable total, not catalog nets', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockResolvedValue({
      ...successResult,
      data: {
        ...successResult.data,
        refund_amount_cfa: 300,
        cash_refunded_cfa: 300,
      },
    })
    renderModal(
      makeSale({
        total_cfa: 900,
        admin_override_total_cfa: 450,
        amount_tendered_cfa: 450,
        amount_applied_cfa: 450,
        items: [
          makeItem({
            id: 'item-open',
            quantity_in_unit: 3,
            quantity_pieces: 3,
            line_total_cfa: 600,
            net_line_total_cfa: 600,
          }),
          makeItem({
            id: 'item-cola',
            product_id: 'prod-2',
            quantity_in_unit: 1,
            quantity_pieces: 1,
            unit_price_cfa: 300,
            line_total_cfa: 300,
            net_line_total_cfa: 300,
            product_name: 'Cola',
            unit_name: 'Can',
          }),
        ],
        returns: [],
      }),
    )
    const returnAll = screen.getAllByRole('button', { name: /tout retourner|return all/i })
    await user.click(returnAll[0])
    await user.click(returnAll[1])
    await user.click(screen.getByRole('button', { name: /traiter un retour|process return/i }))

    const params = vi.mocked(rpc.processReturn).mock.calls[0][0]
    const water = params.p_items.find((item) => item.sale_item_id === 'item-open')
    const cola = params.p_items.find((item) => item.sale_item_id === 'item-cola')
    expect(water?.refund_amount_cfa).toBe(300)
    expect(cola?.refund_amount_cfa).toBe(150)
    expect(params.p_cash_refund_cfa).toBe(450)
  })

  it('ignores a second rapid Process Return click', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.processReturn).mockImplementation(
      () => new Promise(() => {}),
    )
    renderModal()
    await user.click(screen.getByRole('button', { name: /tout retourner|return all/i }))
    const submit = screen.getByRole('button', { name: /traiter un retour|process return/i })
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(rpc.processReturn).toHaveBeenCalledTimes(1)
  })
})
