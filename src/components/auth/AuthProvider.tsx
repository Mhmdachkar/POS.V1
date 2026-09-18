import { useEffect, useRef, useCallback } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { clearPersistedAdminDepot } from '@/lib/depotContextPersistence'
import { startCatalogPersistence, stopCatalogPersistence } from '@/lib/queryPersistence'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { usePOSStore } from '@/stores/posStore'
import type { Staff } from '@/types/database'
import type { SessionValidationResult } from '@/types/auth'

/** Clear auth + depot + cart when the user is gone (not TOKEN_REFRESHED). */
function clearUnauthenticatedLocalState(
  clear: () => void,
  clearDepot: () => void,
) {
  const staffId = useAuthStore.getState().staff?.id
  usePOSStore.getState().startNewSale()
  if (staffId) clearPersistedAdminDepot(staffId)
  clear()
  clearDepot()
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

/** Re-validate staff active status every 5 minutes. */
const REVALIDATION_INTERVAL_MS = 5 * 60 * 1000

/** Re-validate on focus if more than 60 seconds since last check. */
const FOCUS_REVALIDATION_THRESHOLD_MS = 60 * 1000

// ─────────────────────────────────────────────────────────────────
// AuthProvider
// ─────────────────────────────────────────────────────────────────

/**
 * AuthProvider — manages the complete authentication lifecycle.
 *
 * RESPONSIBILITIES:
 *   1. Initial session check on mount (cold start, page refresh).
 *   2. React to all Supabase auth state change events:
 *        SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED.
 *   3. For every session, fetch the AUTHORITATIVE staff record from DB
 *      and verify is_active = true before setting 'authorized' state.
 *   4. Periodic re-validation: every 5 minutes + on window focus.
 *      Detects deactivation during active sessions.
 *   5. Race-condition safe: uses a mounted ref to discard stale
 *      async results if the component unmounts or auth changes again.
 *
 * SECURITY PRINCIPLES:
 *   - A valid Supabase session is NECESSARY but NOT SUFFICIENT.
 *   - Only a DB-confirmed is_active staff record produces 'authorized' state.
 *   - JWT app_metadata claims are NEVER used for authorization decisions.
 *   - Deactivated staff transition to 'deactivated' state (not sign-out).
 *     They see DeactivatedPage and can consciously sign out.
 *   - SIGNED_OUT and TOKEN_REFRESHED both trigger re-verification.
 *
 * IMPORTANT: Route guards (AuthGuard, RoleGuard) are UX conveniences.
 * Real authorization is enforced by PostgreSQL RLS + Edge Functions.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    setAuthorized,
    setDeactivated,
    setAuthLoadState,
    clear,
  } = useAuthStore()
  const authLoadState = useAuthStore((s) => s.authLoadState)
  const staff = useAuthStore((s) => s.staff)

  const setCurrentDepot = useDepotStore((s) => s.setCurrentDepot)
  const clearDepot      = useDepotStore((s) => s.clear)

  // Ref tracking whether the component is still mounted (cancels stale async results)
  const mountedRef     = useRef(true)
  // Timestamp of the last staff re-validation
  const lastValidated  = useRef<number>(0)
  // Abort controller for in-flight fetchStaff requests
  const abortRef       = useRef<AbortController | null>(null)

  // ── Staff fetcher (DB-authoritative) ──────────────────────────
  const fetchStaff = useCallback(async (userId: string): Promise<Staff | null> => {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('id', userId)
      .single()

    if (error || !data) return null
    return data as Staff
  }, [])

  // ── Apply depot context from staff ────────────────────────────
  const applyDepotContext = useCallback((staff: Staff) => {
    if (staff.role !== 'admin' && staff.depot_id) {
      // Non-admin: locked to their assigned depot
      setCurrentDepot(staff.depot_id, null)
    }
    // Admin: depot context stays null (All Depots) until they select one
  }, [setCurrentDepot])

  // ── Core session handler ──────────────────────────────────────
  // Called for every auth state transition.
  // Returns true if successfully authorized, false otherwise.
  const handleSession = useCallback(async (session: Session | null): Promise<boolean> => {
    // Cancel any in-flight fetch from a previous auth event
    if (abortRef.current) {
      abortRef.current.abort()
    }
    abortRef.current = new AbortController()

    if (!session) {
      if (mountedRef.current) {
        clearUnauthenticatedLocalState(clear, clearDepot)
      }
      return false
    }

    const staff = await fetchStaff(session.user.id)

    // Guard: discard result if component unmounted or a newer auth event fired
    if (!mountedRef.current) return false

    if (!staff || !staff.is_active) {
      // Staff not found or deactivated:
      //   Transition to 'deactivated' state — DO NOT auto sign out.
      //   Showing the deactivated page is better UX than a silent redirect.
      //   The user can consciously click "Sign out" from the deactivated page.
      setDeactivated(session)
      clearDepot()
      lastValidated.current = Date.now()
      return false
    }

    // All checks passed → 'authorized'
    setAuthorized(session, staff)
    applyDepotContext(staff)
    lastValidated.current = Date.now()
    return true
  }, [fetchStaff, setAuthorized, setDeactivated, clear, clearDepot, applyDepotContext])

  // ── Lightweight periodic re-validation ───────────────────────
  // Uses the validate_active_session() RPC (single DB round-trip).
  // If the staff is found to be deactivated, transitions to 'deactivated'.
  // Does NOT update the staff record — a full re-fetch is done if needed.
  const revalidateSession = useCallback(async () => {
    const { authLoadState } = useAuthStore.getState()

    // Only re-validate if currently authorized
    if (authLoadState !== 'authorized') return

    const { data, error } = await supabase
      .rpc('validate_active_session')

    if (!mountedRef.current) return

    if (error) {
      // RPC error (e.g. network issue): keep current state, try again next interval
      console.warn('[AuthProvider] re-validation RPC error:', error.message)
      return
    }

    const result = data as SessionValidationResult

    if (!result.valid) {
      // Staff is deactivated or session expired
      if (result.reason === 'deactivated') {
        const { session } = useAuthStore.getState()
        if (session) {
          setDeactivated(session)
          clearDepot()
        } else {
          clearUnauthenticatedLocalState(clear, clearDepot)
        }
      } else if (result.reason === 'no_session') {
        clearUnauthenticatedLocalState(clear, clearDepot)
      }
      return
    }

    lastValidated.current = Date.now()
  }, [setDeactivated, clear, clearDepot])

  // ── Effect: subscribe to auth state + periodic validation ─────
  useEffect(() => {
    mountedRef.current = true

    // 1. Check existing session on mount (handles page refresh / cold start)
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session).finally(() => {
        // Only set unauthenticated if still in booting (session was null)
        if (mountedRef.current) {
          const { authLoadState } = useAuthStore.getState()
          if (authLoadState === 'booting') {
            setAuthLoadState('unauthenticated')
          }
        }
      })
    })

    // 2. Subscribe to all auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mountedRef.current) return

        switch (event) {
          case 'SIGNED_IN':
            // Full re-verification on every sign-in
            await handleSession(session)
            break

          case 'SIGNED_OUT':
            // User explicitly signed out or session expired
            clearUnauthenticatedLocalState(clear, clearDepot)
            break

          case 'TOKEN_REFRESHED':
            // JWT refreshed (~every hour): re-verify staff is still active
            // This catches deactivation that occurred since the last check.
            // Do NOT clear the in-memory cart here (session still present).
            await handleSession(session)
            break

          case 'USER_UPDATED':
            // Supabase Auth user was updated (e.g., email changed): re-fetch staff
            await handleSession(session)
            break

          case 'INITIAL_SESSION':
            // Handled by getSession() above to avoid double processing
            break

          default:
            // PASSWORD_RECOVERY and others: not used in this app
            if (session) await handleSession(session)
            else clearUnauthenticatedLocalState(clear, clearDepot)
        }
      }
    )

    // 3. Periodic re-validation every 5 minutes
    const interval = setInterval(revalidateSession, REVALIDATION_INTERVAL_MS)

    // 4. Re-validate on window focus (catch deactivation between tab switches)
    const handleFocus = () => {
      const sinceLastCheck = Date.now() - lastValidated.current
      if (sinceLastCheck > FOCUS_REVALIDATION_THRESHOLD_MS) {
        revalidateSession()
      }
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      if (abortRef.current) abortRef.current.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (authLoadState === 'booting') return
    if (authLoadState === 'authorized' && staff?.id) {
      void startCatalogPersistence(staff.id)
      return
    }
    void stopCatalogPersistence()
  }, [authLoadState, staff?.id])

  return <>{children}</>
}
