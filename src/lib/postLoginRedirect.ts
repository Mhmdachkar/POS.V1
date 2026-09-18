import { useAuthStore } from '@/stores/authStore'
import type { Staff, StaffRole } from '@/types/database'

export function roleHomePath(role: StaffRole): string {
  switch (role) {
    case 'admin':
      return '/pos'
    case 'cashier':
      return '/pos'
    case 'depot_staff':
      return '/depot'
    default:
      return '/login'
  }
}

/**
 * After sign-in, pick a destination that matches the staff role.
 * Admin and cashier both land on the POS register by default.
 * Explicit deep links (reports, admin pages, etc.) are preserved.
 */
export function resolvePostLoginPath(staff: Staff, intendedPath: string | undefined): string {
  const home = roleHomePath(staff.role)
  const from = (intendedPath ?? '/').split('?')[0] || '/'

  if (from === '/' || from === '/login') return home

  if (staff.role === 'admin') {
    return from
  }

  if (staff.role === 'cashier') {
    if (from.startsWith('/admin') || from === '/dashboard' || from === '/reports') return home
    return from
  }

  if (staff.role === 'depot_staff') {
    if (from === '/pos') return home
    return from
  }

  return home
}

export type AuthSettlement = 'authorized' | 'deactivated' | 'failed'

/** Wait until AuthProvider finishes processing SIGNED_IN (or times out). */
export function waitForAuthSettlement(timeoutMs = 15_000): Promise<AuthSettlement> {
  const initial = useAuthStore.getState().authLoadState
  if (initial === 'authorized') return Promise.resolve('authorized')
  if (initial === 'deactivated') return Promise.resolve('deactivated')

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsub()
      resolve('failed')
    }, timeoutMs)

    const unsub = useAuthStore.subscribe((state) => {
      if (state.authLoadState === 'authorized') {
        clearTimeout(timer)
        unsub()
        resolve('authorized')
      } else if (state.authLoadState === 'deactivated') {
        clearTimeout(timer)
        unsub()
        resolve('deactivated')
      }
    })
  })
}
