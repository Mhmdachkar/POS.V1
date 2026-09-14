import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useDepotOptions } from '@/hooks/useInventory'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { AppRail } from './AppRail'
import { TopBar } from './TopBar'

/**
 * AppShell — the persistent authenticated application frame.
 *
 * Layout:
 * ┌─────────┬────────────────────────────────┐
 * │         │  TopBar                        │
 * │ AppRail ├────────────────────────────────┤
 * │         │  <page content via Outlet>     │
 * │         │                                │
 * └─────────┴────────────────────────────────┘
 *
 * The AppRail is the vertical navigation rail — collapsed by default
 * (64px, icons only) and expands to 220px (icons + labels) when toggled.
 *
 * The TopBar shows the current depot context and user menu.
 *
 * Pages are rendered into the <Outlet /> by React Router.
 */
export function AppShell() {
  const [railExpanded, setRailExpanded] = useState(false)
  const staff = useAuthStore((s) => s.staff)
  const { data: depots } = useDepotOptions()
  const setAvailableDepots = useDepotStore((s) => s.setAvailableDepots)
  const setCurrentDepot = useDepotStore((s) => s.setCurrentDepot)
  const currentDepotId = useDepotStore((s) => s.currentDepotId)
  const currentDepotName = useDepotStore((s) => s.currentDepotName)

  useEffect(() => {
    if (!depots) return
    setAvailableDepots(depots)
  }, [depots, setAvailableDepots])

  useEffect(() => {
    if (!staff || staff.role === 'admin' || !staff.depot_id || !depots) return
    const depot = depots.find((d) => d.id === staff.depot_id)
    if (!depot) return
    if (currentDepotId !== depot.id || currentDepotName !== depot.name) {
      setCurrentDepot(depot.id, depot.name)
    }
  }, [staff, depots, currentDepotId, currentDepotName, setCurrentDepot])

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Vertical navigation rail */}
      <AppRail
        expanded={railExpanded}
        onToggle={() => setRailExpanded((prev) => !prev)}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar />

        {/* Page content — scrollable per-page */}
        <main
          className="flex-1 overflow-auto bg-background"
          role="main"
          id="main-content"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
