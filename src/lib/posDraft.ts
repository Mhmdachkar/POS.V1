import type { CartItem } from '@/types'

export type PosEntryMode = 'grid' | 'fast'

export interface PosDraftPayload {
  items: CartItem[]
  documentDateYmd?: string
  externalRef?: string
}

export function posModeStorageKey(staffId: string): string {
  return `vhm-pos-mode:${staffId}`
}

export function posDraftStorageKey(staffId: string, depotId: string): string {
  return `vhm-pos-draft:${staffId}:${depotId}`
}

export function loadPosMode(staffId: string): PosEntryMode {
  try {
    const v = localStorage.getItem(posModeStorageKey(staffId))
    return v === 'fast' ? 'fast' : 'grid'
  } catch {
    return 'grid'
  }
}

export function savePosMode(staffId: string, mode: PosEntryMode): void {
  try {
    localStorage.setItem(posModeStorageKey(staffId), mode)
  } catch {
    /* ignore quota */
  }
}

export function loadPosDraft(staffId: string, depotId: string): PosDraftPayload | null {
  try {
    const raw = localStorage.getItem(posDraftStorageKey(staffId, depotId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PosDraftPayload
    if (!parsed || !Array.isArray(parsed.items)) return null
    return parsed
  } catch {
    return null
  }
}

export function savePosDraft(staffId: string, depotId: string, payload: PosDraftPayload): void {
  try {
    localStorage.setItem(posDraftStorageKey(staffId, depotId), JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function clearPosDraft(staffId: string, depotId: string): void {
  try {
    localStorage.removeItem(posDraftStorageKey(staffId, depotId))
  } catch {
    /* ignore */
  }
}