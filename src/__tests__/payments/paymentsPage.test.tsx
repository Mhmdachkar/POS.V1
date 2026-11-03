/**
 * Phase 13E-C — PaymentsPage secondary-screen UI foundations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PaymentsPage } from '@/pages/payments/PaymentsPage'
import { formatCFA } from '@/lib/formatters'
import type { Payment } from '@/types/database'
import { PAYMENTS } from '@/lib/bilingual/payments'
import { COMMON } from '@/lib/bilingual/common'

type PaymentRow = Payment & {
  customers: { name: string } | null
  customer_name?: string
  [key: string]: unknown
}

const PAYMENTS_DESCRIPTION = PAYMENTS.pageDesc.fr

function makePayment(i: number, overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: `pay-${i}`,
    customer_id: `cust-${i % 5}`,
    sale_id: null,
    shift_id: null,
    payment_type: 'customer_payment',
    amount_cfa: 5000 + i * 100,
    recorded_by: 'cashier-1',
    recorded_at: `2026-09-12T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`,
    note: i === 0 ? 'Partial repayment' : null,
    is_reversed: i === 3,
    reversed_at: i === 3 ? '2026-09-13T10:00:00Z' : null,
    reversed_by: i === 3 ? 'admin-1' : null,
    reversed_by_return_id: null,
    customers: { name: i === 0 ? 'John Doe' : `Customer ${i % 5}` },
    ...overrides,
  }
}

function buildCatalog(): PaymentRow[] {
  return Array.from({ length: 40 }, (_, i) => makePayment(i))
}

function mockPaymentList(allRows: PaymentRow[]) {
  const calls: Record<string, unknown>[] = []
  vi.mocked(supabase.rpc).mockImplementation((name: string, params: Record<string, unknown> = {}) => {
    if (name !== 'list_customer_payments') {
      return Promise.resolve({ data: null, error: null })
    }
    calls.push(params)
    let rows = allRows.filter((r) => r.payment_type === 'customer_payment')
    if (!params.p_include_reversed) rows = rows.filter((r) => !r.is_reversed)
    if (params.p_search) {
      const q = String(params.p_search).toLowerCase()
      rows = rows.filter((r) => (r.customers?.name ?? '').toLowerCase().includes(q))
    }
    if (params.p_start_at) {
      rows = rows.filter((r) => r.recorded_at >= String(params.p_start_at))
    }
    if (params.p_end_at) {
      rows = rows.filter((r) => r.recorded_at <= String(params.p_end_at))
    }
    const offset = Number(params.p_offset ?? 0)
    const limit = Number(params.p_limit ?? 30)
    const page = rows.slice(offset, offset + limit).map((p) => ({
      ...p,
      customer_name: p.customers?.name ?? null,
      recorded_by_name: null,
    }))
    return Promise.resolve({ data: { count: rows.length, rows: page }, error: null })
  })
  return { calls }
}

function renderPayments() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PaymentsPage />
    </QueryClientProvider>,
  )
}

describe('PaymentsPage (13E-C)', () => {
  const catalog = buildCatalog()

  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset()
    mockPaymentList(catalog)
  })

  it('renders Customer Payments heading and exact persistent description', async () => {
    renderPayments()

    expect(
      await screen.findByRole('heading', { name: new RegExp(PAYMENTS.pageTitle.fr, 'i') }),
    ).toBeInTheDocument()
    // Exact full description — must not be shortened when results exist
    expect(screen.getByText(PAYMENTS_DESCRIPTION)).toBeInTheDocument()
    expect(screen.queryByText(/^Standalone customer debt repayments$/)).not.toBeInTheDocument()
    // Old filter-row helper caption must never render
    expect(
      screen.queryByText(/Depot isolation enforced by database/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/you see only your authorized payments/i),
    ).not.toBeInTheDocument()
    // Default excludes reversed (1 of 40) → count 39; description still present
    expect(await screen.findByText('39')).toBeInTheDocument()
    expect(screen.getByText(PAYMENTS_DESCRIPTION)).toBeInTheDocument()
  })

  it('never renders the old depot-isolation caption alongside populated rows', async () => {
    renderPayments()

    expect(await screen.findByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText(PAYMENTS_DESCRIPTION)).toBeInTheDocument()
    expect(
      screen.queryByText('· Depot isolation enforced by database — you see only your authorized payments.'),
    ).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(
      /Depot isolation enforced by database — you see only your authorized payments/,
    )
  })

  it('shows SearchInput, reversed chips, and FilterBar count', async () => {
    renderPayments()

    expect(await screen.findByPlaceholderText(PAYMENTS.searchCustomer.fr)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: PAYMENTS.excludingReversed.fr }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: PAYMENTS.includingReversed.fr }),
    ).toBeInTheDocument()
    expect(await screen.findByText('39')).toBeInTheDocument()
  })

  it('keeps Date / Customer / Amount / Status / Note columns and omits method/sale UI', async () => {
    renderPayments()

    await screen.findByText('John Doe')

    expect(screen.getAllByText('Date').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Client|Customer/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Montant|Amount/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Statut|Status/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Note').length).toBeGreaterThan(0)

    expect(screen.queryByText('Payment Method')).not.toBeInTheDocument()
    expect(screen.queryByText('Cashier')).not.toBeInTheDocument()
    expect(screen.queryByText('Depot')).not.toBeInTheDocument()
    expect(screen.queryByText('Sale')).not.toBeInTheDocument()
    expect(screen.queryByText('Receipt')).not.toBeInTheDocument()
  })

  it('renders amounts with MoneyDisplay small', async () => {
    renderPayments()

    await screen.findByText('John Doe')
    const totalLabel = formatCFA(catalog[0]!.amount_cfa)
    const totalNode = screen.getAllByText((_, node) =>
      node?.tagName === 'SPAN' && node.textContent === totalLabel,
    ).find((el) => el.className.includes('financial-value'))

    expect(totalNode).toBeTruthy()
    expect(totalNode).toHaveClass('text-sm', 'financial-value')
    expect(totalNode?.className).not.toMatch(/text-financial-/)
    expect(totalNode?.className).not.toMatch(/text-danger/)
  })

  it('rows remain non-clickable', async () => {
    renderPayments()

    const name = await screen.findByText('John Doe')
    expect(name.closest('button')).toBeNull()
    expect(screen.queryByRole('button', { name: /John Doe/ })).not.toBeInTheDocument()
    const row = name.closest('div.grid')
    expect(row).toBeTruthy()
    expect(row?.onclick).toBeNull()
  })

  it('queries only customer_payment and excludes reversed by default', async () => {
    const { calls } = mockPaymentList(catalog)
    renderPayments()

    await screen.findByText('John Doe')
    expect(calls[0]?.p_include_reversed).toBe(false)
    expect(calls[0]?.p_search).toBeNull()
    expect(calls[0]?.p_start_at).toBeNull()
    expect(calls[0]?.p_end_at).toBeNull()
  })

  it('shows date chips unselected by default and applies yesterday when chosen', async () => {
    const user = userEvent.setup()
    const { calls } = mockPaymentList(catalog)
    renderPayments()

    await screen.findByText('John Doe')
    expect(screen.getByRole('button', { name: COMMON.today.fr })).toHaveAttribute('aria-pressed', 'false')
    calls.length = 0
    await user.click(screen.getByRole('button', { name: COMMON.yesterday.fr }))
    await waitFor(() => {
      expect(calls.some((c) => c.p_start_at != null && c.p_end_at != null)).toBe(true)
    })
    expect(screen.getByRole('button', { name: COMMON.yesterday.fr })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Showing reversed removes the is_reversed filter while keeping customer_payment', async () => {
    const user = userEvent.setup()
    const { calls } = mockPaymentList(catalog)
    renderPayments()

    await screen.findByText('John Doe')
    calls.length = 0

    await user.click(
      screen.getByRole('button', { name: PAYMENTS.includingReversed.fr }),
    )

    await waitFor(() => {
      expect(calls.some((c) => c.p_include_reversed === true)).toBe(true)
    })
  })

  it('search is immediate and filters by customer name', async () => {
    const user = userEvent.setup()
    const { calls } = mockPaymentList(catalog)
    renderPayments()

    await screen.findByText('John Doe')
    calls.length = 0

    await user.type(screen.getByPlaceholderText(/Customer name|Nom du client/i), 'John')

    await waitFor(() => {
      expect(calls.some((c) => String(c.p_search ?? '').includes('John'))).toBe(true)
    })
  })
})
