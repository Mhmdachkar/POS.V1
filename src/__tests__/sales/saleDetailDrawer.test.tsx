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
    expect(screen.queryByText('Failed to load sale details.')).not.toBeInTheDocument()
  })

  it('renders error state', () => {
    renderDrawer(null, { error: true })
    expect(screen.getByText('Failed to load sale details.')).toBeInTheDocument()
  })

  it('completed: Return and Void are visible', () => {
    renderDrawer(baseSale({ status: 'completed' }))
    expect(screen.getByRole('button', { name: /Return/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Void/ })).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /Return/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Void/ })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: /Return/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Void/ })).not.toBeInTheDocument()
  })

  it('voided: Return and Void hidden, void section shown', () => {
    renderDrawer(baseSale({ status: 'voided' }))
    expect(screen.queryByRole('button', { name: /Return/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Void/ })).not.toBeInTheDocument()
    expect(screen.getByText('This sale has been voided.')).toBeInTheDocument()
  })

  it('opens ReturnModal from the Return button', async () => {
    const user = userEvent.setup()
    renderDrawer(baseSale())
    await user.click(screen.getByRole('button', { name: /Return/ }))
    expect(screen.getByText('Return — DKR-00000099')).toBeInTheDocument()
  })

  it('opens VoidModal from the Void button', async () => {
    const user = userEvent.setup()
    renderDrawer(baseSale())
    await user.click(screen.getByRole('button', { name: /Void/ }))
    expect(screen.getByRole('heading', { name: 'Void Sale' })).toBeInTheDocument()
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument()
  })

  it('Print Receipt uses the established customer receipt fields only', async () => {
    const user = userEvent.setup()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderDrawer(baseSale())
    await user.click(screen.getByRole('button', { name: /Print Receipt/ }))
    const receipt = document.getElementById('vhm-receipt-drawer')
    expect(receipt).toBeTruthy()
    const html = receipt?.innerHTML ?? ''
    expect(html).toContain('LOT: DKR')
    expect(html).toContain('DKR-00000099')
    expect(html).toContain('Test Customer')
    expect(html).toContain(formatCFA(900))
    expect(html).toContain('PAID')
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
    await user.click(screen.getByRole('button', { name: /Void/ }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Void Sale' }))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: saleKeys.detail('sale-1') })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: saleKeys.lists() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: productKeys.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: customerKeys.all })
  })
})
