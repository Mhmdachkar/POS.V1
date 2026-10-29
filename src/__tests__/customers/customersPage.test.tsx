/**
 * Phase 13E-B — CustomersPage + CustomerDetailDrawer UI foundations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  CustomersPage,
  CUSTOMERS_SEARCH_DEBOUNCE_MS,
} from '@/pages/customers/CustomersPage'
import { MemoryRouter } from 'react-router-dom'
import { CustomerDetailDrawer } from '@/pages/customers/components/CustomerDetailDrawer'
import { useAuthStore } from '@/stores/authStore'
import { useCustomer } from '@/hooks/useCustomers'
import {
  CUSTOMER_ACTIVITY_DRAWER_LIMIT,
  useCustomerActivity,
  useCustomerActivitySummary,
  useCustomerLedgerBalances,
  type CustomerActivityEvent,
  type CustomerActivitySummary,
} from '@/hooks/useCustomerActivity'
import { formatCFA, formatDate } from '@/lib/formatters'
import type { Customer, Staff } from '@/types/database'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { bilingualAriaLabel, getByBilingualRole } from '../helpers/bilingualQueries'

vi.mock('@/hooks/useCustomers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCustomers')>()
  return {
    ...actual,
    useCustomer: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
    useDeactivateCustomer: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useReactivateCustomer: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }
})

vi.mock('@/hooks/useCustomerActivity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCustomerActivity')>()
  return {
    ...actual,
    useCustomerActivity: vi.fn(() => ({
      data: { data: [], count: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })),
    useCustomerLedgerBalances: vi.fn(() => ({ data: {}, isLoading: false })),
    useCustomerLedgerBalance: vi.fn(() => ({ data: undefined, isLoading: false })),
    useCustomerActivitySummary: vi.fn(() => ({
      data: {
        sales: { count: 0, totalCfa: 0 },
        returns: { count: 0, totalCfa: 0 },
        payments: { count: 0, totalCfa: 0 },
      },
      isLoading: false,
      isError: false,
    })),
  }
})

vi.mock('@/hooks/useSales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSales')>()
  return {
    ...actual,
    useSaleDetail: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
  }
})

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useOpenShifts: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

type CustomerRow = Customer & Record<string, unknown>

function makeCustomer(i: number, overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: `cust-${i}`,
    name: i === 0 ? 'John Doe' : `Customer ${i}`,
    phone: `7700000${String(i).padStart(2, '0')}`,
    address: null,
    balance_owed_cfa: i === 1 ? 4500 : 0,
    is_active: i !== 2,
    deactivated_at: i === 2 ? '2026-09-01T00:00:00Z' : null,
    created_by: 'admin-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function buildCatalog(): CustomerRow[] {
  return Array.from({ length: 40 }, (_, i) => makeCustomer(i))
}

function createFilterAwareFrom(allRows: CustomerRow[]) {
  const calls: string[] = []
  let filtered = [...allRows]
  let range: [number, number] | null = null
  const builder: Record<string, unknown> = {}

  builder.select = (...args: unknown[]) => {
    calls.push(`select:${JSON.stringify(args[1] ?? {})}`)
    filtered = [...allRows]
    range = null
    return builder
  }
  builder.order = (col: unknown) => {
    calls.push(`order:${String(col)}`)
    return builder
  }
  builder.eq = (col: unknown, val: unknown) => {
    calls.push(`eq:${String(col)}:${String(val)}`)
    filtered = filtered.filter((r) => r[String(col)] === val)
    return builder
  }
  builder.gt = (col: unknown, val: unknown) => {
    calls.push(`gt:${String(col)}:${String(val)}`)
    filtered = filtered.filter((r) => Number(r[String(col)]) > Number(val))
    return builder
  }
  builder.or = (expr: unknown) => {
    calls.push(`or:${String(expr)}`)
    const raw = String(expr)
    const match = raw.match(/%([^%]+)%/)
    const needle = (match?.[1] ?? '').toLowerCase()
    if (needle) {
      filtered = filtered.filter((r) =>
        String(r.name).toLowerCase().includes(needle)
        || String(r.phone ?? '').toLowerCase().includes(needle),
      )
    }
    return builder
  }
  builder.range = (from: unknown, to: unknown) => {
    calls.push(`range:${from}-${to}`)
    range = [Number(from), Number(to)]
    return builder
  }
  const execute = () => {
    const count = filtered.length
    const page = range ? filtered.slice(range[0], range[1] + 1) : filtered
    return Promise.resolve({ data: page, error: null, count })
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    execute().then(resolve, reject)

  return { builder, calls }
}

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

function cashierStaff(): Staff {
  return {
    id: 'cashier-1',
    username: 'cashier',
    full_name: 'Cashier Dakar',
    role: 'cashier',
    depot_id: 'depot-a',
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function renderCustomers() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CustomersPage />
    </QueryClientProvider>,
  )
}

describe('CustomersPage', () => {
  const catalog = buildCatalog()

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset()
    vi.mocked(useCustomerLedgerBalances).mockReturnValue({ data: {}, isLoading: false } as never)
    useAuthStore.setState({
      staff: adminStaff(),
      authLoadState: 'authorized',
      session: null,
      isLoading: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders Customers heading, search, filters, and New Customer', async () => {
    const { builder } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderCustomers()

    expect(await screen.findByRole('heading', { name: /Customers|Clients/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Name or phone|Nom ou téléphone/i)).toBeInTheDocument()
    expect(getByBilingualRole('button', CUSTOMERS.filterAll)).toBeInTheDocument()
    expect(getByBilingualRole('button', CUSTOMERS.filterActive)).toBeInTheDocument()
    expect(getByBilingualRole('button', CUSTOMERS.filterWithBalance)).toBeInTheDocument()
    expect(getByBilingualRole('button', CUSTOMERS.filterInactive)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New Customer|Nouveau client/i })).toBeInTheDocument()
    expect(await screen.findByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
  })

  it('hides Inactive filter for cashier', async () => {
    useAuthStore.setState({
      staff: cashierStaff(),
      authLoadState: 'authorized',
      session: null,
      isLoading: false,
    })
    const { builder } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderCustomers()
    await screen.findByText('John Doe')
    expect(screen.queryByRole('button', { name: bilingualAriaLabel(CUSTOMERS.filterInactive) })).not.toBeInTheDocument()
  })

  it('uses MoneyDisplay small + danger for owed balances', async () => {
    const { builder } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderCustomers()
    await screen.findByText('Customer 1')

    const owed = formatCFA(4500)
    const node = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === owed,
    ).find((el) => el.className.includes('financial-value'))
    expect(node).toBeTruthy()
    expect(node).toHaveClass('text-sm', 'financial-value', 'text-danger-foreground')
  })

  it('shows Avoir for a negative ledger solde instead of an em dash', async () => {
    vi.mocked(useCustomerLedgerBalances).mockReturnValue({
      data: { 'cust-0': -100 },
      isLoading: false,
    } as never)
    const { builder } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderCustomers()
    await screen.findByText('John Doe')
    expect(screen.getByText(`${CUSTOMERS.avoirPrefix.fr} ${formatCFA(100)}`)).toBeInTheDocument()
  })

  it('shows a loading placeholder for Solde dû while ledger balances load', async () => {
    vi.mocked(useCustomerLedgerBalances).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never)
    const { builder } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderCustomers()
    await screen.findByText('John Doe')
    expect(screen.getAllByText('…').length).toBeGreaterThan(0)
    expect(screen.queryByText(`${CUSTOMERS.avoirPrefix.fr} ${formatCFA(100)}`)).not.toBeInTheDocument()
  })

  it('does not query on each keystroke; one or-filter after 300 ms idle', async () => {
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderCustomers()
    expect(await screen.findByText('John Doe')).toBeInTheDocument()
    const orBefore = calls.filter((c) => c.startsWith('or:')).length

    vi.useFakeTimers()
    const input = screen.getByPlaceholderText(/Name or phone|Nom ou téléphone/i)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'J' } })
      fireEvent.change(input, { target: { value: 'Jo' } })
      fireEvent.change(input, { target: { value: 'John' } })
    })
    expect(calls.filter((c) => c.startsWith('or:')).length).toBe(orBefore)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CUSTOMERS_SEARCH_DEBOUNCE_MS)
    })
    vi.useRealTimers()
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith('or:') && c.includes('John'))).toBe(true)
    })
  })

  it('status filter changes the query and resets page', async () => {
    const user = userEvent.setup()
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderCustomers()
    await screen.findByText('John Doe')

    const next = await screen.findByRole('button', { name: /Next →|Suivant →/i })
    await user.click(next)
    await waitFor(() => {
      expect(calls.some((c) => c === 'range:30-59')).toBe(true)
    })

    await user.click(getByBilingualRole('button', CUSTOMERS.filterActive))
    await waitFor(() => {
      expect(calls).toContain('eq:is_active:true')
      expect(calls.filter((c) => c === 'range:0-29').length).toBeGreaterThan(0)
    })
  })

  it('With Balance filter applies balance_owed_cfa gt 0', async () => {
    const user = userEvent.setup()
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderCustomers()
    await screen.findByText('John Doe')
    await user.click(getByBilingualRole('button', CUSTOMERS.filterWithBalance))
    await waitFor(() => {
      expect(calls).toContain('gt:balance_owed_cfa:0')
    })
  })
})

describe('CustomerDetailDrawer (15E)', () => {
  const emptySummary: CustomerActivitySummary = {
    sales: { count: 0, totalCfa: 0 },
    returns: { count: 0, totalCfa: 0 },
    payments: { count: 0, totalCfa: 0 },
  }

  beforeEach(() => {
    vi.mocked(useCustomer).mockReset()
    vi.mocked(useCustomerActivity).mockReturnValue({
      data: { data: [], count: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never)
    vi.mocked(useCustomerActivitySummary).mockReturnValue({
      data: emptySummary,
      isLoading: false,
      isError: false,
    } as never)
    useAuthStore.setState({
      staff: adminStaff(),
      authLoadState: 'authorized',
      session: null,
      isLoading: false,
    })
  })

  function saleEvent(overrides: Partial<CustomerActivityEvent> = {}): CustomerActivityEvent {
    return {
      id: 'sale-1',
      type: 'sale',
      occurredAt: '2026-09-16T10:00:00Z',
      reference: 'DKR-00000020',
      description: 'Credit added',
      amountCfa: 350,
      saleId: 'sale-1',
      ...overrides,
    }
  }

  function returnEvent(overrides: Partial<CustomerActivityEvent> = {}): CustomerActivityEvent {
    return {
      id: 'ret-1',
      type: 'return',
      occurredAt: '2026-09-15T10:00:00Z',
      reference: 'DKR-00000020',
      description: '2 × Cola Can 33cl returned',
      amountCfa: -600,
      saleId: 'sale-1',
      ...overrides,
    }
  }

  function paymentEvent(overrides: Partial<CustomerActivityEvent> = {}): CustomerActivityEvent {
    return {
      id: 'pay-1',
      type: 'payment',
      occurredAt: '2026-09-14T10:00:00Z',
      reference: 'Customer payment',
      description: 'Balance payment',
      amountCfa: -500,
      saleId: null,
      isReversed: false,
      ...overrides,
    }
  }

  function renderDrawer(
    customer: Customer,
    extras: {
      events?: CustomerActivityEvent[]
      count?: number
      summary?: CustomerActivitySummary
      accountBalanceCfa?: number
    } = {},
  ) {
    vi.mocked(useCustomer).mockReturnValue({
      data: customer,
      isLoading: false,
      isError: false,
    } as never)
    vi.mocked(useCustomerActivity).mockReturnValue({
      data: {
        data: extras.events ?? [],
        count: extras.count ?? extras.events?.length ?? 0,
        accountBalanceCfa: extras.accountBalanceCfa,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never)
    vi.mocked(useCustomerActivitySummary).mockReturnValue({
      data: extras.summary ?? emptySummary,
      isLoading: false,
      isError: false,
    } as never)

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <CustomerDetailDrawer customerId={customer.id} onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
  }

  it('shows current balance from customer.balance_owed_cfa with simplified copy', () => {
    renderDrawer(makeCustomer(1, {
      name: 'Owed Customer',
      balance_owed_cfa: 4500,
      is_active: true,
    }))

    expect(screen.getByText('Owed Customer')).toBeInTheDocument()
    expect(screen.getByText(CUSTOMERS.activeCustomer.fr)).toBeInTheDocument()
    expect(screen.getAllByText(CUSTOMERS.outstandingBalance.fr)[0]).toBeInTheDocument()
    expect(screen.getByText(CUSTOMERS.balanceHelp.fr, { exact: false })).toBeInTheDocument()
    expect(screen.getByText(CUSTOMERS.balanceHelp.fr, { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/Pooled balance/)).not.toBeInTheDocument()

    const owed = formatCFA(4500)
    const node = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === owed,
    ).find((el) => el.className.includes('text-financial-sm'))
    expect(node).toBeTruthy()
    expect(node).toHaveClass('text-financial-sm', 'financial-value', 'text-danger-foreground')

    const record = screen.getByRole('button', { name: CUSTOMERS.recordPayment.fr })
    expect(record).toBeDisabled()
    expect(record).not.toHaveTextContent(/CFA/)
    expect(screen.getByText(SHIFT_COPY.openShiftRequired.fr)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: CUSTOMERS.editCustomerBtn.fr })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: CUSTOMERS.deactivateCustomer.fr })).toBeInTheDocument()
  })

  it('renders financial summary counts and totals from the summary query', () => {
    renderDrawer(
      makeCustomer(1, { name: 'Owed Customer', balance_owed_cfa: 4500 }),
      {
        summary: {
          sales: { count: 100, totalCfa: 48500 },
          returns: { count: 7, totalCfa: 3200 },
          payments: { count: 12, totalCfa: 15000 },
        },
      },
    )

    expect(screen.getByText(CUSTOMERS.financialSummary.fr)).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getAllByText(CUSTOMERS.balanceOwed.fr)[0]).toBeInTheDocument()
    const money = (amount: number) => screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === formatCFA(amount),
    )
    expect(money(48500).length).toBeGreaterThan(0)
    expect(money(3200).length).toBeGreaterThan(0)
    expect(money(15000).length).toBeGreaterThan(0)
    expect(money(4500).length).toBeGreaterThan(0)
  })

  it('replaces Recent Sales and Payment History with Account Activity', () => {
    renderDrawer(makeCustomer(0, { name: 'John Doe', balance_owed_cfa: 0 }))
    expect(screen.getByText(CUSTOMERS.accountActivity.fr)).toBeInTheDocument()
    expect(screen.queryByText('Recent Sales')).not.toBeInTheDocument()
    expect(screen.queryByText('Payment History')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /All|Tous/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Sales|Ventes/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Returns|Retours/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Payments|Paiements/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: CUSTOMERS.viewAllActivity.fr })).toHaveAttribute(
      'href',
      '/customers/cust-0/activity',
    )
  })

  it('shows Reactivate for inactive customers and keeps Record Payment secondary when balance is 0', () => {
    renderDrawer(makeCustomer(2, {
      name: 'Inactive Customer',
      balance_owed_cfa: 0,
      is_active: false,
      deactivated_at: '2026-09-01T00:00:00Z',
    }))
    expect(screen.getByText('Inactive Customer')).toBeInTheDocument()
    expect(screen.getByText(CUSTOMERS.inactiveCustomer.fr)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: CUSTOMERS.reactivateCustomer.fr })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: CUSTOMERS.recordPayment.fr })).toBeDisabled()
  })

  it('shows Avoir client pill when ledger solde is negative', () => {
    renderDrawer(makeCustomer(0, { name: 'John Doe', balance_owed_cfa: 0 }), {
      accountBalanceCfa: -100,
    })
    expect(screen.getAllByText(CUSTOMERS.accountCreditNote.fr).length).toBeGreaterThan(0)
    expect(screen.queryByText(CUSTOMERS.accountSettled.fr)).not.toBeInTheDocument()
    expect(screen.getByText(`${formatCFA(100)} ${CUSTOMERS.enVotreFaveur.fr}`)).toBeInTheDocument()
  })

  it('shows a loading placeholder for solde while activity ledger is loading', () => {
    vi.mocked(useCustomer).mockReturnValue({
      data: makeCustomer(0, { name: 'John Doe', balance_owed_cfa: 0 }),
      isLoading: false,
      isError: false,
    } as never)
    vi.mocked(useCustomerActivity).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never)
    vi.mocked(useCustomerActivitySummary).mockReturnValue({
      data: {
        sales: { count: 0, totalCfa: 0 },
        returns: { count: 0, totalCfa: 0 },
        payments: { count: 0, totalCfa: 0 },
      },
      isLoading: false,
      isError: false,
    } as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <CustomerDetailDrawer customerId="cust-0" onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(screen.getAllByText('…').length).toBeGreaterThan(0)
    expect(screen.queryByText(CUSTOMERS.accountSettled.fr)).not.toBeInTheDocument()
  })

  it('formats a negative activity running solde as en votre faveur', () => {
    renderDrawer(
      makeCustomer(0, { name: 'John Doe', balance_owed_cfa: 0 }),
      { events: [paymentEvent({ runningBalanceCfa: -100, amountCfa: -100 })] },
    )
    expect(screen.getByText(`${formatCFA(100)} ${CUSTOMERS.enVotreFaveur.fr}`)).toBeInTheDocument()
  })

  it('renders zero balance without danger and empty activity', () => {
    const customer = makeCustomer(0, {
      name: 'John Doe',
      phone: '770000000',
      address: 'Dakar',
      balance_owed_cfa: 0,
      is_active: true,
    })
    renderDrawer(customer)

    expect(screen.getAllByText(CUSTOMERS.accountSettled.fr)[0]).toBeInTheDocument()
    const zero = formatCFA(0)
    const node = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === zero,
    ).find((el) => el.className.includes('text-financial-sm'))
    expect(node).toBeTruthy()
    expect(node).toHaveClass('text-financial-sm', 'financial-value')
    expect(node?.className).not.toMatch(/text-danger/)

    expect(screen.getByText('770000000')).toBeInTheDocument()
    expect(screen.getByText('Dakar')).toBeInTheDocument()
    expect(screen.getByText(formatDate(customer.created_at))).toBeInTheDocument()
    expect(screen.queryByText('Name')).not.toBeInTheDocument()
    expect(screen.getByText(CUSTOMERS.activityEmptyAll.fr)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: CUSTOMERS.recordPayment.fr })).toBeDisabled()
    expect(screen.getByRole('button', { name: CUSTOMERS.editCustomerBtn.fr })).toBeInTheDocument()
  })

  it('renders a recent sale with receipt, date, signed amount, and credit copy', () => {
    renderDrawer(
      makeCustomer(1, { name: 'Owed Customer', balance_owed_cfa: 4500, is_active: true }),
      { events: [saleEvent({ reference: 'DKR-00000014', amountCfa: 700 })] },
    )

    expect(screen.getByText('DKR-00000014')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Vente DKR-00000014/ })).toBeInTheDocument()
    expect(screen.getByText('Credit added')).toBeInTheDocument()
    const totalLabel = formatCFA(700)
    const totalNode = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === totalLabel,
    ).find((el) => el.className.includes('financial-value') && el.className.includes('text-sm'))
    expect(totalNode).toBeTruthy()
    expect(totalNode?.parentElement?.textContent).toMatch(/^\+/)
  })

  it('renders return activity with original receipt and returned-item summary', () => {
    renderDrawer(
      makeCustomer(1, { name: 'Owed Customer', balance_owed_cfa: 4500 }),
      { events: [returnEvent()] },
    )

    expect(screen.getByText(CUSTOMERS.activityTypeReturn.fr)).toBeInTheDocument()
    expect(screen.getByText('DKR-00000020')).toBeInTheDocument()
    expect(screen.getByText('2 × Cola Can 33cl returned')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retour DKR-00000020/ })).toBeInTheDocument()
    expect(screen.queryByText(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i)).not.toBeInTheDocument()
    const refund = formatCFA(600)
    const node = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === refund,
    ).find((el) => el.className.includes('financial-value'))
    expect(node?.parentElement?.textContent).toMatch(/^−/)
  })

  it('renders a standalone payment without attaching it to a receipt', () => {
    renderDrawer(
      makeCustomer(1, { name: 'Owed Customer', balance_owed_cfa: 4500 }),
      {
        events: [paymentEvent({
          description: 'Partial repayment',
          amountCfa: -1000,
        })],
      },
    )

    expect(screen.getByText('Customer payment')).toBeInTheDocument()
    expect(screen.getByText('Partial repayment')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Customer payment/ })).not.toBeInTheDocument()
    const paid = formatCFA(1000)
    const node = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === paid,
    ).find((el) => el.className.includes('financial-value'))
    expect(node).toBeTruthy()
    expect(node?.parentElement?.textContent).toMatch(/^−/)
    expect(screen.queryByText('Payment Method')).not.toBeInTheDocument()
    expect(screen.queryByText(/applied to/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/DKR-/)).not.toBeInTheDocument()
  })

  it('keeps reversed payment strike-through and Reversed badge', () => {
    renderDrawer(
      makeCustomer(1, { name: 'Owed Customer', balance_owed_cfa: 4500 }),
      {
        events: [paymentEvent({
          id: 'pay-rev',
          amountCfa: -500,
          isReversed: true,
        })],
      },
    )

    expect(screen.getByText('Customer payment')).toBeInTheDocument()
    expect(screen.getByText(CUSTOMERS.activityReversed.fr)).toBeInTheDocument()
    const paid = formatCFA(500)
    const node = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === paid,
    ).find((el) => el.className.includes('financial-value'))
    expect(node).toHaveClass('line-through')
  })

  it('shows mixed sales, returns, and payments without pairing payments to receipts', () => {
    renderDrawer(
      makeCustomer(1, { name: 'Owed Customer', balance_owed_cfa: 550 }),
      {
        events: [
          saleEvent({ id: 'sale-a', saleId: 'sale-a', reference: 'DKR-00000017', amountCfa: 1050 }),
          saleEvent({ id: 'sale-b', saleId: 'sale-b', reference: 'DKR-00000018', amountCfa: 700 }),
          paymentEvent({ description: 'Standalone repayment' }),
        ],
      },
    )

    expect(screen.getByText('DKR-00000017')).toBeInTheDocument()
    expect(screen.getByText('DKR-00000018')).toBeInTheDocument()
    expect(screen.getAllByText(/Credit added/).length).toBe(2)
    expect(screen.getByText('Customer payment')).toBeInTheDocument()
    expect(screen.getByText('Standalone repayment')).toBeInTheDocument()
    expect(screen.queryByText(/applied to/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/DKR-00000017.*500|500.*DKR-00000017/)).not.toBeInTheDocument()
  })

  it('does not render all events when the customer has 100+ activities', () => {
    const events = Array.from({ length: 5 }, (_, i) => saleEvent({
      id: `sale-${i}`,
      saleId: `sale-${i}`,
      reference: `DKR-000000${10 + i}`,
      occurredAt: `2026-09-16T${String(10 + i).padStart(2, '0')}:00:00Z`,
    }))
    renderDrawer(
      makeCustomer(1, { name: 'Busy Customer', balance_owed_cfa: 9000 }),
      { events, count: 119 },
    )

    expect(screen.getAllByText(/^Vente$/).length).toBe(5)
    expect(screen.queryByText('DKR-00000020')).not.toBeInTheDocument()
    expect(useCustomerActivity).toHaveBeenCalledWith(
      'cust-1',
      expect.objectContaining({
        page: 0,
        pageSize: CUSTOMER_ACTIVITY_DRAWER_LIMIT,
      }),
    )
  })

  it('requests Sales, Returns, and Payments filters from the activity hook', async () => {
    const user = userEvent.setup()
    renderDrawer(makeCustomer(1, { name: 'Owed Customer', balance_owed_cfa: 4500 }))

    await user.click(screen.getByRole('tab', { name: /Sales|Ventes/i }))
    expect(useCustomerActivity).toHaveBeenCalledWith('cust-1', expect.objectContaining({ type: 'sale' }))

    await user.click(screen.getByRole('tab', { name: /Returns|Retours/i }))
    expect(useCustomerActivity).toHaveBeenCalledWith('cust-1', expect.objectContaining({ type: 'return' }))

    await user.click(screen.getByRole('tab', { name: /Payments|Paiements/i }))
    expect(useCustomerActivity).toHaveBeenCalledWith('cust-1', expect.objectContaining({ type: 'payment' }))

    await user.click(screen.getByRole('tab', { name: /All|Tous/i }))
    expect(useCustomerActivity).toHaveBeenCalledWith('cust-1', expect.objectContaining({ type: 'all' }))
  })

  it('shows filter-specific empty copy', async () => {
    const user = userEvent.setup()
    renderDrawer(makeCustomer(1, { name: 'Owed Customer', balance_owed_cfa: 4500 }))
    expect(screen.getByText(CUSTOMERS.activityEmptyAll.fr)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Sales|Ventes/i }))
    expect(screen.getByText(CUSTOMERS.activityEmptySales.fr)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Returns|Retours/i }))
    expect(screen.getByText(CUSTOMERS.activityEmptyReturns.fr)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Payments|Paiements/i }))
    expect(screen.getByText(CUSTOMERS.activityEmptyPayments.fr)).toBeInTheDocument()
  })

  it('does not overwrite the displayed balance from visible activity amounts', () => {
    renderDrawer(
      makeCustomer(1, { name: 'Owed Customer', balance_owed_cfa: 4500 }),
      {
        events: [
          saleEvent({ amountCfa: 99999 }),
          paymentEvent({ amountCfa: -1 }),
        ],
      },
    )

    const owed = formatCFA(4500)
    const node = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === owed,
    ).find((el) => el.className.includes('text-financial-sm'))
    expect(node).toBeTruthy()
    expect(screen.queryByText(formatCFA(99998))).not.toBeInTheDocument()
  })
})
