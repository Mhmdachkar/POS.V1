/**
 * Phase 13B / 13F — POS shell: PosShell / PosContextBar / ShiftChip routing.
 *
 * 13B: /pos renders PosShell for cashier and admin; ShiftChip semantics.
 * 13F: Cashier ops routes (/sales, /customers, /payments, /shifts) also
 *      render PosShell (via OpsShell). Admin ops routes keep AppShell.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppRoutes } from '@/routes'
import { AppRail } from '@/components/layout/AppRail'
import { ShiftChip } from '@/components/pos/ShiftChip'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import type { Staff } from '@/types/database'
import { AUTH_NAV, NAV } from '@/lib/bilingual/nav'
import { POS } from '@/lib/bilingual/pos'
import {
  bilingualAriaLabel,
  getByBilingualRole,
  getByLabelBi,
  LAYOUT_ARIA,
  queryByLabelBi,
} from '../helpers/bilingualQueries'

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
    useCategories: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/components/pos/ProductGrid', () => ({
  ProductGrid: () => <div>product-search</div>,
}))
vi.mock('@/components/pos/CartPanel', () => ({
  CartPanel: () => <div>cart-panel</div>,
}))
vi.mock('@/components/pos/CategoryRail', () => ({
  CategoryRail: () => <div>category-rail</div>,
}))
vi.mock('@/components/pos/PaymentPanel', () => ({
  PaymentPanel: () => <div>checkout-panel</div>,
}))
vi.mock('@/pages/sales/SalesPage', () => ({
  SalesPage: () => <div>sales-page</div>,
}))
vi.mock('@/pages/customers/CustomersPage', () => ({
  CustomersPage: () => <div>customers-page</div>,
}))
vi.mock('@/pages/customers/CustomerActivityPage', () => ({
  CustomerActivityPage: () => <div>customer-activity-page</div>,
}))
vi.mock('@/pages/payments/PaymentsPage', () => ({
  PaymentsPage: () => <div>payments-page</div>,
}))
vi.mock('@/pages/shifts/ShiftsPage', () => ({
  ShiftsPage: () => <div>shifts-page</div>,
}))
vi.mock('@/pages/admin/DashboardPage', () => ({
  DashboardPage: () => <div>dashboard-page</div>,
}))

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

function authorize(staff: Staff) {
  useAuthStore.setState({
    staff,
    authLoadState: 'authorized',
    session: null,
    isLoading: false,
  })
}

// ─────────────────────────────────────────────────────────────────
// POS shell routing (13B + 13F)
// ─────────────────────────────────────────────────────────────────

describe('POS shell routing', () => {
  beforeEach(() => {
    authorize(cashierStaff())
    useDepotStore.setState({
      currentDepotId: 'depot-a',
      currentDepotName: 'Depot Dakar',
      availableDepots: [],
    })
  })

  // ── /pos ────────────────────────────────────────────────────────

  it('renders PosShell for cashier /pos without AppRail or TopBar', () => {
    renderApp('/pos')
    expect(screen.getByTestId('pos-context-bar')).toBeInTheDocument()
    expect(screen.getByLabelText('Contexte caisse')).toBeInTheDocument()
    expect(queryByLabelBi(LAYOUT_ARIA.mainNav)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open POS' })).not.toBeInTheDocument()
    expect(screen.queryByText(/sales will not be attributed/)).not.toBeInTheDocument()
    expect(screen.getByText('product-search')).toBeInTheDocument()
  })

  // ── Cashier ops routes → PosShell (13F) ────────────────────────

  it('renders PosShell for cashier /sales', () => {
    renderApp('/sales')
    expect(screen.getByText('sales-page')).toBeInTheDocument()
    expect(screen.getByTestId('pos-context-bar')).toBeInTheDocument()
    expect(queryByLabelBi(LAYOUT_ARIA.mainNav)).not.toBeInTheDocument()
  })

  it('renders PosShell for cashier /customers', () => {
    renderApp('/customers')
    expect(screen.getByText('customers-page')).toBeInTheDocument()
    expect(screen.getByTestId('pos-context-bar')).toBeInTheDocument()
    expect(queryByLabelBi(LAYOUT_ARIA.mainNav)).not.toBeInTheDocument()
  })

  it('renders PosShell for cashier customer activity', () => {
    renderApp('/customers/cust-1/activity')
    expect(screen.getByText('customer-activity-page')).toBeInTheDocument()
    expect(screen.getByTestId('pos-context-bar')).toBeInTheDocument()
    expect(queryByLabelBi(LAYOUT_ARIA.mainNav)).not.toBeInTheDocument()
  })

  it('renders PosShell for cashier /payments', () => {
    renderApp('/payments')
    expect(screen.getByText('payments-page')).toBeInTheDocument()
    expect(screen.getByTestId('pos-context-bar')).toBeInTheDocument()
    expect(queryByLabelBi(LAYOUT_ARIA.mainNav)).not.toBeInTheDocument()
  })

  it('renders PosShell for cashier /shifts', () => {
    renderApp('/shifts')
    expect(screen.getByText('shifts-page')).toBeInTheDocument()
    expect(screen.getByTestId('pos-context-bar')).toBeInTheDocument()
    expect(queryByLabelBi(LAYOUT_ARIA.mainNav)).not.toBeInTheDocument()
  })

  // ── Admin ops routes → AppShell (13F) ──────────────────────────

  it('keeps AppShell (AppRail + TopBar) on admin /sales', () => {
    authorize(adminStaff())
    renderApp('/sales')
    expect(screen.getByText('sales-page')).toBeInTheDocument()
    expect(getByLabelBi(LAYOUT_ARIA.mainNav)).toBeInTheDocument()
    expect(screen.queryByTestId('pos-context-bar')).not.toBeInTheDocument()
  })

  it('keeps AppShell on admin /customers', () => {
    authorize(adminStaff())
    renderApp('/customers')
    expect(screen.getByText('customers-page')).toBeInTheDocument()
    expect(getByLabelBi(LAYOUT_ARIA.mainNav)).toBeInTheDocument()
    expect(screen.queryByTestId('pos-context-bar')).not.toBeInTheDocument()
  })

  it('keeps AppShell on admin customer activity', () => {
    authorize(adminStaff())
    renderApp('/customers/cust-1/activity')
    expect(screen.getByText('customer-activity-page')).toBeInTheDocument()
    expect(getByLabelBi(LAYOUT_ARIA.mainNav)).toBeInTheDocument()
    expect(screen.queryByTestId('pos-context-bar')).not.toBeInTheDocument()
  })

  it('keeps AppShell on admin /payments', () => {
    authorize(adminStaff())
    renderApp('/payments')
    expect(screen.getByText('payments-page')).toBeInTheDocument()
    expect(getByLabelBi(LAYOUT_ARIA.mainNav)).toBeInTheDocument()
    expect(screen.queryByTestId('pos-context-bar')).not.toBeInTheDocument()
  })

  it('keeps AppShell on admin /shifts', () => {
    authorize(adminStaff())
    renderApp('/shifts')
    expect(screen.getByText('shifts-page')).toBeInTheDocument()
    expect(getByLabelBi(LAYOUT_ARIA.mainNav)).toBeInTheDocument()
    expect(screen.queryByTestId('pos-context-bar')).not.toBeInTheDocument()
  })

  // ── Admin /pos → PosShell ──────────────────────────────────────

  it('renders PosShell for admin /pos with Overview return', () => {
    authorize(adminStaff())
    renderApp('/pos')
    expect(screen.getByTestId('pos-context-bar')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Vue d'ensemble" })).toHaveAttribute('href', '/dashboard')
    expect(queryByLabelBi(LAYOUT_ARIA.mainNav)).not.toBeInTheDocument()
  })

  it('admin AppShell AppRail includes POS as primary entry', () => {
    authorize(adminStaff())
    renderApp('/sales')

    const rail = getByLabelBi(LAYOUT_ARIA.mainNav)
    expect(rail).toBeInTheDocument()
    expect(rail.querySelector('a[href="/pos"]')).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────
// PosContextBar navigation tiles (13F)
// ─────────────────────────────────────────────────────────────────

describe('PosContextBar navigation tiles', () => {
  beforeEach(() => {
    authorize(cashierStaff())
    useDepotStore.setState({
      currentDepotId: 'depot-a',
      currentDepotName: 'Depot Dakar',
      availableDepots: [],
    })
  })

  it('renders five navigation tiles for cashier', () => {
    renderApp('/pos')
    const nav = screen.getByLabelText('Navigation caisse')
    expect(nav.querySelector('a[href="/pos"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/sales"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/customers"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/payments"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/shifts"]')).not.toBeNull()
  })

  it('marks the active route tile with aria-current="page"', () => {
    renderApp('/sales')
    const nav = screen.getByLabelText('Navigation caisse')
    const salesLink = nav.querySelector('a[href="/sales"]')
    expect(salesLink).toHaveAttribute('aria-current', 'page')
    // other tiles are not active
    const posLink = nav.querySelector('a[href="/pos"]')
    expect(posLink).not.toHaveAttribute('aria-current', 'page')
  })

  it('marks /pos tile active only on exact /pos (end=true)', () => {
    renderApp('/pos')
    const nav = screen.getByLabelText('Navigation caisse')
    const posLink = nav.querySelector('a[href="/pos"]')
    expect(posLink).toHaveAttribute('aria-current', 'page')
  })

  it('renders depot name in identity row', () => {
    renderApp('/pos')
    expect(screen.getByText('Depot Dakar')).toBeInTheDocument()
  })

  it('renders ShiftChip in identity row', () => {
    renderApp('/pos')
    expect(screen.getByTestId('shift-chip')).toBeInTheDocument()
  })

  it('renders cashier full name in identity row', () => {
    renderApp('/pos')
    // full_name appears in identity row (truncated span)
    const contextBar = screen.getByTestId('pos-context-bar')
    expect(contextBar).toHaveTextContent('Cashier Dakar')
  })

  it('does not render Overview link for cashier', () => {
    renderApp('/pos')
    expect(screen.queryByRole('link', { name: "Vue d'ensemble" })).not.toBeInTheDocument()
  })

  it('renders five tiles and Overview link for admin on /pos', () => {
    authorize(adminStaff())
    renderApp('/pos')
    const nav = screen.getByLabelText('Navigation caisse')
    expect(nav.querySelector('a[href="/pos"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/sales"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/customers"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/payments"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/shifts"]')).not.toBeNull()
    expect(screen.getByRole('link', { name: "Vue d'ensemble" })).toHaveAttribute('href', '/dashboard')
  })

  it('has no duplicate navigation (no AppRail links alongside tiles for cashier)', () => {
    renderApp('/pos')
    // Only one nav landmark: Navigation caisse (no Main navigation)
    const navLandmarks = screen.getAllByRole('navigation')
    const labels = navLandmarks.map((el) => el.getAttribute('aria-label'))
    expect(labels).not.toContain(bilingualAriaLabel(LAYOUT_ARIA.mainNav))
    expect(labels).toContain('Navigation caisse')
  })
})

// ─────────────────────────────────────────────────────────────────
// ShiftChip (CEO Notes — static no-shift badge; no picker)
// ─────────────────────────────────────────────────────────────────

describe('ShiftChip', () => {
  beforeEach(() => {
    authorize(cashierStaff())
  })

  function renderChip() {
    return render(<ShiftChip />)
  }

  it('renders a static no-shift chip', () => {
    renderChip()
    const chip = screen.getByTestId('shift-chip')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveTextContent(POS.noOpenShift.fr)
    expect(screen.queryByRole('button', { name: /Select for POS|Sélectionner pour la caisse/i })).not.toBeInTheDocument()
  })

  it('does not open a picker or bind a shift on click', async () => {
    const user = userEvent.setup()
    renderChip()
    const chip = screen.getByTestId('shift-chip')
    await user.click(chip)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(screen.queryByText(/None is selected automatically/)).not.toBeInTheDocument()
  })
})

const ADMIN_RAIL_NAV = [
  NAV.pos,
  NAV.overview,
  NAV.sales,
  NAV.inventory,
  NAV.customers,
  NAV.payments,
  NAV.transfers,
  NAV.shifts,
  NAV.reports,
  NAV.staff,
  NAV.depots,
  NAV.categories,
  NAV.auditLog,
  NAV.settings,
] as const

describe('AppRail icons and accessibility', () => {
  beforeEach(() => {
    authorize(adminStaff())
  })

  function renderRail(expanded: boolean) {
    return render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppRail expanded={expanded} onToggle={() => {}} />
      </MemoryRouter>,
    )
  }

  it('gives collapsed admin rail links accessible names and an SVG each', () => {
    renderRail(false)
    const nav = getByLabelBi(LAYOUT_ARIA.mainNav)
    for (const label of ADMIN_RAIL_NAV) {
      const link = getByBilingualRole('link', label)
      expect(link).toBeInTheDocument()
      expect(link.querySelector('svg')).not.toBeNull()
      expect(link.querySelector('svg')).toHaveClass('text-current')
    }
    expect(getByBilingualRole('link', NAV.overview)).toHaveClass('text-primary')
    expect(getByBilingualRole('link', NAV.sales)).toHaveClass('text-text-secondary')
    expect(nav.querySelector('a[href="/pos"]')).not.toBeNull()
    expect(getByBilingualRole('button', AUTH_NAV.signOut).querySelector('svg')).toHaveClass(
      'text-current',
    )
    expect(getByBilingualRole('button', AUTH_NAV.expandRail).querySelector('svg')).toHaveClass(
      'text-current',
    )
  })

  it('shows labels when expanded and keeps the active Overview class', () => {
    renderRail(true)
    expect(getByBilingualRole('link', NAV.overview)).toHaveClass('text-primary')
    expect(getByBilingualRole('link', NAV.sales)).toHaveClass('text-text-secondary')
    expect(screen.getByText('VHM POS')).toBeInTheDocument()
    expect(getByBilingualRole('button', AUTH_NAV.collapseRail)).toBeInTheDocument()
  })

  it('keeps depot_staff Stock Activity as a distinct rail item', () => {
    authorize({
      ...adminStaff(),
      id: 'depot-1',
      role: 'depot_staff',
      depot_id: 'depot-a',
      full_name: 'Stock Manager Dakar',
    })
    render(
      <MemoryRouter initialEntries={['/inventory/activity']}>
        <AppRail expanded={false} onToggle={() => {}} />
      </MemoryRouter>,
    )
    expect(getByBilingualRole('link', NAV.stockActivity)).toHaveAttribute(
      'href',
      '/inventory/activity',
    )
    expect(getByBilingualRole('link', NAV.inventory)).toHaveAttribute('href', '/inventory')
    expect(getByBilingualRole('link', NAV.stockActivity).querySelector('svg')).toHaveClass(
      'text-current',
    )
    expect(getByBilingualRole('link', NAV.overview)).toHaveAttribute('href', '/depot')
  })
})
