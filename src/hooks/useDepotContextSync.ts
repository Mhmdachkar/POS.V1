/**
 * Depot context for the shared AppShell.
 *
 * Moved from PosShell + AppShell (behaviour preserved, not dropped):
 * - Load available depots into the store
 * - Non-admin: lock to assigned staff.depot_id
 * - Admin on /pos: force a concrete depot (catalog + complete_sale are depot-scoped)
 * - Admin leaving /pos: restore the scope that was active when /pos was entered
 *   (including "Tous les dépôts")
 * - Admin elsewhere: restore a persisted concrete depot after hard reload;
 *   do not override explicit All Depots ({ id: null })
 */
import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { COMMON } from '@/lib/bilingual/common'
import { readPersistedAdminDepot } from '@/lib/depotContextPersistence'
import { bilingualPlain } from '@/lib/bilingual/types'
import { useDepotOptions } from '@/hooks/useInventory'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'

type DepotScope = { id: string | null; name: string | null }

function allDepotsLabel(): string {
  return bilingualPlain(COMMON.allDepots)
}

export function useDepotContextSync() {
  const { pathname } = useLocation()
  const forceConcreteDepot = pathname === '/pos'
  const staff = useAuthStore((s) => s.staff)
  const { data: depots } = useDepotOptions()
  const setAvailableDepots = useDepotStore((s) => s.setAvailableDepots)
  const setCurrentDepot = useDepotStore((s) => s.setCurrentDepot)
  const currentDepotId = useDepotStore((s) => s.currentDepotId)
  const currentDepotName = useDepotStore((s) => s.currentDepotName)
  const posEntryScopeRef = useRef<DepotScope | null>(null)

  useLayoutEffect(() => {
    if (!depots) return
    setAvailableDepots(depots)
  }, [depots, setAvailableDepots])

  useLayoutEffect(() => {
    if (!staff || staff.role === 'admin' || !staff.depot_id || !depots) return
    const depot = depots.find((d) => d.id === staff.depot_id)
    if (!depot) return
    if (currentDepotId !== depot.id || currentDepotName !== depot.name) {
      setCurrentDepot(depot.id, depot.name)
    }
  }, [staff, depots, currentDepotId, currentDepotName, setCurrentDepot])

  useLayoutEffect(() => {
    if (!staff || staff.role !== 'admin' || !depots?.length) return

    if (forceConcreteDepot) {
      if (posEntryScopeRef.current === null) {
        if (currentDepotId != null) {
          posEntryScopeRef.current = { id: currentDepotId, name: currentDepotName }
        } else {
          const persisted = readPersistedAdminDepot(staff.id)
          posEntryScopeRef.current = persisted ?? { id: null, name: null }
        }
      }

      const active = depots.filter((d) => d.is_active !== false)
      if (active.length === 0) return
      const noPersist = { persist: false as const }

      if (currentDepotId) {
        const matched = active.find((d) => d.id === currentDepotId)
        if (matched) {
          if (currentDepotName !== matched.name) {
            setCurrentDepot(matched.id, matched.name, noPersist)
          }
          return
        }
      }

      const persisted = readPersistedAdminDepot(staff.id)
      if (persisted?.id) {
        const fromPersist = active.find((d) => d.id === persisted.id)
        if (fromPersist) {
          setCurrentDepot(fromPersist.id, fromPersist.name, noPersist)
          return
        }
      }

      setCurrentDepot(active[0].id, active[0].name, noPersist)
      return
    }

    if (posEntryScopeRef.current !== null) {
      const snap = posEntryScopeRef.current
      posEntryScopeRef.current = null
      const name = snap.id ? snap.name : allDepotsLabel()
      if (currentDepotId !== snap.id || currentDepotName !== name) {
        setCurrentDepot(snap.id, name)
      }
      return
    }

    const persisted = readPersistedAdminDepot(staff.id)
    // undefined = never saved; { id: null } = explicit All Depots
    if (persisted === undefined) return
    if (persisted.id == null) {
      const label = allDepotsLabel()
      if (currentDepotId != null || currentDepotName !== label) {
        setCurrentDepot(null, label)
      }
      return
    }
    const depot = depots.find((d) => d.id === persisted.id)
    if (!depot) return
    if (currentDepotId !== depot.id || currentDepotName !== depot.name) {
      setCurrentDepot(depot.id, depot.name)
    }
  }, [
    staff,
    depots,
    currentDepotId,
    currentDepotName,
    setCurrentDepot,
    forceConcreteDepot,
  ])
}
