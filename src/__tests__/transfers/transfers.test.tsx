/**
 * Phase 9 — Transfer list, filters, helpers, and invalidation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  canAccessTransfers,
  canMutateTransfer,
  fetchTransfersList,
  hasDuplicateSourceProducts,
  invalidateAfterCancelTransfer,
  invalidateAfterCompleteTransfer,
  invalidateAfterCreateDraft,
  toCreateTransferDraftParams,
  transferKeys,
  type TransferListFilters,
  type TransferListItem,
} from '@/hooks/useTransfers'
import { inventoryKeys } from '@/hooks/useInventory'
import { productKeys } from '@/hooks/useProducts'
import { TransfersPage } from '@/pages/transfers/TransfersPage'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { formatCFA } from '@/lib/formatters'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import type { Staff } from '@/types/database'

vi.mock('@/hooks/useTransfers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useTransfers')>()
  return {
    ...actual,
    useTransferDetail: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
  }
})

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useDepotOptions: vi.fn(() => ({
      data: [
        { id: 'depot-a', name: 'Depot Dakar', code: 'DKR', is_active: true },
        { id: 'depot-b', name: 'Depot Abidjan', code: 'ABJ', is_active: true },
      ],
      isLoading: false,
    })),
  }
})

type TransferRow = {
  id: string
  from_depot_id: string
  to_depot_id: string
  status: string
  created_by: string
  created_at: string
  completed_at: string | null
  completed_by: string | null
  note: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
  from_depot: { name: string }
  to_depot: { name: string }
  created_staff: { full_name: string }
  stock_transfer_items: Array<{ count: number }>
  [key: string]: unknown
}

function makeRow(i: number, overrides: Partial<TransferRow> = {}): TransferRow {
  return {
    id: `tr-${i}`,
    from_depot_id: i % 2 === 0 ? 'depot-a' : 'depot-b',
    to_depot_id: i % 2 === 0 ? 'depot-b' : 'depot-a',
    status: i % 3 === 0 ? 'completed' : 'pending',
    created_by: 'admin-1',
    created_at: `2026-09-12T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`,
    completed_at: null,
    completed_by: null,
    note: null,
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,
    from_depot: { name: i % 2 === 0 ? 'Depot Dakar' : 'Depot Abidjan' },
    to_depot: { name: i % 2 === 0 ? 'Depot Abidjan' : 'Depot Dakar' },
    created_staff: { full_name: 'System Administrator' },
    stock_transfer_items: [{ count: 1 }],
    ...overrides,
  }
}

function buildCatalog(): TransferRow[] {
  return Array.from({ length: 40 }, (_, i) => makeRow(i))
}

function createFilterAwareFrom(allRows: TransferRow[]) {
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
  builder.or = (expr: unknown) => {
    calls.push(`or:${String(expr)}`)
    const text = String(expr)
    const ids = [...text.matchAll(/eq\.([^,]+)/g)].map((m) => m[1])
    if (ids.length) {
      filtered = filtered.filter(
        (r) => ids.includes(r.from_depot_id) || ids.includes(r.to_depot_id),
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

function depotStaff(): Staff {
  return {
    id: 'depot-1',
    username: 'depot',
    full_name: 'Stock Manager',
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

function renderTransfers() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={client}>
      <TransfersPage />
    </QueryClientProvider>,
  )
}

describe('transfer helpers', () => {
  it('blocks cashier access and allows admin / depot_staff', () => {
    expect(canAccessTransfers('admin')).toBe(true)
    expect(canAccessTransfers('depot_staff')).toBe(true)
    expect(canAccessTransfers('cashier')).toBe(false)
  })

  it('allows pending mutations for admin and source depot_staff only', () => {
    const pending = { from_depot_id: 'depot-a', status: 'pending' as const }
    const incoming = { from_depot_id: 'depot-b', status: 'pending' as const }
    const completed = { from_depot_id: 'depot-a', status: 'completed' as const }
    expect(canMutateTransfer(adminStaff(), pending)).toBe(true)
    expect(canMutateTransfer(depotStaff(), pending)).toBe(true)
    expect(canMutateTransfer(depotStaff(), incoming)).toBe(false)
    expect(canMutateTransfer(depotStaff(), completed)).toBe(false)
    expect(canMutateTransfer(cashierStaff(), pending)).toBe(false)
  })

  it('detects duplicate source products', () => {
    expect(hasDuplicateSourceProducts([
      { from_product_id: 'p1' },
      { from_product_id: 'p2' },
    ])).toBe(false)
    expect(hasDuplicateSourceProducts([
      { from_product_id: 'p1' },
      { from_product_id: 'p1' },
    ])).toBe(true)
  })

  it('builds draft params without quantity_pieces', () => {
    const params = toCreateTransferDraftParams({
      fromDepotId: 'depot-a',
      toDepotId: 'depot-b',
      items: [{
        from_product_id: 'src',
        to_product_id: 'dst',
        unit_level: 0,
        quantity_in_unit: 2,
      }],
      note: '  hello  ',
    })
    expect(params.p_from_depot_id).toBe('depot-a')
    expect(params.p_to_depot_id).toBe('depot-b')
    expect(params.p_note).toBe('hello')
    expect(params.p_items[0]).toEqual({
      from_product_id: 'src',
      to_product_id: 'dst',
      unit_level: 0,
      quantity_in_unit: 2,
    })
    expect(JSON.stringify(params)).not.toContain('quantity_pieces')
  })
})

describe('fetchTransfersList', () => {
  const catalog = buildCatalog()

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset()
  })

  it('omits depot predicate when involvingDepotId is null (All Depots)', async () => {
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const filters: TransferListFilters = {
      involvingDepotId: null,
      page: 0,
      pageSize: 30,
    }
    const result = await fetchTransfersList(filters)
    expect(calls.some((c) => c.startsWith('or:'))).toBe(false)
    expect(result.count).toBe(40)
    expect(calls.some((c) => c.startsWith('range:'))).toBe(true)
  })

  it('applies from OR to depot filter before range', async () => {
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const result = await fetchTransfersList({
      involvingDepotId: 'depot-a',
      page: 0,
      pageSize: 30,
    })
    const orIdx = calls.findIndex((c) => c.startsWith('or:'))
    const rangeIdx = calls.findIndex((c) => c.startsWith('range:'))
    expect(orIdx).toBeGreaterThan(-1)
    expect(rangeIdx).toBeGreaterThan(orIdx)
    expect(calls[orIdx]).toContain('from_depot_id.eq.depot-a')
    expect(calls[orIdx]).toContain('to_depot_id.eq.depot-a')
    expect(result.count).toBe(40)
  })

  it('applies status filter before range', async () => {
    const { builder, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    await fetchTransfersList({
      involvingDepotId: null,
      status: 'pending',
      page: 0,
      pageSize: 30,
    })
    const eqIdx = calls.findIndex((c) => c === 'eq:status:pending')
    const rangeIdx = calls.findIndex((c) => c.startsWith('range:'))
    expect(eqIdx).toBeGreaterThan(-1)
    expect(rangeIdx).toBeGreaterThan(eqIdx)
  })
})

describe('query invalidation', () => {
  it('create draft invalidates transfer lists only', () => {
    const keys: unknown[][] = []
    const queryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        keys.push([...queryKey])
      },
    }
    invalidateAfterCreateDraft(queryClient, 'tr-new')
    expect(keys).toContainEqual(['transfers', 'list'])
    expect(keys).toContainEqual([...transferKeys.detail('tr-new')])
    expect(keys.some((k) => k[0] === 'inventory')).toBe(false)
    expect(keys.some((k) => k[0] === 'sales')).toBe(false)
  })

  it('complete invalidates transfers, inventory lists, and products', () => {
    const keys: unknown[][] = []
    const queryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        keys.push([...queryKey])
      },
    }
    invalidateAfterCompleteTransfer(queryClient, 'tr-1', ['prod-1'])
    expect(keys).toContainEqual([...transferKeys.detail('tr-1')])
    expect(keys).toContainEqual(['transfers', 'list'])
    expect(keys).toContainEqual([...inventoryKeys.lists()])
    expect(keys).toContainEqual([...inventoryKeys.stockActivities()])
    expect(keys).toContainEqual([...productKeys.all])
    expect(keys).toContainEqual([...inventoryKeys.activity('prod-1')])
    expect(keys.some((k) => k[0] === 'customers')).toBe(false)
    expect(keys.some((k) => k[0] === 'sales')).toBe(false)
  })

  it('cancel invalidates transfer keys only', () => {
    const keys: unknown[][] = []
    const queryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        keys.push([...queryKey])
      },
    }
    invalidateAfterCancelTransfer(queryClient, 'tr-1')
    expect(keys).toContainEqual([...transferKeys.detail('tr-1')])
    expect(keys).toContainEqual(['transfers', 'list'])
    expect(keys.some((k) => k[0] === 'inventory')).toBe(false)
    expect(keys.some((k) => k[0] === 'products')).toBe(false)
  })
})

describe('TransfersPage', () => {
  const catalog = [
    makeRow(0, { status: 'pending' }),
    makeRow(1, { status: 'completed' }),
    makeRow(2, { status: 'cancelled' }),
  ]

  beforeEach(() => {
    useAuthStore.setState({ staff: adminStaff(), session: null, isLoading: false })
    useDepotStore.setState({ currentDepotId: null, currentDepotName: null, availableDepots: [] })
    vi.mocked(supabase.from).mockImplementation(
      () => createFilterAwareFrom(catalog).builder as never,
    )
  })

  afterEach(() => {
    cleanup()
  })

  it('shows Source and Destination columns in All Depots', async () => {
    renderTransfers()
    expect(await screen.findByText(TRANSFERS.sourceCol.fr)).toBeInTheDocument()
    expect(screen.getByText(TRANSFERS.destinationCol.fr)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nouveau transfert|create transfer/i })).toBeInTheDocument()
  })

  it('filters pending transfers from the status chips', async () => {
    const user = userEvent.setup()
    renderTransfers()
    await screen.findByText(TRANSFERS.sourceCol.fr)
    await user.click(screen.getByRole('button', { name: 'En attente' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'En attente' })).toHaveClass('bg-primary')
      expect(screen.getAllByText('En attente').length).toBeGreaterThan(1)
      expect(screen.getAllByText('Terminée')).toHaveLength(1)
    })
  })
})

export function listItem(overrides: Partial<TransferListItem> = {}): TransferListItem {
  return {
    id: 'tr-1',
    from_depot_id: 'depot-a',
    to_depot_id: 'depot-b',
    status: 'pending',
    created_by: 'admin-1',
    created_at: '2026-09-12T10:00:00Z',
    completed_at: null,
    completed_by: null,
    note: null,
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,
    from_depot_name: 'Depot Dakar',
    to_depot_name: 'Depot Abidjan',
    created_by_name: 'System Administrator',
    item_count: 1,
    ...overrides,
  }
}
