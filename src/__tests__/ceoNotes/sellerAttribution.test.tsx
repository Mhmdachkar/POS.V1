/**
 * CEO Notes — Sale detail shows seller name + Admin/Cashier role badge.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SaleDetailDrawer } from '@/pages/sales/components/SaleDetailDrawer'
import { useSaleDetail, type SaleDetailData } from '@/hooks/useSales'
import { SALES } from '@/lib/bilingual/sales'
import { getByFrench } from '../helpers/bilingualQueries'

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
    customer_id: null,
    shift_id: null,
    receipt_number: 'DKR-00000100',
    status: 'completed',
    display_currency: 'CFA',
    cfa_to_usd_rate_used: 600,
    subtotal_cfa: 500,
    discount_type: null,
    discount_value: null,
    discount_amount_cfa: 0,
    total_cfa: 500,
    amount_tendered_cfa: 500,
    amount_applied_cfa: 500,
    change_given_cfa: 0,
    balance_added_cfa: 0,
    created_at: '2026-09-12T17:00:00Z',
    customer_name: null,
    customer_phone: null,
    customer_balance_owed_cfa: null,
    cashier_name: 'Cashier',
    cashier_role: 'cashier',
    items: [],
    returns: [],
    payments: [],
    fulfillment: null,
    ...overrides,
  }
}

function renderDrawer(sale: SaleDetailData) {
  vi.mocked(useSaleDetail).mockReturnValue({
    data: sale,
    isLoading: false,
    isError: false,
  } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SaleDetailDrawer saleId={sale.id} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('CEO Notes — seller attribution', () => {
  beforeEach(() => {
    vi.mocked(useSaleDetail).mockReset()
  })

  it('shows French Vendu par label', () => {
    renderDrawer(baseSale())
    expect(getByFrench(SALES.soldBy.fr)).toBeInTheDocument()
    expect(screen.getByText('Cashier')).toBeInTheDocument()
  })

  it('shows Cashier role badge from cashier_role', () => {
    renderDrawer(baseSale({ cashier_role: 'cashier', cashier_name: 'Awa Ndiaye' }))
    expect(screen.getByText('Awa Ndiaye')).toBeInTheDocument()
    expect(screen.getByText(SALES.sellerCashier.fr, { exact: true })).toBeInTheDocument()
    expect(screen.queryByText(SALES.sellerAdmin.fr)).not.toBeInTheDocument()
  })

  it('shows Admin role badge from cashier_role', () => {
    renderDrawer(
      baseSale({
        cashier_id: 'admin-1',
        cashier_name: 'Admin User',
        cashier_role: 'admin',
      }),
    )
    expect(screen.getByText('Admin User')).toBeInTheDocument()
    expect(screen.getByText(SALES.sellerAdmin.fr, { exact: true })).toBeInTheDocument()
    expect(screen.queryByText(SALES.sellerCashier.fr)).not.toBeInTheDocument()
  })

  it('omits role badge when cashier_role is null', () => {
    renderDrawer(baseSale({ cashier_role: null, cashier_name: 'Unknown Seller' }))
    expect(screen.getByText('Unknown Seller')).toBeInTheDocument()
    expect(screen.queryByText(SALES.sellerAdmin.fr)).not.toBeInTheDocument()
    expect(screen.queryByText(SALES.sellerCashier.fr)).not.toBeInTheDocument()
  })
})
