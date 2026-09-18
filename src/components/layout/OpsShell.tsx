import { useAuthStore } from '@/stores/authStore'
import { PosShell } from './PosShell'
import { AppShell } from './AppShell'

/**
 * OpsShell — role-conditional layout for operational routes.
 *
 * Routes: /sales  /customers  /payments  /shifts
 *
 * cashier → PosShell (PosContextBar, no AppRail/TopBar)
 * admin   → AppShell (AppRail + TopBar, standard admin chrome)
 *
 * React Router v6 resolves <Outlet /> from whichever shell renders,
 * threading the matched child route (SalesPage etc.) through the correct
 * chrome with no duplicate path registration in the route tree.
 *
 * Known minor tradeoff: admin transitioning between /dashboard (main
 * AppShell) and /sales (OpsShell→AppShell) gets a fresh AppShell instance,
 * so railExpanded resets to collapsed. Acceptable for 13F scope.
 */
export function OpsShell() {
  const role = useAuthStore((s) => s.staff?.role)
  if (role === 'cashier') return <PosShell />
  return <AppShell />
}
