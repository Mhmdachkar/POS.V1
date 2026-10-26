/**
 * Phase 13D / 14B-2 — SaleSuccessModal MoneyDisplay + authoritative print.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SaleSuccessModal } from '@/pages/pos/components/SaleSuccessModal'
import { formatCFA, formatDateTime } from '@/lib/formatters'
import { usePOSStore } from '@/stores/posStore'
import { useSaleDetail } from '@/hooks/useSales'
import type { CompleteSaleResult } from '@/types/rpc'
import type { Customer } from '@/types/database'
import type { SaleDetailData } from '@/hooks/useSales'
import { POS } from '@/lib/bilingual/pos'

vi.mock('@/hooks/useSales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSales')>()
  return {
    ...actual,
    useSaleDetail: vi.fn(),
  }
})

function result(overrides: Partial<CompleteSaleResult> = {}): CompleteSaleResult {
  return {
    sale_id: 'sale-abc',
    receipt_number: 'DKR-00000042',
    subtotal_cfa: 24500,
    discount_amount_cfa: 0,
    total_cfa: 24500,
    amount_tendered_cfa: 25000,
    amount_applied_cfa: 24500,
    change_given_cfa: 500,
    balance_added_cfa: 0,
    customer_id: null,
    payment_id: null,
    idempotent: false,
    ...overrides,
  }
}

const customer: Customer = {
  id: 'cust-1',
  name: 'Aminata Diallo',
  phone: null,
  address: null,
  balance_owed_cfa: 0,
  is_active: true,
  deactivated_at: null,
  created_by: 'admin-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function saleDetail(overrides: Partial<SaleDetailData> = {}): SaleDetailData {
  return {
    id: 'sale-abc',
    depot_id: 'depot-a',
    cashier_id: 'cashier-1',
    customer_id: customer.id,
    shift_id: null,
    receipt_number: 'DKR-00000042',
    status: 'completed',
    display_currency: 'CFA',
    cfa_to_usd_rate_used: 620,
    subtotal_cfa: 24500,
    discount_type: null,
    discount_value: null,
    discount_amount_cfa: 0,
    total_cfa: 24500,
    amount_tendered_cfa: 25000,
    amount_applied_cfa: 24500,
    change_given_cfa: 500,
    balance_added_cfa: 0,
    created_at: '2026-09-16T12:00:00.000Z',
    customer_name: 'Aminata Diallo',
    customer_phone: null,
    customer_balance_owed_cfa: 0,
    cashier_name: 'Cashier Dakar',
    items: [
      {
        id: 'si-1',
        sale_id: 'sale-abc',
        product_id: 'prod-001',
        unit_level: 0,
        quantity_in_unit: 2,
        quantity_pieces: 2,
        unit_price_cfa: 12250,
        cost_price_cfa: 600,
        line_total_cfa: 24500,
        net_line_total_cfa: 24500,
        product_name: 'Mineral Water',
        unit_name: 'Bottle',
      },
    ],
    returns: [],
    payments: [],
    ...overrides,
  }
}

function mockDetail(state: {
  data?: SaleDetailData
  isLoading?: boolean
  isError?: boolean
} = {}) {
  vi.mocked(useSaleDetail).mockReturnValue({
    data: state.data ?? saleDetail(),
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  } as never)
}

describe('SaleSuccessModal', () => {
  beforeEach(() => {
    usePOSStore.getState().startNewSale()
    mockDetail()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders total with MoneyDisplay display size', () => {
    render(<SaleSuccessModal result={result()} customer={null} cartItemCount={2} />)
    const label = formatCFA(24500)
    const total = screen.getByText((_, node) =>
      node?.tagName === 'SPAN' &&
      node.classList.contains('text-financial-lg') &&
      node.textContent === label,
    )
    expect(total).toHaveClass('text-financial-lg', 'financial-value')
  })

  it('renders change with MoneyDisplay large size', () => {
    render(<SaleSuccessModal result={result()} customer={null} cartItemCount={2} />)
    const change = screen.getByText((_, node) =>
      node?.tagName === 'SPAN' &&
      node.classList.contains('text-financial-md') &&
      node.textContent === formatCFA(500),
    )
    expect(change).toHaveClass('text-financial-md', 'financial-value')
  })

  it('renders balance with MoneyDisplay large danger', () => {
    render(
      <SaleSuccessModal
        result={result({ change_given_cfa: 0, balance_added_cfa: 4500, amount_applied_cfa: 20000 })}
        customer={customer}
        cartItemCount={2}
      />,
    )
    const balance = screen.getByText((_, node) =>
      node?.tagName === 'SPAN' &&
      node.classList.contains('text-financial-md') &&
      node.classList.contains('text-danger-foreground') &&
      node.textContent === formatCFA(4500),
    )
    expect(balance).toHaveClass('text-financial-md', 'financial-value', 'text-danger-foreground')
  })

  it('calls startNewSale from New Sale', async () => {
    const user = userEvent.setup()
    usePOSStore.getState().addItem({
      product_id: 'prod-001',
      product_name: 'Water',
      product_photo_url: '',
      unit_level: 0,
      unit_name: 'Piece',
      quantity_in_unit: 1,
      unit_price_cfa: 1000,
      cost_price_cfa: 600,
      conversion_to_base: 1,
    })
    usePOSStore.getState().ensureIdempotencyKey()
    render(<SaleSuccessModal result={result()} customer={null} cartItemCount={1} />)
    await user.click(screen.getByRole('button', { name: new RegExp(POS.newSale.fr, 'i') }))
    expect(usePOSStore.getState().items).toEqual([])
    expect(usePOSStore.getState().saleResult).toBeNull()
    expect(usePOSStore.getState().idempotencyKey).toBeNull()
  })

  it('disables Print while sale detail is loading', () => {
    mockDetail({ isLoading: true, data: undefined })
    render(<SaleSuccessModal result={result()} customer={null} cartItemCount={1} />)
    expect(screen.getByRole('button', { name: POS.browserPrintFallback.fr })).toBeDisabled()
  })

  it('disables Print when sale detail fails', () => {
    mockDetail({ isError: true, data: undefined })
    render(<SaleSuccessModal result={result()} customer={null} cartItemCount={1} />)
    expect(screen.getByRole('button', { name: POS.browserPrintFallback.fr })).toBeDisabled()
  })

  it('prints from authoritative sale detail, not the live cart or browser time', async () => {
    const user = userEvent.setup()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    mockDetail({
      data: saleDetail({
        created_at: '2026-09-16T12:00:00.000Z',
        items: [
          {
            id: 'si-db',
            sale_id: 'sale-abc',
            product_id: 'prod-db',
            unit_level: 0,
            quantity_in_unit: 2,
            quantity_pieces: 2,
            unit_price_cfa: 12250,
            cost_price_cfa: 600,
            line_total_cfa: 24500,
            net_line_total_cfa: 24500,
            product_name: 'Mineral Water',
            unit_name: 'Bottle',
          },
        ],
      }),
    })
    usePOSStore.getState().addItem({
      product_id: 'prod-cart',
      product_name: 'Cart After Sale',
      product_photo_url: '',
      unit_level: 0,
      unit_name: 'Piece',
      quantity_in_unit: 99,
      unit_price_cfa: 1,
      cost_price_cfa: 1,
      conversion_to_base: 1,
    })
    render(
      <SaleSuccessModal
        result={result()}
        customer={customer}
        cartItemCount={99}
      />,
    )

    await user.click(screen.getByRole('button', { name: POS.browserPrintFallback.fr }))
    expect(print).toHaveBeenCalledTimes(1)

    const receipt = document.getElementById('vhm-receipt')
    expect(receipt).toBeTruthy()
    const text = receipt?.textContent ?? ''
    expect(text).toContain('Aquilux POS')
    expect(text).toContain('LOT: DKR')
    expect(text).toContain('DKR-00000042')
    expect(text).toContain('Aminata Diallo')
    expect(text).toContain('Mineral Water')
    expect(text).toContain(formatDateTime('2026-09-16T12:00:00.000Z'))
    expect(text).toContain(formatCFA(24500))
    expect(text).toContain('TOTAL')
    expect(text).toContain('Espèces')
    expect(text).toContain('Monnaie')
    expect(text).toContain('PAYÉ')
    expect(text).toContain('Merci')
    expect(text).not.toContain('Cart After Sale')
    expect(text).not.toMatch(/payment method/i)
    expect(text).not.toMatch(/plate/i)
    expect(text).not.toMatch(/localhost/i)
    expect(text).not.toMatch(/https?:\/\//)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(receipt?.closest('[aria-hidden="true"]')).toBeTruthy()
  })
})
