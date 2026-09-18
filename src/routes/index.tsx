import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

// Layout + Guards
import { AppShell } from '@/components/layout/AppShell'
import { PosShell } from '@/components/layout/PosShell'
import { OpsShell } from '@/components/layout/OpsShell'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { RoleGuard } from '@/components/auth/RoleGuard'

// Pages
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

// Cashier + Admin pages
import { POSPage } from '@/pages/pos/POSPage'
import { SalesPage } from '@/pages/sales/SalesPage'
import { CustomersPage } from '@/pages/customers/CustomersPage'
import { CustomerActivityPage } from '@/pages/customers/CustomerActivityPage'
import { PaymentsPage } from '@/pages/payments/PaymentsPage'
import { ShiftsPage } from '@/pages/shifts/ShiftsPage'

// Inventory + Depot pages (depot_staff + admin)
import { InventoryPage } from '@/pages/inventory/InventoryPage'
import { StockActivityPage } from '@/pages/inventory/StockActivityPage'
import { TransfersPage } from '@/pages/transfers/TransfersPage'
import { DepotOverviewPage } from '@/pages/depot/DepotOverviewPage'

// Admin-only pages
import { DashboardPage } from '@/pages/admin/DashboardPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { StaffPage } from '@/pages/admin/StaffPage'
import { DepotsPage } from '@/pages/admin/DepotsPage'
import { CategoriesPage } from '@/pages/admin/CategoriesPage'
import { AuditPage } from '@/pages/admin/AuditPage'
import { SettingsPage } from '@/pages/admin/SettingsPage'

// ─────────────────────────────────────────────────────────────────
// Role-based root redirect
// ─────────────────────────────────────────────────────────────────

function RoleRedirect() {
  const staff = useAuthStore((s) => s.staff)

  if (!staff) return <Navigate to="/login" replace />

  switch (staff.role) {
    case 'admin':     return <Navigate to="/pos" replace />
    case 'cashier':   return <Navigate to="/pos" replace />
    case 'depot_staff': return <Navigate to="/depot" replace />
    default:          return <Navigate to="/login" replace />
  }
}

// ─────────────────────────────────────────────────────────────────
// Route tree
//
// Structure:
//   /login               — Public
//   /pos                 — AuthGuard > RoleGuard(cashier, admin) > PosShell
//
//   /sales               — AuthGuard > RoleGuard(cashier, admin) > OpsShell
//   /customers             OpsShell: cashier → PosShell chrome
//   /payments                        admin   → AppShell chrome
//   /shifts
//
//   /                    — AuthGuard > AppShell > role redirect
//     (admin only)
//     /dashboard         — Admin overview
//     /reports           — Reports workspace
//     /admin/staff       — Staff management
//     /admin/depots      — Depot management
//     /admin/categories  — Category management
//     /admin/audit       — Audit log
//     /admin/settings    — Business settings
//
//     (depot_staff + admin)
//     /inventory         — Inventory management
//     /transfers         — Stock transfers
//
// ─────────────────────────────────────────────────────────────────

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated: POS uses PosShell; all other pages use AppShell */}
      <Route element={<AuthGuard />}>
        <Route element={<RoleGuard roles={['cashier', 'admin']} redirectTo="/inventory" />}>
          <Route element={<PosShell />}>
            <Route path="/pos" element={<POSPage />} />
          </Route>
        </Route>

        {/* Ops pages: PosShell chrome for cashier, AppShell chrome for admin */}
        <Route element={<RoleGuard roles={['cashier', 'admin', 'depot_staff']} redirectTo="/inventory" />}>
          <Route element={<OpsShell />}>
            <Route path="/sales"     element={<SalesPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:customerId/activity" element={<CustomerActivityPage />} />
            <Route path="/payments"  element={<PaymentsPage />} />
            <Route path="/shifts"    element={<ShiftsPage />} />
          </Route>
        </Route>

        <Route element={<AppShell />}>

          {/* Root: redirect based on role */}
          <Route index element={<RoleRedirect />} />

          {/* ── Admin only ── */}
          <Route element={<RoleGuard roles={['admin']} redirectTo="/pos" />}>
            <Route path="/dashboard"         element={<DashboardPage />} />
            <Route path="/reports"           element={<ReportsPage />} />
            <Route path="/admin/staff"       element={<StaffPage />} />
            <Route path="/admin/depots"      element={<DepotsPage />} />
            <Route path="/admin/categories"  element={<CategoriesPage />} />
            <Route path="/admin/audit"       element={<AuditPage />} />
            <Route path="/admin/settings"    element={<SettingsPage />} />
          </Route>

          {/* ── Depot Staff + Admin ── */}
          <Route element={<RoleGuard roles={['depot_staff', 'admin']} redirectTo="/pos" />}>
            <Route path="/depot"                element={<DepotOverviewPage />} />
            <Route path="/inventory"            element={<InventoryPage />} />
            <Route path="/inventory/activity"   element={<StockActivityPage />} />
            <Route path="/transfers"            element={<TransfersPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
