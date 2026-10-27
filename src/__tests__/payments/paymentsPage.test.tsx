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

function createPaymentsFrom(allRows: PaymentRow[]) {
  const calls: string[] = []
  let filtered = [...allRows]
  let range: [number, number] | null = null
  let table = 'payments'

  const builder: Record<string, unknown> = {}

  builder.select = (...args: unknown[]) => {
    calls.push(`${table}:select:${JSON.stringify(args[1] ?? {})}`)
    if (table === 'payments') {
      filtered = [...allRows]
      range = null
    }
    return builder
  }
  builder.order = (col: unknown) => {
    calls.push(`${table}:order:${String(col)}`)
    return builder
  }
  builder.eq = (col: unknown, val: unknown) => {
    calls.push(`${table}:eq:${String(col)}:${String(val)}`)
    if (table === 'payments') {
      filtered = filtered.filter((r) => r[String(col)] === val)
    }
    return builder
  }
  builder.ilike = (col: unknown, val: unknown) => {
    calls.push(`${table}:ilike:${String(col)}:${String(val)}`)
    return builder
  }
  builder.in = (col: unknown, vals: unknown) => {
    const ids = vals as string[]
    calls.push(`${table}:in:${String(col)}:${ids.join(',')}`)
    if (table === 'payments') {
      filtered = filtered.filter((r) => ids.includes(String(r[String(col)])))
    }
    return builder
  }
  builder.limit = (n: unknown) => {
    calls.push(`${table}:limit:${String(n)}`)
    return builder
  }
  builder.range = (from: unknown, to: unknown) => {
    calls.push(`${table}:range:${from}-${to}`)
    range = [Number(from), Number(to)]
    return builder
  }

  const execute = () => {
    if (table === 'customers') {
      // Customer name search stub — return matching ids from payment catalog names
      const names = new Map<string, string>()
      for (const row of allRows) {
        const name = row.customers?.name
        if (name) names.set(row.customer_id, name)
      }
      const data = [...names.entries()].map(([id, name]) => ({ id, name }))
      return Promise.resolve({ data, error: null, count: data.length })
    }

    const count = filtered.length
    const page = range ? filtered.slice(range[0], range[1] + 1) : filtered
    return Promise.resolve({ data: page, error: null, count })
  }

  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    execute().then(resolve, reject)

  function from(name: string) {
    table = name
    calls.push(`from:${name}`)
    return builder
  }

  return { from, calls, builder }
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
    vi.mocked(supabase.from).mockReset()
  })

  it('renders Customer Payments heading and exact persistent description', async () => {
    const { from } = createPaymentsFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
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
    const { from } = createPaymentsFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
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
    const { from } = createPaymentsFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
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
    const { from } = createPaymentsFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
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
    const { from } = createPaymentsFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
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
    const { from } = createPaymentsFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPayments()

    const name = await screen.findByText('John Doe')
    expect(name.closest('button')).toBeNull()
    expect(screen.queryByRole('button', { name: /John Doe/ })).not.toBeInTheDocument()
    const row = name.closest('div.grid')
    expect(row).toBeTruthy()
    expect(row?.onclick).toBeNull()
  })

  it('queries only customer_payment and excludes reversed by default', async () => {
    const { from, calls } = createPaymentsFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPayments()

    await screen.findByText('John Doe')
    expect(calls).toContain('payments:eq:payment_type:customer_payment')
    expect(calls).toContain('payments:eq:is_reversed:false')
    expect(calls.some((c) => c.includes('sale_payment'))).toBe(false)
  })

  it('Showing reversed removes the is_reversed filter while keeping customer_payment', async () => {
    const user = userEvent.setup()
    const { from, calls } = createPaymentsFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPayments()

    await screen.findByText('John Doe')
    calls.length = 0

    await user.click(
      screen.getByRole('button', { name: PAYMENTS.includingReversed.fr }),
    )

    await waitFor(() => {
      expect(calls).toContain('payments:eq:payment_type:customer_payment')
    })
    expect(calls).not.toContain('payments:eq:is_reversed:false')
  })

  it('search is immediate and filters by customer name', async () => {
    const user = userEvent.setup()
    const { from, calls } = createPaymentsFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPayments()

    await screen.findByText('John Doe')
    calls.length = 0

    await user.type(screen.getByPlaceholderText(/Customer name|Nom du client/i), 'John')

    await waitFor(() => {
      expect(calls.some((c) => c.startsWith('from:customers'))).toBe(true)
    })
    expect(calls.some((c) => c.includes('ilike:name:%John%'))).toBe(true)
  })
})
