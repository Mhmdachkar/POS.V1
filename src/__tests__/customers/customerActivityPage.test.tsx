import { CUSTOMERS } from '@/lib/bilingual/customers'
import { COMMON } from '@/lib/bilingual/common'
/**
 * Phase 15E — full customer activity page: filters, pagination, count, balance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CustomerActivityPage } from '@/pages/customers/CustomerActivityPage'
import { useCustomer } from '@/hooks/useCustomers'
import {
  CUSTOMER_ACTIVITY_PAGE_SIZE,
  useCustomerActivity,
  useCustomerActivitySummary,
  type CustomerActivityEvent,
} from '@/hooks/useCustomerActivity'
import { formatCFA } from '@/lib/formatters'
import { useAuthStore } from '@/stores/authStore'
import type { Customer, Staff } from '@/types/database'

vi.mock('@/hooks/useCustomers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCustomers')>()
  return {
    ...actual,
    useCustomer: vi.fn(),
  }
})

vi.mock('@/hooks/useCustomerActivity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCustomerActivity')>()
  return {
    ...actual,
    useCustomerActivity: vi.fn(),
    useCustomerActivitySummary: vi.fn(),
  }
})

vi.mock('@/hooks/useSales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSales')>()
  return {
    ...actual,
    useSaleDetail: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
  }
})

function adminStaff(): Staff {
  return {
    id: 'admin-1',
    username: 'admin',
    full_name: 'System Administrator',
    role: 'admin',
    depot_id: null,
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

const customer: Customer = {
  id: 'cust-1',
  name: 'Aminata Diallo',
  phone: '77000000',
  address: null,
  balance_owed_cfa: 4500,
  is_active: true,
  deactivated_at: null,
  created_by: 'admin-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function eventAt(i: number): CustomerActivityEvent {
  const n = 119 - i
  return {
    id: `sale-${n}`,
    type: 'sale',
    occurredAt: `2026-09-16T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`,
    reference: `DKR-${String(n).padStart(8, '0')}`,
    description: 'Credit added',
    amountCfa: 100 + n,
    saleId: `sale-${n}`,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/customers/cust-1/activity']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/customers/:customerId/activity" element={<CustomerActivityPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CustomerActivityPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      staff: adminStaff(),
      authLoadState: 'authorized',
      session: null,
      isLoading: false,
    })
    vi.mocked(useCustomer).mockReturnValue({
      data: customer,
      isLoading: false,
      isError: false,
    } as never)
    vi.mocked(useCustomerActivity).mockImplementation((_id, filters) => {
      const start = filters.page * filters.pageSize
      const rows = Array.from({ length: 119 }, (_, i) => eventAt(i)).slice(
        start,
        start + filters.pageSize,
      )
      return {
        data: { data: rows, count: 119 },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as never
    })
    vi.mocked(useCustomerActivitySummary).mockReturnValue({
      data: {
        sales: { count: 12, totalCfa: 48500 },
        returns: { count: 2, totalCfa: 1500 },
        payments: { count: 4, totalCfa: 8000 },
      },
      isLoading: false,
      isError: false,
    } as never)
  })

  it('shows sales, returns, payments totals and outstanding balance', () => {
    renderPage()
    expect(screen.getAllByText(CUSTOMERS.balanceOwed.fr)[0]).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    const money = (amount: number) =>
      screen.getAllByText((_, el) => el?.tagName === 'SPAN' && el.textContent === formatCFA(amount))
    expect(money(48500).length).toBeGreaterThan(0)
    expect(money(1500).length).toBeGreaterThan(0)
    expect(money(8000).length).toBeGreaterThan(0)
    expect(money(4500).length).toBeGreaterThan(0)
  })

  it('shows customer name, authoritative balance, and first page count', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Aminata Diallo' })).toBeInTheDocument()
    expect(screen.getAllByText(CUSTOMERS.outstandingBalance.fr)[0]).toBeInTheDocument()
    const owed = formatCFA(4500)
    const node = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === owed,
    ).find((el) => el.className.includes('text-financial-sm'))
    expect(node).toBeTruthy()
    expect(screen.getByText(CUSTOMERS.activityShowingRange(1, 25, 119).fr)).toBeInTheDocument()
    expect(screen.getByText('DKR-00000119')).toBeInTheDocument()
    expect(screen.queryByText('DKR-00000094')).not.toBeInTheDocument()
    expect(screen.getAllByText(/^Vente$/).length).toBe(CUSTOMER_ACTIVITY_PAGE_SIZE)
  })

  it('moves to the next and previous page', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: COMMON.next.fr }))
    expect(useCustomerActivity).toHaveBeenCalledWith(
      'cust-1',
      expect.objectContaining({ page: 1, pageSize: CUSTOMER_ACTIVITY_PAGE_SIZE }),
    )
    expect(screen.getByText(CUSTOMERS.activityShowingRange(26, 50, 119).fr)).toBeInTheDocument()
    expect(screen.getByText('DKR-00000094')).toBeInTheDocument()
    expect(screen.queryByText('DKR-00000119')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: COMMON.previous.fr }))
    expect(useCustomerActivity).toHaveBeenCalledWith(
      'cust-1',
      expect.objectContaining({ page: 0 }),
    )
    expect(screen.getByText(CUSTOMERS.activityShowingRange(1, 25, 119).fr)).toBeInTheDocument()
  })

  it('resets to the first page when the type filter changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: COMMON.next.fr }))
    await user.click(screen.getByRole('tab', { name: /Returns|Retours/i }))
    expect(useCustomerActivity).toHaveBeenCalledWith(
      'cust-1',
      expect.objectContaining({ type: 'return', page: 0 }),
    )
  })

  it('does not derive the header balance from visible activity amounts', () => {
    vi.mocked(useCustomerActivity).mockReturnValue({
      data: {
        data: [{
          id: 'sale-x',
          type: 'sale',
          occurredAt: '2026-09-16T10:00:00Z',
          reference: 'DKR-00000001',
          description: 'Credit added',
          amountCfa: 99999,
          saleId: 'sale-x',
        }],
        count: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never)
    renderPage()
    const headerBalance = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === formatCFA(4500),
    ).find((el) => el.className.includes('text-financial-sm'))
    expect(headerBalance).toBeTruthy()
    expect(headerBalance).toHaveClass('text-financial-sm', 'financial-value')
    expect(screen.queryByText(formatCFA(99998))).not.toBeInTheDocument()
  })

  it('formats a negative running solde as en votre faveur', () => {
    vi.mocked(useCustomerActivity).mockReturnValue({
      data: {
        data: [{
          id: 'pay-x',
          type: 'payment',
          occurredAt: '2026-10-26T12:00:00Z',
          reference: 'MAIN-REG-00000001',
          description: 'Balance payment',
          amountCfa: -100,
          saleId: null,
          runningBalanceCfa: -100,
        }],
        count: 1,
        accountBalanceCfa: -100,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never)
    renderPage()
    expect(screen.getAllByText(`${formatCFA(100)} ${CUSTOMERS.enVotreFaveur.fr}`).length).toBeGreaterThan(0)
    expect(screen.queryByText(`${formatCFA(-100)}`)).not.toBeInTheDocument()
  })
})
