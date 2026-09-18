/**
 * Persists the admin's depot context selection per staff member.
 * null id = All Depots. Cashier / depot_staff do not use this.
 */

import { useAuthStore } from '@/stores/authStore'

const KEY_PREFIX = 'vhm-pos-admin-depot'

export type AdminDepotSelection = {
  id: string | null
  name: string | null
}

export function adminDepotStorageKey(staffId: string): string {
  return `${KEY_PREFIX}:${staffId}`
}

function safeLocalStorage(): Storage | undefined {
  try {
    const storage = globalThis.localStorage
    if (!storage) return undefined
    const probe = '__vhm_admin_depot_probe'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return undefined
  }
}

/** undefined = nothing persisted; explicit null id = All Depots. */
export function readPersistedAdminDepot(
  staffId: string,
): AdminDepotSelection | undefined {
  const storage = safeLocalStorage()
  if (!storage) return undefined
  try {
    const raw = storage.getItem(adminDepotStorageKey(staffId))
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as Partial<AdminDepotSelection>
    return {
      id: parsed.id ?? null,
      name: parsed.name ?? null,
    }
  } catch {
    return undefined
  }
}

export function writePersistedAdminDepot(
  staffId: string,
  selection: AdminDepotSelection,
): void {
  const storage = safeLocalStorage()
  if (!storage) return
  try {
    storage.setItem(
      adminDepotStorageKey(staffId),
      JSON.stringify({
        id: selection.id,
        name: selection.id ? selection.name : null,
      }),
    )
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function clearPersistedAdminDepot(staffId: string): void {
  const storage = safeLocalStorage()
  if (!storage) return
  try {
    storage.removeItem(adminDepotStorageKey(staffId))
  } catch {
    /* ignore */
  }
}

/** Persist selection for the currently authorized admin, if any. */
export function persistAdminDepotSelection(selection: AdminDepotSelection): void {
  const staff = useAuthStore.getState().staff
  if (!staff || staff.role !== 'admin') return
  writePersistedAdminDepot(staff.id, selection)
}

/** Clear persistence for the currently authorized staff, if any. */
export function clearCurrentAdminDepotPersistence(): void {
  const staffId = useAuthStore.getState().staff?.id
  if (!staffId) return
  clearPersistedAdminDepot(staffId)
}
