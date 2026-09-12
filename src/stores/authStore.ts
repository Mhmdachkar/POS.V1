import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import type { Staff } from '@/types/database'
import type { AuthLoadState } from '@/types/auth'

interface AuthState {
  /**
   * 4-state lifecycle:
   *   'booting'         — initial session check running (show skeleton)
   *   'unauthenticated' — no session / signed out
   *   'deactivated'     — valid session but staff.is_active = false
   *   'authorized'      — valid session + active staff loaded
   *
   * Do NOT render protected content until authLoadState === 'authorized'.
   * Do NOT redirect to /login while authLoadState === 'booting'.
   *
   * @see src/types/auth.ts for the full state machine diagram.
   */
  authLoadState: AuthLoadState

  /** Supabase session — may be non-null even in 'deactivated' state */
  session: Session | null

  /** Staff record from the database — null unless authorized */
  staff: Staff | null

  /** @deprecated Use authLoadState === 'booting' instead */
  isLoading: boolean

  // ── Actions ──────────────────────────────────────────────────
  setAuthLoadState: (state: AuthLoadState) => void
  setSession:       (session: Session | null) => void
  setStaff:         (staff: Staff | null) => void
  /** @deprecated Use setAuthLoadState */
  setLoading:       (loading: boolean) => void

  /**
   * Atomically transition to 'authorized':
   * sets session, staff, and authLoadState in one Zustand update
   * to avoid intermediate states that could cause UI flicker.
   */
  setAuthorized: (session: Session, staff: Staff) => void

  /**
   * Atomically transition to 'deactivated':
   * keeps session (so user can see deactivated page and sign out),
   * clears staff record.
   */
  setDeactivated: (session: Session) => void

  /**
   * Transition to 'unauthenticated':
   * clears all session state.
   */
  clear: () => void
}

/**
 * Auth store — source of truth for the current user's session and staff record.
 *
 * Populated and maintained exclusively by AuthProvider.
 * Components should read from this store; they should NOT write to it.
 *
 * SECURITY MODEL:
 * - staff.is_active, staff.role, staff.depot_id are authoritative from DB.
 * - JWT app_metadata is NOT trusted for authorization decisions.
 * - authLoadState must be 'authorized' before any protected content renders.
 * - Periodic re-validation runs every 5 minutes and on window focus.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  authLoadState: 'booting',
  session: null,
  staff: null,
  isLoading: true,

  setAuthLoadState: (authLoadState) => set({ authLoadState, isLoading: authLoadState === 'booting' }),
  setSession:       (session)       => set({ session }),
  setStaff:         (staff)         => set({ staff }),
  setLoading:       (isLoading)     => set({ isLoading }),

  setAuthorized: (session, staff) =>
    set({ authLoadState: 'authorized', session, staff, isLoading: false }),

  setDeactivated: (session) =>
    set({ authLoadState: 'deactivated', session, staff: null, isLoading: false }),

  clear: () =>
    set({ authLoadState: 'unauthenticated', session: null, staff: null, isLoading: false }),
}))

// ─────────────────────────────────────────────────────────────────
// Selector helpers (stable function references, prevent re-renders)
// ─────────────────────────────────────────────────────────────────

export const selectAuthLoadState  = (s: AuthState) => s.authLoadState
export const selectIsAuthorized   = (s: AuthState) => s.authLoadState === 'authorized'
export const selectIsBooting      = (s: AuthState) => s.authLoadState === 'booting'
export const selectIsDeactivated  = (s: AuthState) => s.authLoadState === 'deactivated'
export const selectRole           = (s: AuthState) => s.staff?.role
export const selectDepotId        = (s: AuthState) => s.staff?.depot_id
export const selectStaffId        = (s: AuthState) => s.staff?.id
export const selectIsAdmin        = (s: AuthState) => s.staff?.role === 'admin'
export const selectIsCashier      = (s: AuthState) => s.staff?.role === 'cashier'
export const selectIsDepotStaff   = (s: AuthState) => s.staff?.role === 'depot_staff'
