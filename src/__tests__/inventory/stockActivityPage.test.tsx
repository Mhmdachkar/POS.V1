/**
 * Phase 14B-1 — Stock Activity page, query filters, and routes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { StockActivityPage, STOCK_ACTIVITY_DESCRIPTION, formatSignedPieces } from '@/pages/inventory/StockActivityPage'
import { AppRoutes } from '@/routes'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import {
  INVENTORY_SEARCH_DEBOUNCE_MS,
  STOCK_ACTIVITY_PAGE_SIZE,
  stockActivityCreatedAtBounds,
} from '@/hooks/useInventory'
import { formatPieces } from '@/lib/formatters'
import { INVENTORY, STOCK_TXN_TYPE } from '@/lib/bilingual/inventory'
import type { InventoryTransactionType } from '@/types/database'
import type { Staff } from '@/types/database'

vi.mock('@/pages/pos/POSPage', () => ({
  POSPage: () => <div>pos-page</div>,
}))

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useOpenShifts: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useOpenShifts: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

type LedgerRow = {
  id: string
  depot_id: string
  product_id: string
  quantity_pieces: number
  transaction_type: InventoryTransactionType
  reference_type: string
  reference_id: string
  created_by: string
  created_at: string
  metadata: Record<string, unknown> | null
  staff: { full_name?: string } | null
  products: { name?: string; is_active?: boolean } | null
  depots: { name?: string; code?: string } | null
  [key: string]: unknown
}

function makeRow(i: number, overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: `tx-${i}`,
    depot_id: 'depot-a',
    product_id: `prod-${i}`,
    quantity_pieces: i % 2 === 0 ? 5 : -2,
    transaction_type: i % 2 === 0 ? 'RESTOCK' : 'SALE',
    reference_type: i % 2 === 0 ? 'stock_entry' : 'sale',
    reference_id: `ref-${i}`,
    created_by: 'staff-1',
    created_at: `2026-09-16T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`,
    metadata: i % 2 === 0 ? { unit_name: 'Bottle', quantity_in_unit: 5 } : { sale_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    staff: { full_name: 'Awa Diop' },
    products: { name: i === 1 ? 'Mineral Water' : `Product ${i}`, is_active: true },
    depots: { name: 'Depot Dakar', code: 'DKR' },
    ...overrides,
  }
}

function createLedgerFrom(
  allRows: LedgerRow[],
  options: { pending?: boolean; error?: boolean } = {},
) {
  const calls: string[] = []
  let queryCalls: string[] = []

  function from(name: string) {
    calls.push(`from:${name}`)
    if (name === 'inventory_transactions') {
      queryCalls = []
    }

    // Per-from builder so Promise.all(name + serial) cannot clobber table state.
    let range: [number, number] | null = null
    let typeFilter: string | null = null
    let depotFilter: string | null = null
    let productIdIn: string[] | null = null
    let nameSearch: string | null = null

    const builder: Record<string, unknown> = {}
    const rec = (msg: string) => {
      if (name === 'inventory_transactions') queryCalls.push(msg)
    }

    builder.select = (...args: unknown[]) => {
      rec(`select:${String(args[0])}`)
      rec(`count:${JSON.stringify(args[1] ?? null)}`)
      if (name === 'inventory_transactions') {
        range = null
        typeFilter = null
        depotFilter = null
        productIdIn = null
      }
      if (name === 'products') nameSearch = null
      return builder
    }
    builder.order = (col: unknown, opts?: unknown) => {
      rec(`order:${String(col)}:${JSON.stringify(opts ?? null)}`)
      return builder
    }
    builder.eq = (col: unknown, val: unknown) => {
      rec(`eq:${String(col)}:${String(val)}`)
      if (name === 'inventory_transactions' && col === 'transaction_type') typeFilter = String(val)
      if (name === 'inventory_transactions' && col === 'depot_id') depotFilter = String(val)
      return builder
    }
    builder.gte = (col: unknown, val: unknown) => {
      rec(`gte:${String(col)}:${String(val)}`)
      return builder
    }
    builder.lt = (col: unknown, val: unknown) => {
      rec(`lt:${String(col)}:${String(val)}`)
      return builder
    }
    builder.ilike = (col: unknown, val: unknown) => {
      rec(`ilike:${String(col)}:${String(val)}`)
      if (name === 'products' && col === 'name') nameSearch = String(val)
      return builder
    }
    builder.in = (col: unknown, vals: unknown) => {
      rec(`in:${String(col)}:${JSON.stringify(vals)}`)
      if (name === 'inventory_transactions' && col === 'product_id') {
        productIdIn = (vals as string[]).map(String)
      }
      return builder
    }
    builder.limit = () => builder
    builder.range = (fromIdx: unknown, to: unknown) => {
      rec(`range:${fromIdx}-${to}`)
      range = [Number(fromIdx), Number(to)]
      return builder
    }

    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      if (name === 'depots') {
        return Promise.resolve({
          data: [{ id: 'depot-a', name: 'Depot Dakar', code: 'DKR', is_active: true }],
          error: null,
        }).then(resolve, reject)
      }
      if (name === 'categories') {
        return Promise.resolve({ data: [], error: null }).then(resolve, reject)
      }
      if (name === 'product_units') {
        // No serial fixtures in this ledger mock
        return Promise.resolve({ data: [], error: null }).then(resolve, reject)
      }
      if (name === 'products') {
        const term = (nameSearch ?? '').replace(/%/g, '').toLowerCase()
        const ids = allRows
          .filter((r) => (r.products?.name ?? '').toLowerCase().includes(term))
          .map((r) => r.product_id)
        return Promise.resolve({
          data: [...new Set(ids)].map((id) => ({ id })),
          error: null,
        }).then(resolve, reject)
      }
      if (options.pending) {
        return new Promise(() => {})
      }
      if (options.error) {
        return Promise.resolve({ data: null, error: { message: 'load failed' }, count: 0 }).then(
          resolve,
          reject,
        )
      }

      let filtered = [...allRows]
      if (typeFilter) {
        filtered = filtered.filter((r) => r.transaction_type === typeFilter)
      }
      if (depotFilter) {
        filtered = filtered.filter((r) => r.depot_id === depotFilter)
      }
      if (productIdIn) {
        filtered = filtered.filter((r) => productIdIn!.includes(r.product_id))
      }
      const count = filtered.length
      const page = range ? filtered.slice(range[0], range[1] + 1) : filtered
      return Promise.resolve({ data: page, error: null, count }).then(resolve, reject)
    }

    return builder
  }

  return { from, calls, queryCalls: () => queryCalls }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <StockActivityPage />
    </QueryClientProvider>,
  )
}

function depotStaff(): Staff {
  return {
    id: 'depot-1',
    username: 'depot',
    full_name: 'Depot Staff Dakar',
    role: 'depot_staff',
    depot_id: 'depot-a',
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
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

function authorize(staff: Staff) {
  useAuthStore.setState({
    staff,
    authLoadState: 'authorized',
    session: null,
    isLoading: false,
  })
}

function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <AppRoutes />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('StockActivityPage', () => {
  const catalog = Array.from({ length: 60 }, (_, i) => makeRow(i))

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset()
    useDepotStore.setState({
      currentDepotId: null,
      currentDepotName: 'All Depots',
      availableDepots: [],
    })
  })

  it('renders Stock Activity and does not render New Product', async () => {
    const { from } = createLedgerFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()

    expect(await screen.findByRole('heading', { name: /mouvements de stock|stock movements/i })).toBeInTheDocument()
    expect(screen.getAllByText(/Mouvements de stock|Stock movements for the current depot/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: INVENTORY.addProduct.fr })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Inventory' })).not.toBeInTheDocument()
  })

  it('SALE chip creates transaction_type eq filter', async () => {
    const user = userEvent.setup()
    const { from, queryCalls } = createLedgerFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()
    await screen.findByRole('heading', { name: /mouvements de stock|stock movements/i })

    await user.click(screen.getByRole('button', { name: STOCK_TXN_TYPE.SALE.fr }))

    await waitFor(() => {
      expect(queryCalls()).toContain('eq:transaction_type:SALE')
    })
    const rangeIdx = queryCalls().findIndex((c) => c.startsWith('range:'))
    const eqIdx = queryCalls().indexOf('eq:transaction_type:SALE')
    expect(eqIdx).toBeGreaterThan(-1)
    expect(rangeIdx).toBeGreaterThan(eqIdx)
  })

  it('search Water matches product name or serial after debounce', async () => {
    const user = userEvent.setup()
    const { from, queryCalls, calls } = createLedgerFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()
    await screen.findByPlaceholderText(/nom ou n° de série|name or serial/i)

    await user.type(screen.getByPlaceholderText(/nom ou n° de série|name or serial/i), 'Water')

    await waitFor(
      () => {
        expect(calls).toContain('from:products')
        expect(queryCalls().some((c) => c.startsWith('in:product_id:'))).toBe(true)
      },
      { timeout: INVENTORY_SEARCH_DEBOUNCE_MS + 750 },
    )
    const rangeIdx = queryCalls().findIndex((c) => c.startsWith('range:'))
    const inIdx = queryCalls().findIndex((c) => c.startsWith('in:product_id:'))
    expect(inIdx).toBeGreaterThan(-1)
    expect(rangeIdx).toBeGreaterThan(inIdx)
  })

  it('pagination next uses range(50,99)', async () => {
    const user = userEvent.setup()
    const { from, queryCalls } = createLedgerFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()

    expect(await screen.findByRole('button', { name: /suivant|next/i })).toBeEnabled()
    expect(STOCK_ACTIVITY_PAGE_SIZE).toBe(50)
    await user.click(screen.getByRole('button', { name: /suivant|next/i }))

    await waitFor(() => {
      expect(queryCalls()).toContain('range:50-99')
    })
  })

  it('applies depot filter when currentDepotId is set', async () => {
    useDepotStore.setState({ currentDepotId: 'depot-a', currentDepotName: 'Depot Dakar' })
    const { from, queryCalls } = createLedgerFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()

    await waitFor(() => {
      expect(queryCalls()).toContain('eq:depot_id:depot-a')
    })
    expect(screen.queryByText(/^dépôt$|^depot$/i)).not.toBeInTheDocument()
  })

  it('omits depot eq when currentDepotId is null', async () => {
    const { from, queryCalls } = createLedgerFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()

    await screen.findByRole('heading', { name: /mouvements de stock|stock movements/i })
    await waitFor(() => {
      expect(queryCalls().some((c) => c.startsWith('range:'))).toBe(true)
    })
    expect(queryCalls().some((c) => c.startsWith('eq:depot_id'))).toBe(false)
    expect(screen.getAllByText('Dépôt').length).toBeGreaterThan(0)
  })

  it('shows empty state when there are no rows', async () => {
    const { from } = createLedgerFrom([])
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()

    expect(await screen.findByText(/aucun mouvement de stock/i)).toBeInTheDocument()
  })

  it('shows loading state while the query is pending', () => {
    const { from } = createLedgerFrom(catalog, { pending: true })
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()

    expect(screen.getByRole('status', { name: /chargement…|loading…/i })).toBeInTheDocument()
    expect(screen.queryByText(/^quand$|^when$/i)).not.toBeInTheDocument()
  })

  it('shows error state when the query fails', async () => {
    const { from } = createLedgerFrom(catalog, { error: true })
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()

    expect(await screen.findByText(/Impossible de charger l'activité/i)).toBeInTheDocument()
  })

  it('formats positive and negative quantities', async () => {
    const rows = [
      makeRow(0, {
        quantity_pieces: 5,
        transaction_type: 'RESTOCK',
        products: { name: 'Plus Product', is_active: true },
        staff: { full_name: 'Awa Diop' },
      }),
      makeRow(1, {
        quantity_pieces: -2,
        transaction_type: 'SALE',
        products: { name: 'Minus Product', is_active: true },
        staff: { full_name: 'Awa Diop' },
      }),
    ]
    const { from } = createLedgerFrom(rows)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()

    expect(await screen.findByText('Plus Product')).toBeInTheDocument()
    expect(screen.getByText(formatSignedPieces(5))).toBeInTheDocument()
    expect(formatSignedPieces(5)).toBe(`+${formatPieces(5)}`)
    expect(screen.getByText(formatSignedPieces(-2))).toBeInTheDocument()
    expect(formatSignedPieces(-2)).toBe(formatPieces(-2))
  })

  it('renders inactive products and null staff as em dash', async () => {
    const rows = [
      makeRow(0, {
        products: { name: 'Old Cola', is_active: false },
        staff: null,
        quantity_pieces: 1,
        transaction_type: 'RESTOCK',
      }),
    ]
    const { from } = createLedgerFrom(rows)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()

    expect(await screen.findByText('Old Cola')).toBeInTheDocument()
    expect(screen.getAllByText(/\(inactif\)|\(inactive\)/i).length).toBeGreaterThan(0)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).not.toBeInTheDocument()
  })

  it('This week adds created_at gte/lt', async () => {
    const { from, queryCalls } = createLedgerFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()

    const bounds = stockActivityCreatedAtBounds('this_week')
    await waitFor(() => {
      expect(queryCalls()).toContain(`gte:created_at:${bounds!.from}`)
      expect(queryCalls()).toContain(`lt:created_at:${bounds!.toExclusive}`)
    })
  })

  it('All omits date predicates', async () => {
    const user = userEvent.setup()
    const { from, queryCalls } = createLedgerFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    renderPage()
    await screen.findByLabelText(/période|date range/i)

    await user.selectOptions(screen.getByLabelText(/période|date range/i), 'all')

    await waitFor(() => {
      const q = queryCalls()
      expect(q.some((c) => c.startsWith('range:'))).toBe(true)
      expect(q.some((c) => c.startsWith('gte:created_at'))).toBe(false)
      expect(q.some((c) => c.startsWith('lt:created_at'))).toBe(false)
    })
  })
})

describe('Stock Activity routes', () => {
  const catalog = [makeRow(0)]

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset()
    const { from } = createLedgerFrom(catalog)
    vi.mocked(supabase.from).mockImplementation(from as never)
    useDepotStore.setState({
      currentDepotId: 'depot-a',
      currentDepotName: 'Depot Dakar',
      availableDepots: [],
    })
  })

  it('/inventory renders InventoryPage', async () => {
    authorize(depotStaff())
    renderApp('/inventory')
    expect(await screen.findByRole('heading', { name: /inventaire|inventory/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /mouvements de stock|stock movements/i })).not.toBeInTheDocument()
  })

  it('/inventory/activity renders StockActivityPage and highlights only that rail item', async () => {
    authorize(depotStaff())
    renderApp('/inventory/activity')
    expect(await screen.findByRole('heading', { name: /mouvements de stock|stock movements/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Inventory' })).not.toBeInTheDocument()

    const activityLink = document.querySelector('a[href="/inventory/activity"]')
    const inventoryLink = document.querySelector('a[href="/inventory"]')
    expect(activityLink).toHaveAttribute('aria-current', 'page')
    expect(inventoryLink).not.toHaveAttribute('aria-current')
  })

  it('cashier is redirected away from /inventory/activity', async () => {
    authorize(cashierStaff())
    renderApp('/inventory/activity')
    expect(await screen.findByText('pos-page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /mouvements de stock|stock movements/i })).not.toBeInTheDocument()
  })
})
