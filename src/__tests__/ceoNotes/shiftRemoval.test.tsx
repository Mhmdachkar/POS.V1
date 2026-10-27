/**
 * CEO Notes — Shift workflow removed from POS.
 * PaymentPanel p_shift_id:null is covered in paymentPanel.test — not duplicated here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShiftChip } from '@/components/pos/ShiftChip'
import { PosShiftIndicator } from '@/pages/pos/components/PosShiftIndicator'
import { POSPage } from '@/pages/pos/POSPage'
import { ShiftsPage } from '@/pages/shifts/ShiftsPage'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { supabase } from '@/lib/supabase'
import { POS } from '@/lib/bilingual/pos'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import type { Staff } from '@/types/database'

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useCategories: vi.fn(() => ({ data: [], isLoading: false })),
    useDepotOptions: vi.fn(() => ({
      data: [{ id: 'depot-a', name: 'Depot Dakar', code: 'DKR', is_active: true }],
      isLoading: false,
    })),
  }
})

vi.mock('@/hooks/useProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useProducts')>()
  return {
    ...actual,
    useProductSearch: vi.fn(() => ({ data: [], isLoading: false, isFetching: false })),
  }
})

vi.mock('@/components/pos/ProductGrid', () => ({
  ProductGrid: () => <div data-testid="product-grid">products</div>,
}))
vi.mock('@/components/pos/CartPanel', () => ({
  CartPanel: () => <div data-testid="cart-panel">cart</div>,
}))
vi.mock('@/components/pos/CategoryRail', () => ({
  CategoryRail: () => <div>categories</div>,
}))
vi.mock('@/components/pos/PaymentPanel', () => ({
  PaymentPanel: () => <div data-testid="payment-panel">payment</div>,
}))
vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useShiftDetail: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
    useOpenShifts: vi.fn(() => ({ data: [], isLoading: false })),
    useOpenShift: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }
})

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

function adminStaff(): Staff {
  return {
    id: 'admin-1',
    username: 'admin',
    full_name: 'Admin User',
    role: 'admin',
    depot_id: null,
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

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

function makeRow(overrides: Partial<ShiftRow> = {}): ShiftRow {
  return {
    id: 'sh-1',
    depot_id: 'depot-a',
    cashier_id: 'cashier-1',
    opening_float_cfa: 5000,
    opened_at: '2026-09-12T10:00:00Z',
    closed_at: null,
    closed_by: null,
    expected_cash_cfa: null,
    actual_cash_cfa: null,
    discrepancy_cfa: null,
    status: 'open',
    depot: { name: 'Depot Dakar' },
    cashier: { full_name: 'Cashier' },
    closed_staff: null,
    ...overrides,
  }
}

function createFilterAwareFrom(allRows: ShiftRow[]) {
  let filtered = [...allRows]
  let range: [number, number] | null = null
  const builder: Record<string, unknown> = {}
  builder.select = () => {
    filtered = [...allRows]
    range = null
    return builder
  }
  builder.order = () => builder
  builder.eq = (col: unknown, val: unknown) => {
    filtered = filtered.filter((r) => r[String(col)] === val)
    return builder
  }
  builder.range = (from: unknown, to: unknown) => {
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
  return builder
}

describe('CEO Notes — POS has no shift gate', () => {
  beforeEach(() => {
    useAuthStore.setState({
      staff: cashierStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    useDepotStore.setState({ currentDepotId: 'depot-a', currentDepotName: 'Depot Dakar' })
  })

  it('renders POS workspace without requiring shift selection', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <POSPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('product-grid')).toBeInTheDocument()
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument()
    expect(screen.getByTestId('payment-panel')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Select for POS|Sélectionner pour la caisse/i })).not.toBeInTheDocument()
  })
})

describe('CEO Notes — ShiftChip opens a shift', () => {
  it('shows bilingual no-shift label and opens Ouvrir un service', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      staff: cashierStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    useDepotStore.setState({ currentDepotId: 'depot-a', currentDepotName: 'Depot Dakar' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <ShiftChip />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const chip = screen.getByTestId('shift-chip')
    expect(chip).toHaveTextContent(POS.noOpenShift.fr)
    await user.click(chip)
    expect(screen.getAllByText(SHIFT_COPY.openShiftTitle.fr).length).toBeGreaterThan(0)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Select for POS|Sélectionner pour la caisse/i })).not.toBeInTheDocument()
  })
})

describe('CEO Notes — PosShiftIndicator', () => {
  it('renders null', () => {
    const { container } = render(<PosShiftIndicator />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CEO Notes — ShiftsPage historical only', () => {
  beforeEach(() => {
    useAuthStore.setState({ staff: adminStaff(), session: null, isLoading: false })
    useDepotStore.setState({ currentDepotId: null })
    vi.mocked(supabase.from).mockReturnValue(
      createFilterAwareFrom([
        makeRow(),
        makeRow({
          id: 'sh-2',
          status: 'closed',
          closed_at: '2026-09-12T18:00:00Z',
          closed_by: 'cashier-1',
          expected_cash_cfa: 5000,
          actual_cash_cfa: 5000,
          discrepancy_cfa: 0,
          closed_staff: { full_name: 'Cashier' },
        }),
      ]) as never,
    )
  })

  it('has View actions and no Select for POS', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ShiftsPage />
      </QueryClientProvider>,
    )
    expect((await screen.findAllByRole('button', { name: /View|Voir/i })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Select for POS|Sélectionner pour la caisse/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Shift|Ouvrir un service/i })).toBeInTheDocument()
  })
})
