import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useDepotOptions } from '@/hooks/useInventory'
import { readPersistedAdminDepot } from '@/lib/depotContextPersistence'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { PosContextBar } from './PosContextBar'

/**
 * PosShell — dedicated POS terminal frame.
 *
 * No AppRail. No TopBar. Depot context is synced here because /pos
 * no longer lives inside AppShell.
 *
 * POS always requires a concrete depot (catalog + complete_sale are depot-scoped).
 * Admin "All Depots" is not valid here — we restore a persisted depot or
 * default to the first active depot so products load immediately.
 */
export function PosShell() {
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

  // Admin: POS must have a concrete depot so the product catalog can load.
  useEffect(() => {
    if (!staff || staff.role !== 'admin' || !depots?.length) return

    const active = depots.filter((d) => d.is_active !== false)
    if (active.length === 0) return

    if (currentDepotId) {
      const matched = active.find((d) => d.id === currentDepotId)
      if (matched) {
        if (currentDepotName !== matched.name) {
          setCurrentDepot(matched.id, matched.name)
        }
        return
      }
      // Stale id — fall through to pick a valid depot
    }

    const persisted = readPersistedAdminDepot(staff.id)
    if (persisted?.id) {
      const fromPersist = active.find((d) => d.id === persisted.id)
      if (fromPersist) {
        setCurrentDepot(fromPersist.id, fromPersist.name)
        return
      }
    }

    // First visit / All Depots / missing persistence → first active depot
    setCurrentDepot(active[0].id, active[0].name)
  }, [staff, depots, currentDepotId, currentDepotName, setCurrentDepot])

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <PosContextBar />
      <main key={location.pathname} className="flex-1 overflow-hidden min-h-0 pos-workspace-enter">
        <Outlet />
      </main>
    </div>
  )
}
