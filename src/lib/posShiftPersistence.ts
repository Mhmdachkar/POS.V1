/**
 * Persists the cashier's explicit POS shift selection per staff member.
 * Open/close still happens only via open_shift / close_shift RPCs.
 */

import { useAuthStore } from '@/stores/authStore'

const KEY_PREFIX = 'vhm-pos-selected-shift'

export function posShiftStorageKey(staffId: string): string {
  return `${KEY_PREFIX}:${staffId}`
}

function safeLocalStorage(): Storage | undefined {
  try {
    const storage = globalThis.localStorage
    if (!storage) return undefined
    const probe = '__vhm_pos_shift_probe'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return undefined
  }
}

export function readPersistedPosShiftId(staffId: string): string | null {
  const storage = safeLocalStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(posShiftStorageKey(staffId))
    if (!raw || raw.trim() === '') return null
    return raw
  } catch {
    return null
  }
}

export function writePersistedPosShiftId(staffId: string, shiftId: string | null): void {
  const storage = safeLocalStorage()
  if (!storage) return
  try {
    const key = posShiftStorageKey(staffId)
    if (!shiftId) storage.removeItem(key)
    else storage.setItem(key, shiftId)
  } catch {
    /* ignore quota / privacy mode */
  }
}

/** Sync selection to storage for the currently authorized staff member. */
export function persistPosShiftSelection(shiftId: string | null): void {
  const staffId = useAuthStore.getState().staff?.id
  if (!staffId) return
  writePersistedPosShiftId(staffId, shiftId)
}
