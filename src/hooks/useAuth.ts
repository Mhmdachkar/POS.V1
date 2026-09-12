import { useAuthStore } from '@/stores/authStore'

/**
 * Convenience hook for reading auth state in components.
 * Avoids importing both the store and individual selectors.
 */
export function useAuth() {
  const session = useAuthStore((s) => s.session)
  const staff = useAuthStore((s) => s.staff)
  const isLoading = useAuthStore((s) => s.isLoading)

  return {
    session,
    staff,
    isLoading,
    isAuthenticated: session !== null && staff !== null,
    isAdmin: staff?.role === 'admin',
    isCashier: staff?.role === 'cashier',
    isDepotStaff: staff?.role === 'depot_staff',
    depotId: staff?.depot_id ?? null,
    role: staff?.role ?? null,
  }
}
