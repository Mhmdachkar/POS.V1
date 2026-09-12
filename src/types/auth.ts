/**
 * VHM POS — Authentication State Types
 *
 * Defines the 4-state authentication lifecycle used by AuthProvider
 * and AuthGuard to safely control application access.
 *
 * STATE MACHINE:
 *
 *   ┌─────────┐
 *   │ booting │  ← App startup: session check running. Show skeleton.
 *   └────┬────┘
 *        │ session check completes
 *        ├──────────────────────────────┐
 *        ▼                              ▼
 *  ┌─────────────┐               ┌────────────┐
 *  │ authorized  │               │deactivated │  ← Session exists but
 *  └──────┬──────┘               └─────┬──────┘    staff.is_active=false
 *         │                            │
 *         │ signOut()          │ user clicks "Sign out"
 *         │ periodic recheck   │ or session expires
 *         │ finds deactivated  │
 *         ▼                    ▼
 *   ┌──────────────┐     ┌──────────────────┐
 *   │unauthenticated│     │  unauthenticated  │
 *   └──────────────┘     └──────────────────┘
 *         │
 *         │ successful login
 *         ▼
 *   ┌────────────┐
 *   │ authorized │
 *   └────────────┘
 *
 * IMPORTANT — What each state means for the UI:
 *   booting:          Render a full-screen skeleton. Never render
 *                     protected content or redirect yet.
 *   unauthenticated:  Redirect to /login.
 *   deactivated:      Render DeactivatedPage (not the app, not /login).
 *                     The Supabase session technically still exists until
 *                     the user clicks "Sign out". We do NOT automatically
 *                     sign out — we show the deactivated page and let the
 *                     user initiate sign-out consciously.
 *   authorized:       Render the app. Role and depot checks apply next.
 */
export type AuthLoadState =
  | 'booting'           // Initial: checking session on mount
  | 'unauthenticated'   // No session, or explicit sign-out
  | 'deactivated'       // Session valid but staff.is_active = false
  | 'authorized'        // Session valid + is_active = true

/**
 * Result returned by the `validate_active_session` RPC used for
 * periodic re-validation of the staff's active status.
 */
export interface SessionValidationResult {
  valid: boolean
  reason?: 'no_session' | 'staff_not_found' | 'deactivated'
  staff_id?: string
  role?: string
  depot_id?: string | null
  full_name?: string
  is_active?: boolean
}
