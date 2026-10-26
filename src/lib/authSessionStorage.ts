import type { SupportedStorage } from '@supabase/supabase-js'

export const AUTH_STORAGE_KEY = 'vhm-pos-auth'

/** Remove sessions saved under localStorage from before session-scoped auth. */
export function clearLegacyPersistedAuth(): void {
  try {
    const storage = globalThis.localStorage
    if (!storage) return
    storage.removeItem(AUTH_STORAGE_KEY)
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && key.startsWith('sb-') && key.includes('auth')) {
        keys.push(key)
      }
    }
    for (const key of keys) {
      storage.removeItem(key)
    }
  } catch {
    // private mode / blocked storage
  }
}

function sessionStore(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

/** Supabase auth storage: cleared when the browser tab/window session ends. */
export const authSessionStorage: SupportedStorage = {
  getItem(key: string): string | null {
    return sessionStore()?.getItem(key) ?? null
  },
  setItem(key: string, value: string): void {
    sessionStore()?.setItem(key, value)
  },
  removeItem(key: string): void {
    sessionStore()?.removeItem(key)
  },
}

clearLegacyPersistedAuth()