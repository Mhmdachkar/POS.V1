import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useDepotOptions } from '@/hooks/useInventory'
import { readPersistedAdminDepot } from '@/lib/depotContextPersistence'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { AppRail } from './AppRail'
import { TopBar } from './TopBar'

/**
 * AppShell — the persistent authenticated application frame.
 *
 * Layout (≥ md):
 * ┌─────────┬────────────────────────────────┐
 * │         │  TopBar                        │
 * │ AppRail ├────────────────────────────────┤
 * │         │  <page content via Outlet>     │
 * │         │                                │
 * └─────────┴────────────────────────────────┘
 *
 * Below md: AppRail leaves the layout flow; TopBar hamburger opens it
 * as an off-canvas drawer (overlay + panel).
 *
 * Cashiers use PosShell via OpsShell — this shell is for admin / depot.
 */
export function AppShell() {
  /** Expanded by default so ops nav shows icon + label (not icon-only). */
  const [railExpanded, setRailExpanded] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
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

  // Admin: restore depot after hard reload (memory store is empty; persistence may have a concrete id).
  // Explicit All Depots is persisted as { id: null } — do not override that with a depot.
  useEffect(() => {
    if (!staff || staff.role !== 'admin' || !depots) return
    const persisted = readPersistedAdminDepot(staff.id)
    if (!persisted?.id) return
    const depot = depots.find((d) => d.id === persisted.id)
    if (!depot) return
    if (currentDepotId !== depot.id || currentDepotName !== depot.name) {
      setCurrentDepot(depot.id, depot.name)
    }
  }, [staff, depots, currentDepotId, currentDepotName, setCurrentDepot])

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  // Escape closes the mobile drawer
  useEffect(() => {
    if (!mobileNavOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileNavOpen])

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Desktop / tablet rail — in layout flow from md up */}
      <div className="hidden md:flex h-full flex-shrink-0">
        <AppRail
          expanded={railExpanded}
          onToggle={() => setRailExpanded((prev) => !prev)}
        />
      </div>

      {/* Mobile off-canvas drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Fermer le menu"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 z-10 flex shadow-xl">
            <AppRail
              expanded
              drawer
              onToggle={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />

        {/* Page content — scrollable per-page */}
        <main
          className="flex-1 overflow-auto bg-background min-w-0"
          role="main"
          id="main-content"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
