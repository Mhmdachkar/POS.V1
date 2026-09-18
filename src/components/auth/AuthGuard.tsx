import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore, selectAuthLoadState } from '@/stores/authStore'
import { Skeleton } from '@/components/ui'
import { PosShiftPersistence } from '@/components/pos/PosShiftPersistence'
import { DeactivatedPage } from '@/pages/DeactivatedPage'

/**
 * AuthGuard — controls access to all protected routes.
 *
 * Uses the 4-state authLoadState machine (never just `session !== null`):
 *
 *   'booting'         → Full-screen skeleton. Never render protected content.
 *                       Prevents flash of unauthenticated content during startup.
 *
 *   'unauthenticated' → Redirect to /login, preserving intended path
 *                       in location state for post-login redirect.
 *
 *   'deactivated'     → Render DeactivatedPage inline (within this guard).
 *                       The URL stays unchanged. The user must consciously
 *                       click "Sign out" — no automatic redirect.
 *
 *   'authorized'      → Render child routes via <Outlet />.
 *                       Downstream <RoleGuard /> enforces role restrictions.
 *
 * ─────────────────────────────────────────────────────────────────
 * SECURITY PRINCIPLE: Route guards are UX conveniences, NOT security.
 *
 * This guard prevents navigation to protected routes in the browser.
 * It does NOT protect data. Real security is enforced by:
 *   - PostgreSQL RLS policies (database-level, per-row access control)
 *   - Edge Function role checks (server-side, service_role verified)
 *   - SECURITY DEFINER helper functions (re-read staff table on every query)
 *
 * A user who circumvents client-side routing still cannot read another
 * depot's data or perform unauthorized mutations — the database will
 * block them regardless of what the frontend does.
 * ─────────────────────────────────────────────────────────────────
 */
export function AuthGuard() {
  const authLoadState = useAuthStore(selectAuthLoadState)
  const location = useLocation()

  // BOOTING: Session check still running. Show neutral skeleton.
  // Never redirect or render protected content during this state.
  if (authLoadState === 'booting') {
    return (
      <div
        className="flex h-screen items-center justify-center bg-background"
        role="status"
        aria-label="Chargement de l'application"
      >
        <div className="space-y-3 w-56">
          <Skeleton height={8} className="rounded-full" />
          <Skeleton height={8} width="80%" className="rounded-full" />
          <Skeleton height={8} width="60%" className="rounded-full" />
        </div>
      </div>
    )
  }

  // UNAUTHENTICATED: No session. Send to login.
  if (authLoadState === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // DEACTIVATED: Session exists but staff is inactive.
  // Render the deactivated page without redirecting. User signs out manually.
  if (authLoadState === 'deactivated') {
    return <DeactivatedPage />
  }

  // AUTHORIZED: Active staff confirmed. Render protected routes.
  return (
    <>
      <PosShiftPersistence />
      <Outlet />
    </>
  )
}
