/**
 * Shared AppShell routing: every authed route uses AppRail + TopBar.
 * ShiftChip stays visible on /pos. Active nav is unique (Caisse is not
 * active on /sales). POS-only chrome (PosContextBar / PosNavRail) is gone.
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
import { COMMON } from '@/lib/bilingual/common'
import {
  bilingualAriaLabel,
  getByBilingualRole,
  getByLabelBi,
  LAYOUT_ARIA,
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
  DashboardPage: () => (
    <div data-testid="dashboard-page" className="h-[480px] shrink-0">
      dashboard-page
    </div>
  ),
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

function cashierNav() {
  return getByLabelBi(LAYOUT_ARIA.mainNav)
}

describe('shared AppShell routing', () => {
  beforeEach(() => {
    authorize(cashierStaff())
    useDepotStore.setState({
      currentDepotId: 'depot-a',
      currentDepotName: 'Depot Dakar',
      availableDepots: [],
    })
  })

  it('renders AppShell for cashier /pos with AppRail, TopBar, and ShiftChip', () => {
    renderApp('/pos')
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(getByLabelBi(LAYOUT_ARIA.mainNav)).toBeInTheDocument()
    expect(screen.getByTestId('shift-chip')).toBeInTheDocument()
    expect(screen.queryByTestId('pos-context-bar')).not.toBeInTheDocument()
    expect(screen.queryByText(/sales will not be attributed/)).not.toBeInTheDocument()
    expect(screen.getByText('product-search')).toBeInTheDocument()
  })

  it('renders AppShell for cashier /sales', () => {
    renderApp('/sales')
    expect(screen.getByText('sales-page')).toBeInTheDocument()
    expect(getByLabelBi(LAYOUT_ARIA.mainNav)).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.queryByTestId('pos-context-bar')).not.toBeInTheDocument()
  })

  it('renders AppShell for cashier /customers', () => {
    renderApp('/customers')
    expect(screen.getByText('customers-page')).toBeInTheDocument()
    expect(getByLabelBi(LAYOUT_ARIA.mainNav)).toBeInTheDocument()
  })

  it('renders AppShell for cashier customer activity', () => {
    renderApp('/customers/cust-1/activity')
    expect(screen.getByText('customer-activity-page')).toBeInTheDocument()
    expect(getByLabelBi(LAYOUT_ARIA.mainNav)).toBeInTheDocument()
  })

  it('renders AppShell for cashier /payments', () => {
    renderApp('/payments')
    expect(screen.getByText('payments-page')).toBeInTheDocument()
    expect(getByLabelBi(LAYOUT_ARIA.mainNav)).toBeInTheDocument()
  })

  it('renders AppShell for cashier /shifts', () => {
    renderApp('/shifts')
    expect(screen.getByText('shifts-page')).toBeInTheDocument()
    expect(getByLabelBi(LAYOUT_ARIA.mainNav)).toBeInTheDocument()
  })

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

  it('renders AppShell for admin /pos with Overview in the rail', () => {
    authorize(adminStaff())
    renderApp('/pos')
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(getByBilingualRole('link', NAV.overview)).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByTestId('pos-context-bar')).not.toBeInTheDocument()
  })

  it('admin AppShell AppRail includes POS as an entry', () => {
    authorize(adminStaff())
    renderApp('/sales')

    const rail = getByLabelBi(LAYOUT_ARIA.mainNav)
    expect(rail).toBeInTheDocument()
    expect(rail.querySelector('a[href="/pos"]')).not.toBeNull()
  })
})

describe('AppShell navigation', () => {
  beforeEach(() => {
    authorize(cashierStaff())
    useDepotStore.setState({
      currentDepotId: 'depot-a',
      currentDepotName: 'Depot Dakar',
      availableDepots: [],
    })
  })

  it('renders five navigation items for cashier', () => {
    renderApp('/pos')
    const nav = cashierNav()
    expect(nav.querySelector('a[href="/pos"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/sales"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/customers"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/payments"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/shifts"]')).not.toBeNull()
  })

  it('shows short labels on the collapsed POS rail', () => {
    renderApp('/pos')
    const nav = cashierNav()
    expect(nav).toHaveTextContent(NAV.pos.fr)
    expect(nav).toHaveTextContent(NAV.sales.fr)
    expect(nav).toHaveTextContent(NAV.customers.fr)
  })

  it('shows the current page title in the top bar', () => {
    renderApp('/sales')
    expect(screen.getByTestId('topbar-page-title')).toHaveTextContent(NAV.sales.fr)
  })

  it('marks the active nav item uniquely — Caisse is not active on /sales', () => {
    renderApp('/sales')
    const nav = cashierNav()
    const salesLink = nav.querySelector('a[href="/sales"]')
    const posLink = nav.querySelector('a[href="/pos"]')
    expect(salesLink).toHaveAttribute('aria-current', 'page')
    expect(posLink).not.toHaveAttribute('aria-current', 'page')
  })

  it('marks /pos active only on exact /pos (end=true)', () => {
    renderApp('/pos')
    const nav = cashierNav()
    const posLink = nav.querySelector('a[href="/pos"]')
    expect(posLink).toHaveAttribute('aria-current', 'page')
  })

  it('renders depot name in the top bar', () => {
    renderApp('/pos')
    expect(screen.getByText('Depot Dakar')).toBeInTheDocument()
  })

  it('renders ShiftChip in the top bar on /pos', () => {
    renderApp('/pos')
    expect(screen.getByTestId('shift-chip')).toBeInTheDocument()
    expect(screen.getByTestId('topbar-shift')).toBeInTheDocument()
  })

  it('renders cashier full name in the top bar', () => {
    renderApp('/pos')
    expect(screen.getByRole('banner')).toHaveTextContent('Cashier Dakar')
  })

  it('does not render Overview for cashier', () => {
    renderApp('/pos')
    expect(screen.queryByRole('link', { name: NAV.overview.fr })).not.toBeInTheDocument()
  })

  it('renders cashier routes plus Overview in the rail for admin on /pos', () => {
    authorize(adminStaff())
    renderApp('/pos')
    const nav = getByLabelBi(LAYOUT_ARIA.mainNav)
    expect(nav.querySelector('a[href="/pos"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/sales"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/customers"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/payments"]')).not.toBeNull()
    expect(nav.querySelector('a[href="/shifts"]')).not.toBeNull()
    expect(getByBilingualRole('link', NAV.overview)).toHaveAttribute('href', '/dashboard')
  })

  it('keeps an icon-only desktop rail on POS', async () => {
    authorize(adminStaff())
    useDepotStore.setState({
      currentDepotId: 'depot-a',
      currentDepotName: 'Depot Dakar',
      availableDepots: [
        { id: 'depot-a', name: 'Depot Dakar', code: 'DKR', is_active: true },
      ],
    })
    const user = userEvent.setup()
    renderApp('/dashboard')

    const railHost = screen.getByTestId('desktop-app-rail')
    expect(railHost).toHaveClass('md:flex')
    expect(getByLabelBi(LAYOUT_ARIA.mainNav).className).toContain('--rail-width-expanded')

    await user.click(getByBilingualRole('link', NAV.pos))
    expect(screen.getByText('product-search')).toBeInTheDocument()
    expect(railHost).toHaveClass('md:flex')
    expect(getByLabelBi(LAYOUT_ARIA.mainNav).className).toContain('--rail-width-collapsed')
    expect(getByBilingualRole('link', NAV.overview)).toBeInTheDocument()
  })

  it('keeps dashboard scroll height bounded after Overview → POS → Overview', async () => {
    authorize(adminStaff())
    useDepotStore.setState({
      currentDepotId: 'depot-a',
      currentDepotName: 'Depot Dakar',
      availableDepots: [
        { id: 'depot-a', name: 'Depot Dakar', code: 'DKR', is_active: true },
      ],
    })
    const user = userEvent.setup()
    renderApp('/dashboard')

    await screen.findByTestId('dashboard-page')
    const pane = document.getElementById('main-content')?.firstElementChild as HTMLElement
    expect(pane).toBeTruthy()
    const dashboardScroll = pane.scrollHeight

    await user.click(getByBilingualRole('link', NAV.pos))
    expect(screen.getByText('product-search')).toBeInTheDocument()
    expect(pane.scrollHeight).toBeLessThanOrEqual(pane.clientHeight + 8)

    await user.click(getByBilingualRole('link', NAV.overview))
    await screen.findByTestId('dashboard-page')
    expect(pane.scrollHeight).toBeLessThanOrEqual(dashboardScroll + 80)
    expect(pane.scrollHeight).toBeLessThan(2000)
  })

  it('has a single main navigation landmark', () => {
    renderApp('/pos')
    const navLandmarks = screen.getAllByRole('navigation')
    const labels = navLandmarks.map((el) => el.getAttribute('aria-label'))
    expect(labels).toContain(bilingualAriaLabel(LAYOUT_ARIA.mainNav))
    expect(labels).not.toContain('Navigation caisse')
  })

  it('does not show Tous les dépôts on admin /pos', () => {
    authorize(adminStaff())
    useDepotStore.setState({
      currentDepotId: null,
      currentDepotName: null,
      availableDepots: [],
    })
    renderApp('/pos')
    expect(screen.queryByText(COMMON.allDepots.fr)).not.toBeInTheDocument()
  })
})

describe('ShiftChip', () => {
  beforeEach(() => {
    authorize(cashierStaff())
  })

  function renderChip() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ShiftChip />
        </MemoryRouter>
      </QueryClientProvider>,
    )
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
    expect(getByBilingualRole('link', NAV.overview)).toHaveClass('text-text-primary', 'bg-primary-subtle')
    expect(getByBilingualRole('link', NAV.sales)).toHaveClass('text-text-secondary')
    expect(getByBilingualRole('link', NAV.pos)).toHaveClass('text-text-secondary')
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
    expect(getByBilingualRole('link', NAV.overview)).toHaveClass('text-text-primary', 'bg-primary-subtle')
    expect(getByBilingualRole('link', NAV.sales)).toHaveClass('text-text-secondary')
    expect(getByBilingualRole('link', NAV.pos)).not.toHaveClass('text-primary')
    expect(screen.getByText('Aquilux POS')).toBeInTheDocument()
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

describe('language switch', () => {
  beforeEach(() => {
    authorize(adminStaff())
  })

  it('turns the shell English in one click and back to French', async () => {
    const user = userEvent.setup()
    renderApp('/dashboard')

    expect(screen.getByRole('link', { name: NAV.pos.fr })).toBeInTheDocument()
    expect(screen.getByTestId('language-switch')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByRole('link', { name: NAV.pos.en })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: NAV.pos.fr })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: NAV.overview.en })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'FR' }))

    expect(screen.getByRole('link', { name: NAV.pos.fr })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: NAV.pos.en })).not.toBeInTheDocument()
  })
})
