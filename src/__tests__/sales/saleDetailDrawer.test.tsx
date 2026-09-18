/**
 * Phase 8 — SaleDetailDrawer action gates, invalidation, receipt regression.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SaleDetailDrawer } from '@/pages/sales/components/SaleDetailDrawer'
import { useSaleDetail, saleKeys } from '@/hooks/useSales'
import { productKeys } from '@/hooks/useProducts'
import { customerKeys } from '@/hooks/useCustomers'
import type { SaleDetailData } from '@/hooks/useSales'
import { formatCFA } from '@/lib/formatters'
import { formatShiftTimeRange } from '@/lib/shiftAttribution'
import { SALES } from '@/lib/bilingual/sales'

vi.mock('@/hooks/useSales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSales')>()
  return {
    ...actual,
    useSaleDetail: vi.fn(),
  }
})

vi.mock('@/lib/rpc', () => ({
  rpc: {
    processReturn: vi.fn(),
    voidSale: vi.fn(),
  },
}))

vi.mock('@/hooks/usePrintJobs', () => ({
  usePrintJobsForSale: vi.fn(() => ({ data: [], isLoading: false })),
  releaseSaleFulfillment: vi.fn(),
  requeuePrintJob: vi.fn(),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { staff: { role: string } }) => unknown) =>
    selector({ staff: { role: 'cashier' } }),
}))

function baseSale(overrides: Partial<SaleDetailData> = {}): SaleDetailData {
  return {
    id: 'sale-1',
    depot_id: 'depot-a',
    cashier_id: 'cashier-1',
    customer_id: 'cust-1',
    shift_id: null,
    receipt_number: 'DKR-00000099',
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
    customer_name: 'Test Customer',
    customer_phone: '77000000',
    customer_balance_owed_cfa: 0,
    cashier_name: 'Cashier Dakar',
    items: [
      {
        id: 'item-1',
        sale_id: 'sale-1',
        product_id: 'prod-1',
        unit_level: 0,
        quantity_in_unit: 3,
        quantity_pieces: 3,
        unit_price_cfa: 300,
        cost_price_cfa: 200,
        line_total_cfa: 900,
        net_line_total_cfa: 900,
        product_name: 'Cola Can 33cl',
        unit_name: 'Can',
      },
    ],
    returns: [],
    payments: [],
    fulfillment: null,
    ...overrides,
  }
}

function renderDrawer(sale: SaleDetailData | null, opts?: { loading?: boolean; error?: boolean }) {
  vi.mocked(useSaleDetail).mockReturnValue({
    data: sale,
    isLoading: !!opts?.loading,
    isError: !!opts?.error,
  } as never)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

  const view = render(
    <QueryClientProvider client={client}>
      <SaleDetailDrawer saleId={sale ? sale.id : 'sale-1'} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
  return { ...view, client, invalidateSpy }
}

describe('SaleDetailDrawer', () => {
  beforeEach(() => {
    vi.mocked(useSaleDetail).mockReset()
  })

  it('renders loading skeletons', () => {
    renderDrawer(null, { loading: true })
    expect(screen.queryByText(SALES.failedDetail.fr)).not.toBeInTheDocument()
  })

  it('renders error state', () => {
    renderDrawer(null, { error: true })
    expect(screen.getByText(SALES.failedDetail.fr)).toBeInTheDocument()
  })

  it('completed: Return and Void are visible', () => {
    renderDrawer(baseSale({ status: 'completed' }))
    expect(screen.getByRole('button', { name: SALES.returnTitle.fr })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: SALES.voidSale.fr })).toBeInTheDocument()
  })

  it('shows cashier without shift badge or explanation', () => {
    renderDrawer(baseSale({ shift_id: null }))
    expect(screen.getByText('Cashier Dakar')).toBeInTheDocument()
    expect(screen.queryByText('NO SHIFT')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Shift$/)).not.toBeInTheDocument()
  })

  it('does not show historical shift time range on the detail drawer', () => {
    renderDrawer(baseSale({
      shift_id: 'sh-1',
      shift_opened_at: '2026-09-13T08:00:00.000Z',
      shift_closed_at: '2026-09-13T16:00:00.000Z',
    }))
    expect(screen.getByText('Cashier Dakar')).toBeInTheDocument()
    expect(screen.queryByText('NO SHIFT')).not.toBeInTheDocument()
    expect(
      screen.queryByText(formatShiftTimeRange('2026-09-13T08:00:00.000Z', '2026-09-13T16:00:00.000Z')),
    ).not.toBeInTheDocument()
  })

  it('partially_returned with remaining qty: Return visible, Void hidden', () => {
    renderDrawer(baseSale({
      status: 'partially_returned',
      returns: [{
        id: 'ret-1',
        sale_id: 'sale-1',
        shift_id: null,
        processed_by: 'admin-1',
        reason: null,
        refund_amount_cfa: 300,
        balance_adjustment_cfa: 0,
        cash_refunded_cfa: 300,
        created_at: '2026-09-12T18:00:00Z',
        sale_return_items: [{
          id: 'ri-1',
          return_id: 'ret-1',
          sale_item_id: 'item-1',
          quantity_in_unit: 1,
          quantity_pieces: 1,
          refund_amount_cfa: 300,
        }],
      }],
    }))
    expect(screen.getByRole('button', { name: SALES.returnTitle.fr })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SALES.voidSale.fr })).not.toBeInTheDocument()
  })

  it('fully returned items: Return and Void hidden', () => {
    renderDrawer(baseSale({
      status: 'returned',
      returns: [{
        id: 'ret-1',
        sale_id: 'sale-1',
        shift_id: null,
        processed_by: 'admin-1',
        reason: null,
        refund_amount_cfa: 900,
        balance_adjustment_cfa: 0,
        cash_refunded_cfa: 900,
        created_at: '2026-09-12T18:00:00Z',
        sale_return_items: [{
          id: 'ri-1',
          return_id: 'ret-1',
          sale_item_id: 'item-1',
          quantity_in_unit: 3,
          quantity_pieces: 3,
          refund_amount_cfa: 900,
        }],
      }],
    }))
    expect(screen.queryByRole('button', { name: SALES.returnTitle.fr })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SALES.voidSale.fr })).not.toBeInTheDocument()
  })

  it('voided: Return and Void hidden, void section shown', () => {
    renderDrawer(baseSale({ status: 'voided' }))
    expect(screen.queryByRole('button', { name: SALES.returnTitle.fr })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SALES.voidSale.fr })).not.toBeInTheDocument()
    expect(screen.getByText(SALES.saleVoidedBanner.fr)).toBeInTheDocument()
  })

  it('opens ReturnModal from the Return button', async () => {
    const user = userEvent.setup()
    renderDrawer(baseSale())
    await user.click(screen.getByRole('button', { name: SALES.returnTitle.fr }))
    expect(
      screen.getAllByText(/Return — DKR-00000099|Retour — DKR-00000099/).length,
    ).toBeGreaterThan(0)
  })

  it('opens VoidModal from the Void button', async () => {
    const user = userEvent.setup()
    renderDrawer(baseSale())
    await user.click(screen.getByRole('button', { name: SALES.voidSale.fr }))
    expect(screen.getByRole('heading', { name: /Void Sale|Annuler la vente/i })).toBeInTheDocument()
    expect(screen.getByText('Cette action est définitive.')).toBeInTheDocument()
  })

  it('Browser print (fallback) uses a structured POS ticket without URLs', async () => {
    const user = userEvent.setup()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderDrawer(baseSale())
    await user.click(screen.getByRole('button', { name: SALES.browserPrintFallback.fr }))
    const receipt = document.getElementById('vhm-receipt-drawer')
    expect(receipt).toBeTruthy()
    const html = receipt?.innerHTML ?? ''
    expect(html).toContain('LOT: DKR')
    expect(html).toContain('DKR-00000099')
    expect(html).toContain('Test Customer')
    expect(html).toContain('Cola Can 33cl')
    expect(html).toContain('3 Can')
    expect(html).toContain(formatCFA(900))
    expect(html).toContain('Sous-total')
    expect(html).toContain('TOTAL')
    expect(html).toContain('Espèces')
    expect(html).toContain('PAYÉ')
    expect(html).toContain('Merci')
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/localhost/i)
    expect(html).not.toMatch(/plate|payment method|timestamp|reimburs/i)
    print.mockRestore()
  })

  it('invalidates sale detail, lists, products, and customers after a successful void', async () => {
    const user = userEvent.setup()
    const { rpc } = await import('@/lib/rpc')
    vi.mocked(rpc.voidSale).mockResolvedValue({
      data: {
        sale_id: 'sale-1',
        voided_at: '2026-09-12T19:00:00Z',
        stock_restored_items: [],
        balance_reversed_cfa: 0,
        payment_reversed: false,
      },
      error: null,
    })

    const { invalidateSpy } = renderDrawer(baseSale())
    await user.click(screen.getByRole('button', { name: SALES.voidSale.fr }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /Void sale|Annuler la vente/i }))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: saleKeys.detail('sale-1') })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: saleKeys.lists() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: productKeys.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: customerKeys.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: customerKeys.detail('cust-1') })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inventory', 'list'] })
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['reports'], refetchType: 'active' }),
    )
  })

  it('13E-A: Total uses MoneyDisplay medium; owed balance uses small + danger', () => {
    document.getElementById('vhm-receipt-drawer')?.remove()
    renderDrawer(baseSale({
      total_cfa: 12500,
      customer_balance_owed_cfa: 4500,
    }))

    const totalLabel = formatCFA(12500)
    const totalNode = screen.getAllByText((_, node) =>
      node?.tagName === 'SPAN' && node.textContent === totalLabel,
    ).find((el) => el.className.includes('text-financial-sm'))
    expect(totalNode).toBeTruthy()
    expect(totalNode).toHaveClass('text-financial-sm', 'financial-value')

    const balanceLabel = formatCFA(4500)
    const balanceNode = screen.getAllByText((_, node) =>
      node?.tagName === 'SPAN' && node.textContent === balanceLabel,
    ).find((el) => el.className.includes('financial-value'))
    expect(balanceNode).toBeTruthy()
    expect(balanceNode).toHaveClass('text-sm', 'financial-value', 'text-danger-foreground')
  })

  it('13E-E: zero current balance uses MoneyDisplay small without danger', () => {
    renderDrawer(baseSale({ customer_balance_owed_cfa: 0 }))
    const zero = formatCFA(0)
    const node = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === zero,
    ).find((el) => el.className.includes('financial-value'))
    expect(node).toBeTruthy()
    expect(node).toHaveClass('text-sm', 'financial-value')
    expect(node).not.toHaveClass('text-danger-foreground')
  })

  it('13E-E: item, financial, and return rows use MoneyDisplay; actions sit after content', () => {
    renderDrawer(baseSale({
      subtotal_cfa: 1100,
      discount_type: 'flat',
      discount_value: 100,
      discount_amount_cfa: 100,
      total_cfa: 1000,
      amount_tendered_cfa: 1300,
      amount_applied_cfa: 1000,
      change_given_cfa: 300,
      balance_added_cfa: 200,
      items: [{
        id: 'item-1',
        sale_id: 'sale-1',
        product_id: 'prod-1',
        unit_level: 0,
        quantity_in_unit: 2,
        quantity_pieces: 2,
        unit_price_cfa: 550,
        cost_price_cfa: 200,
        line_total_cfa: 1100,
        net_line_total_cfa: 1100,
        product_name: 'Cola Can 33cl',
        unit_name: 'Can',
      }],
      returns: [{
        id: 'ret-1',
        sale_id: 'sale-1',
        shift_id: null,
        processed_by: 'admin-1',
        reason: null,
        refund_amount_cfa: 250,
        balance_adjustment_cfa: 40,
        cash_refunded_cfa: 210,
        created_at: '2026-09-12T18:00:00Z',
        sale_return_items: [{
          id: 'ri-1',
          return_id: 'ret-1',
          sale_item_id: 'item-1',
          quantity_in_unit: 1,
          quantity_pieces: 1,
          refund_amount_cfa: 250,
        }],
      }],
    }))

    const small = (amount: number) =>
      screen.getAllByText((_, el) =>
        el?.tagName === 'SPAN' && el.textContent === formatCFA(amount),
      ).find((el) => el.className.includes('text-sm') && el.className.includes('financial-value'))

    expect(small(550)).toBeTruthy()
    expect(small(550)).toHaveClass('text-text-secondary')
    expect(small(1100)).toBeTruthy()
    const discount = small(-100)
    expect(discount).toBeTruthy()
    expect(discount).toHaveClass('text-success-foreground')
    expect(small(1300)).toBeTruthy()
    expect(small(1000)).toBeTruthy()
    const change = small(300)
    expect(change).toBeTruthy()
    expect(change).toHaveClass('text-success-foreground')
    const added = small(200)
    expect(added).toBeTruthy()
    expect(added).toHaveClass('text-danger-foreground')
    expect(small(250)).toBeTruthy()
    expect(small(210)).toBeTruthy()
    expect(small(40)).toBeTruthy()

    expect(screen.getAllByText(/^Actions$/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: SALES.browserPrintFallback.fr })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: SALES.returnTitle.fr })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: SALES.voidSale.fr })).toBeInTheDocument()
  })
})
