import { create } from 'zustand'
import type { DepotOption } from '@/types'

interface DepotState {
  /**
   * The currently selected depot for admin context switching.
   * For cashier and depot_staff this is always their assigned depot
   * and cannot be changed by the user — it is set once from staff.depot_id.
   * null means "All Depots" (admin only).
   */
  currentDepotId: string | null
  /** Human-readable name for display in TopBar */
  currentDepotName: string | null
  /** Full list of depots for the admin switcher dropdown */
  availableDepots: DepotOption[]

  // Actions
  setCurrentDepot: (id: string | null, name: string | null) => void
  setAvailableDepots: (depots: DepotOption[]) => void
  /** Reset to unset state (called on sign-out) */
  clear: () => void
}

/**
 * Depot context store.
 *
 * For admin: allows switching between depots or selecting "All Depots".
 * For cashier/depot_staff: always locked to their assigned depot.
 *
 * The selected depot context is passed to query hooks so all data
 * views automatically scope to the relevant depot.
 */
export const useDepotStore = create<DepotState>()((set) => ({
  currentDepotId: null,
  currentDepotName: null,
  availableDepots: [],

  setCurrentDepot: (id, name) =>
    set({ currentDepotId: id, currentDepotName: name }),

  setAvailableDepots: (depots) => set({ availableDepots: depots }),

  clear: () =>
    set({
      currentDepotId: null,
      currentDepotName: null,
      availableDepots: [],
    }),
}))
