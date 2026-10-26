/**
 * Phase 10 — Shift list, filters, helpers, and invalidation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  authorizedOpenShifts,
  canAccessShifts,
  canCloseShift,
  canSelectShiftForPos,
  fetchShiftsList,
  invalidateAfterCloseShift,
  invalidateAfterOpenShift,
  shiftKeys,
  type ShiftListFilters,
  type ShiftListItem,
} from '@/hooks/useShifts'
import { ShiftsPage } from '@/pages/shifts/ShiftsPage'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { formatCFA } from '@/lib/formatters'
import { COMMON } from '@/lib/bilingual/common'
import type { Staff } from '@/types/database'

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useShiftDetail: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
  }
})

type ShiftRow = {
  id: string
  depot_id: string
  cashier_id: string
  opening_float_cfa: number
  opened_at: string
  closed_at: string | null
  closed_by: string | null
  expected_cash_cfa: number | null
  actual_cash_cfa: number | null
  discrepancy_cfa: number | null
  status: string
  depot: { name: string }
  cashier: { full_name: string }
  closed_staff: { full_name: string } | null
  [key: string]: unknown
}

function makeRow(i: number, overrides: Partial<ShiftRow> = {}): ShiftRow {
  const open = i % 2 === 0
  return {
    id: `sh-${i}`,
    depot_id: i % 3 === 0 ? 'depot-b' : 'depot-a',
    cashier_id: 'cashier-1',
    opening_float_cfa: 5000,
    opened_at: `2026-09-12T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`,
    closed_at: open ? null : `2026-09-12T${String(12 + (i % 8)).padStart(2, '0')}:00:00Z`,
    closed_by: open ? null : 'cashier-1',
    expected_cash_cfa: open ? null : 5000,
    actual_cash_cfa: open ? null : 5000,
    discrepancy_cfa: open ? null : 0,
    status: open ? 'open' : 'closed',
    depot: { name: i % 3 === 0 ? 'Depot Abidjan' : 'Depot Dakar' },
    cashier: { full_name: 'Cashier Dakar' },
    closed_staff: open ? null : { full_name: 'Cashier Dakar' },
    ...overrides,
  }
}

function buildCatalog(): ShiftRow[] {
  return Array.from({ length: 40 }, (_, i) => makeRow(i))
}

function createFilterAwareFrom(allRows: ShiftRow[]) {
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

function depotStaff(): Staff {
  return {
    id: 'depot-1',
    username: 'depot',
    full_name: 'Stocker',
    role: 'depot_staff',
    depot_id: 'depot-a',
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function openShift(id = 'sh-1', depotId = 'depot-a'): ShiftListItem {
  return {
    id,
    depot_id: depotId,
    cashier_id: 'cashier-1',
    opening_float_cfa: 1000,
    opened_at: '2026-09-13T08:00:00Z',
    closed_at: null,
    closed_by: null,
    expected_cash_cfa: null,
    actual_cash_cfa: null,
    discrepancy_cfa: null,
    status: 'open',
    depot_name: depotId === 'depot-a' ? 'Depot Dakar' : 'Depot Abidjan',
    cashier_name: 'Cashier Dakar',
    closed_by_name: null,
  }
}

function renderShifts() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ShiftsPage />
    </QueryClientProvider>,
  )
}

describe('shift helpers', () => {
  it('allows admin and cashier, blocks depot_staff', () => {
    expect(canAccessShifts('admin')).toBe(true)
    expect(canAccessShifts('cashier')).toBe(true)
    expect(canAccessShifts('depot_staff')).toBe(false)
  })

  it('lets cashier select only own-depot open shifts', () => {
    const cashier = cashierStaff()
    expect(canSelectShiftForPos(cashier, openShift('a', 'depot-a'))).toBe(true)
    expect(canSelectShiftForPos(cashier, openShift('b', 'depot-b'))).toBe(false)
    expect(canSelectShiftForPos(cashier, { ...openShift(), status: 'closed' })).toBe(false)
  })

  it('lets admin select any accessible open shift', () => {
    expect(canSelectShiftForPos(adminStaff(), openShift('b', 'depot-b'))).toBe(true)
    expect(canSelectShiftForPos(depotStaff(), openShift())).toBe(false)
  })

  it('never includes closed shifts in authorized picker list', () => {
    const list = authorizedOpenShifts(adminStaff(), [
      openShift('open-1'),
      { ...openShift('closed-1'), status: 'closed' },
    ])
    expect(list.map((s) => s.id)).toEqual(['open-1'])
  })

  it('allows close for admin and same-depot cashier on open shifts', () => {
    expect(canCloseShift(adminStaff(), openShift('x', 'depot-b'))).toBe(true)
    expect(canCloseShift(cashierStaff(), openShift('x', 'depot-a'))).toBe(true)
    expect(canCloseShift(cashierStaff(), openShift('x', 'depot-b'))).toBe(false)
    expect(canCloseShift(cashierStaff(), { ...openShift(), status: 'closed' })).toBe(false)
  })

  it('invalidates list + open keys after open/close', () => {
    const invalidateQueries = vi.fn()
    invalidateAfterOpenShift({ invalidateQueries })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: shiftKeys.lists() })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: shiftKeys.open() })
    invalidateAfterCloseShift({ invalidateQueries }, 'sh-1')
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: shiftKeys.detail('sh-1') })
  })
})

describe('fetchShiftsList', () => {
  it('applies status and depot filters before range', async () => {
    const { builder, calls } = createFilterAwareFrom(buildCatalog())
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const filters: ShiftListFilters = {
      depotId: 'depot-a',
      status: 'open',
      page: 0,
      pageSize: 30,
    }
    const result = await fetchShiftsList(filters)
    expect(calls.some((c) => c.startsWith('eq:depot_id:depot-a'))).toBe(true)
    expect(calls.some((c) => c.startsWith('eq:status:open'))).toBe(true)
    expect(calls.some((c) => c.startsWith('order:opened_at'))).toBe(true)
    expect(result.data.every((s) => s.status === 'open' && s.depot_id === 'depot-a')).toBe(true)
  })
})

describe('ShiftsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ staff: adminStaff(), session: null, isLoading: false })
    useDepotStore.setState({ currentDepotId: null })
    const { builder } = createFilterAwareFrom(buildCatalog())
    vi.mocked(supabase.from).mockReturnValue(builder as never)
  })

  it('renders historical list, Open Shift, and status pills without Select for POS', async () => {
    renderShifts()
    expect(await screen.findByRole('heading', { name: /Shifts|Services/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Shift|Ouvrir un service/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Select for POS|Sélectionner pour la caisse/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Current')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tout \/ All|All/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ouvert \/ Open|Open/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fermé \/ Closed|Closed/i })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search shifts…')).not.toBeInTheDocument()
  })

  it('shows FilterBar count from totalCount', async () => {
    renderShifts()
    expect(await screen.findByRole('heading', { name: /Shifts|Services/i })).toBeInTheDocument()
    expect(await screen.findByText('40')).toBeInTheDocument()
  })

  it('shows depot column for admin All Depots and hides it for cashier', async () => {
    renderShifts()
    expect(await screen.findByText('Dépôt')).toBeInTheDocument()

    useAuthStore.setState({ staff: cashierStaff(), session: null, isLoading: false })
    renderShifts()
    expect((await screen.findAllByText(COMMON.cashier.fr)).length).toBeGreaterThan(0)
  })

  it('does not offer Select for POS on open shifts', async () => {
    renderShifts()
    await screen.findByRole('heading', { name: /Shifts|Services/i })
    await screen.findAllByText('Cashier Dakar')
    expect(screen.queryByRole('button', { name: /Select for POS|Sélectionner pour la caisse/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Current')).not.toBeInTheDocument()
  })

  it('uses MoneyDisplay for float amounts', async () => {
    renderShifts()
    await screen.findByRole('heading', { name: /Shifts|Services/i })
    await screen.findAllByText('Cashier Dakar')
    const floatLabel = formatCFA(5000)
    const node = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === floatLabel,
    ).find((el) => el.className.includes('financial-value'))
    expect(node).toBeTruthy()
    expect(node).toHaveClass('text-sm', 'financial-value')
  })

  it('shows View for open and closed shifts', async () => {
    renderShifts()
    expect((await screen.findAllByRole('button', { name: /View|Voir/i })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Select for POS|Sélectionner pour la caisse/i })).not.toBeInTheDocument()
  })
})
