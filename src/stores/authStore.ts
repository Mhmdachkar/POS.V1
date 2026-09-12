import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import type { Staff } from '@/types/database'

interface AuthState {
  /** Supabase session — null when unauthenticated */
  session: Session | null
  /** Staff record from the database — fetched after session is confirmed */
  staff: Staff | null
  /** True while the initial session check is running on app mount */
  isLoading: boolean

  // Actions
  setSession: (session: Session | null) => void
  setStaff: (staff: Staff | null) => void
  setLoading: (loading: boolean) => void
  /** Clear session and staff on sign-out */
  clear: () => void
}

/**
 * Auth store — source of truth for the current user's session and staff record.
 *
 * IMPORTANT: The `staff` record is fetched from the database after every
 * session change. JWT app_metadata claims are used for performance
 * optimizations only — is_active, role, and depot_id are always
 * re-verified from the `staff` table in every critical Edge Function.
 *
 * The store is populated by AuthProvider (components/auth/AuthProvider.tsx)
 * which subscribes to Supabase auth state changes.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  session: null,
  staff: null,
  isLoading: true,

  setSession: (session) => set({ session }),
  setStaff: (staff) => set({ staff }),
  setLoading: (loading) => set({ isLoading: loading }),

  clear: () =>
    set({
      session: null,
      staff: null,
      isLoading: false,
    }),
}))

// ─────────────────────────────────────────────────────────────────
// Selector helpers (use in components to avoid re-rendering on
// unrelated state changes)
// ─────────────────────────────────────────────────────────────────

export const selectRole = (s: AuthState) => s.staff?.role
export const selectDepotId = (s: AuthState) => s.staff?.depot_id
export const selectStaffId = (s: AuthState) => s.staff?.id
export const selectIsAdmin = (s: AuthState) => s.staff?.role === 'admin'
export const selectIsCashier = (s: AuthState) => s.staff?.role === 'cashier'
export const selectIsDepotStaff = (s: AuthState) => s.staff?.role === 'depot_staff'
