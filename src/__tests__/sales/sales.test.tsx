/**
 * Phase 8 — Sales list + useSalesList tests.
 *
 * Behavioral coverage:
 *   - filter-before-pagination (status, depot, receipt ilike)
 *   - All Depots omits depot eq
 *   - cashier effective depot
 *   - 300 ms receipt debounce (no query per keystroke)
 *   - page reset on search
 *   - Depot column only in admin All Depots
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchSalesList, saleKeys, type SalesListFilters } from '@/hooks/useSales'
import { SalesPage, SALES_SEARCH_DEBOUNCE_MS } from '@/pages/sales/SalesPage'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { usePOSStore } from '@/stores/posStore'
import type { Staff } from '@/types/database'
import { SALES } from '@/lib/bilingual/sales'
import { COMMON } from '@/lib/bilingual/common'
import { SALE_STATUS } from '@/lib/bilingual/status'

vi.mock('@/hooks/useSales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSales')>()
  return {
    ...actual,
    useSaleDetail: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
  }
})

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useDepotOptions: vi.fn(() => ({
      data: [
        { id: 'depot-a', name: 'Depot Dakar', code: 'DKR' },
        { id: 'depot-b', name: 'Depot Abidjan', code: 'ABJ' },
      ],
      isLoading: false,
    })),
  }
})

type SaleRow = {
  id: string
  receipt_number: string
  status: string
  depot_id: string
  total_cfa: number
  created_at: string
  customers: { name: string } | null
  staff: { full_name: string } | null
  [key: string]: unknown
}

function makeSale(i: number, overrides: Partial<SaleRow> = {}): SaleRow {
  return {
    id: `sale-${i}`,
    receipt_number: `DKR-${String(i).padStart(8, '0')}`,
    status: i % 5 === 0 ? 'voided' : 'completed',
    depot_id: i < 20 ? 'depot-a' : 'depot-b',
    total_cfa: 1000 + i,
    created_at: `2026-09-12T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`,
    customers: { name: `Customer ${i}` },
    staff: { full_name: 'Cashier Dakar' },
    cashier_id: 'cashier-1',
    customer_id: `cust-${i}`,
    shift_id: null,
    display_currency: 'CFA',
    cfa_to_usd_rate_used: 600,
    subtotal_cfa: 1000 + i,
    discount_type: null,
    discount_value: null,
    discount_amount_cfa: 0,
    amount_tendered_cfa: 1000 + i,
    amount_applied_cfa: 1000 + i,
    change_given_cfa: 0,
    balance_added_cfa: 0,
    ...overrides,
  }
}

function buildCatalog(): SaleRow[] {
  return Array.from({ length: 40 }, (_, i) => makeSale(i))
}

function createFilterAwareFrom(allRows: SaleRow[]) {
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
  builder.ilike = (col: unknown, val: unknown) => {
    calls.push(`ilike:${String(col)}:${String(val)}`)
    const needle = String(val).replace(/%/g, '').toLowerCase()
    filtered = filtered.filter((r) =>
      String(r[String(col)]).toLowerCase().includes(needle),
    )
    return builder
  }
  builder.range = (from: unknown, to: unknown) => {
    calls.push(`range:${from}-${to}`)
    range = [Number(from), Number(to)]
    return builder
  }
  builder.gte = (col: unknown, val: unknown) => {
    calls.push(`gte:${String(col)}:${String(val)}`)
    return builder
  }
  builder.lte = (col: unknown, val: unknown) => {
    calls.push(`lte:${String(col)}:${String(val)}`)
    return builder
  }
  builder.is = (col: unknown, val: unknown) => {
    calls.push(`is:${String(col)}:${String(val)}`)
    return builder
  }
  builder.not = (col: unknown, op: unknown, val: unknown) => {
    calls.push(`not:${String(col)}:${String(op)}:${String(val)}`)
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

function renderSales() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <SalesPage />
    </QueryClientProvider>,
  )
}

describe('fetchSalesList', () => {
  const catalog = buildCatalog()

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset()
  })

  it('omits depot eq when depotId is null (All Depots)', async () => {
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const filters: SalesListFilters = {
      depotId: null,
      page: 0,
      pageSize: 30,
    }
    const result = await fetchSalesList(filters)
    expect(calls.some((c) => c.startsWith('eq:depot_id'))).toBe(false)
    expect(result.count).toBe(40)
    expect(calls.some((c) => c.startsWith('range:'))).toBe(true)
  })

  it('applies depot eq before range', async () => {
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const result = await fetchSalesList({
      depotId: 'depot-b',
      page: 0,
      pageSize: 30,
    })
    expect(calls).toContain('eq:depot_id:depot-b')
    const eqIdx = calls.findIndex((c) => c === 'eq:depot_id:depot-b')
    const rangeIdx = calls.findIndex((c) => c.startsWith('range:'))
    expect(eqIdx).toBeGreaterThanOrEqual(0)
    expect(rangeIdx).toBeGreaterThan(eqIdx)
    expect(result.count).toBe(20)
  })

  it('applies status filter and receipt ilike before range', async () => {
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    await fetchSalesList({
      depotId: null,
      status: 'voided',
      search: 'DKR-00000000',
      page: 0,
      pageSize: 30,
    })
    expect(calls).toContain('eq:status:voided')
    expect(calls).toContain('ilike:receipt_number:%DKR-00000000%')
    const rangeIdx = calls.findIndex((c) => c.startsWith('range:'))
    expect(calls.findIndex((c) => c.startsWith('ilike:'))).toBeLessThan(rangeIdx)
  })

  it('requests exact count and created_at descending', async () => {
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    await fetchSalesList({ page: 0, pageSize: 30 })
    expect(calls.some((c) => c.includes('"count":"exact"'))).toBe(true)
    expect(calls).toContain('order:created_at')
  })

  it('paginates after filters (page 1 of 30)', async () => {
    const { builder } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const result = await fetchSalesList({ page: 1, pageSize: 30, depotId: null })
    expect(result.data).toHaveLength(10)
    expect(result.count).toBe(40)
  })
})

describe('saleKeys', () => {
  it('nests list filters and detail ids', () => {
    expect(saleKeys.lists()).toEqual(['sales', 'list'])
    expect(saleKeys.list({ page: 0 })).toEqual(['sales', 'list', { page: 0 }])
    expect(saleKeys.detail('abc')).toEqual(['sales', 'detail', 'abc'])
  })
})

describe('SalesPage', () => {
  const catalog = buildCatalog()

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset()
    useAuthStore.setState({
      staff: adminStaff(),
      authLoadState: 'authorized',
      session: null,
      isLoading: false,
    })
    useDepotStore.setState({
      currentDepotId: null,
      currentDepotName: 'All Depots',
      availableDepots: [],
    })
    usePOSStore.setState({ shiftId: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders sales rows when data exists', async () => {
    const { builder } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderSales()
    expect(await screen.findByText('DKR-00000000')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: SALES.historyTitle.fr })).toBeInTheDocument()
  })

  it('renders empty state when no sales match', async () => {
    const { builder } = createFilterAwareFrom([])
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderSales()
    expect(await screen.findByText(SALES.noSales.fr)).toBeInTheDocument()
  })

  it('shows Depot column in admin All Depots and hides it when a depot is selected', async () => {
    const { builder } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    const { rerender } = renderSales()
    expect(await screen.findByText('DKR-00000000')).toBeInTheDocument()
    expect(screen.getByText(COMMON.depot.fr)).toBeInTheDocument()
    expect(screen.getAllByText('Depot Dakar').length).toBeGreaterThan(0)

    useDepotStore.setState({ currentDepotId: 'depot-a', currentDepotName: 'Depot Dakar' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    rerender(
      <QueryClientProvider client={client}>
        <SalesPage />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('DKR-00000000')).toBeInTheDocument()
    expect(screen.queryByText(COMMON.depot.fr)).not.toBeInTheDocument()
  })

  it('cashier uses staff.depot_id even if depot store is a different depot', async () => {
    useAuthStore.setState({
      staff: cashierStaff(),
      authLoadState: 'authorized',
      session: null,
      isLoading: false,
    })
    useDepotStore.setState({
      currentDepotId: 'depot-b',
      currentDepotName: 'Depot Abidjan',
      availableDepots: [],
    })
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderSales()
    await screen.findByText('DKR-00000000')
    expect(calls).toContain('eq:depot_id:depot-a')
    expect(calls).not.toContain('eq:depot_id:depot-b')
    expect(screen.queryByText(COMMON.depot.fr)).not.toBeInTheDocument()
  })

  it('does not query on each keystroke; one ilike after 300 ms idle', async () => {
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    renderSales()
    expect(await screen.findByText('DKR-00000000')).toBeInTheDocument()
    const ilikeBefore = calls.filter((c) => c.startsWith('ilike:')).length

    vi.useFakeTimers()
    const input = screen.getByPlaceholderText(SALES.searchReceiptPlaceholder.fr)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'D' } })
      fireEvent.change(input, { target: { value: 'DK' } })
      fireEvent.change(input, { target: { value: 'DKR' } })
    })

    expect(calls.filter((c) => c.startsWith('ilike:')).length).toBe(ilikeBefore)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SALES_SEARCH_DEBOUNCE_MS - 1)
    })
    expect(calls.filter((c) => c.startsWith('ilike:')).length).toBe(ilikeBefore)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    vi.useRealTimers()
    await waitFor(() => {
      expect(calls).toContain('ilike:receipt_number:%DKR%')
    })
    expect(calls.filter((c) => c.startsWith('ilike:')).length).toBe(ilikeBefore + 1)
  })

  it('resets page to 0 when search changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderSales()
    expect(await screen.findByRole('heading', { name: SALES.historyTitle.fr })).toBeInTheDocument()

    const next = await screen.findByRole('button', { name: COMMON.next.fr })
    await user.click(next)
    await waitFor(() => {
      expect(calls.some((c) => c === 'range:30-59')).toBe(true)
    })

    await user.type(screen.getByPlaceholderText(SALES.searchReceiptPlaceholder.fr), 'X')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SALES_SEARCH_DEBOUNCE_MS)
    })
    await waitFor(() => {
      expect(calls.some((c) => c === 'range:0-29')).toBe(true)
    })
  })

  it('status filter changes the query and resets page', async () => {
    const user = userEvent.setup()
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderSales()
    await screen.findByText('DKR-00000000')
    await user.click(screen.getByRole('button', { name: SALE_STATUS.voided.fr }))
    await waitFor(() => {
      expect(calls).toContain('eq:status:voided')
      expect(calls.filter((c) => c === 'range:0-29').length).toBeGreaterThan(0)
    })
  })

  it('defaults to today and applies created_at date bounds', async () => {
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderSales()
    await screen.findByText('DKR-00000000')
    expect(screen.getByRole('button', { name: COMMON.today.fr })).toHaveAttribute('aria-pressed', 'true')
    expect(calls.some((c) => c.startsWith('gte:created_at:'))).toBe(true)
    expect(calls.some((c) => c.startsWith('lte:created_at:'))).toBe(true)
  })

  it('switches to yesterday date bounds', async () => {
    const user = userEvent.setup()
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderSales()
    await screen.findByText('DKR-00000000')
    calls.length = 0
    await user.click(screen.getByRole('button', { name: COMMON.yesterday.fr }))
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith('gte:created_at:'))).toBe(true)
      expect(calls.some((c) => c.startsWith('lte:created_at:'))).toBe(true)
    })
  })

  it('row click opens the sale drawer (sets sale id)', async () => {
    const user = userEvent.setup()
    const { builder } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    renderSales()
    const row = await screen.findByRole('button', { name: /DKR-00000000/ })
    await user.click(row)
    expect(row.className).toMatch(/bg-primary-subtle/)
  })
})
