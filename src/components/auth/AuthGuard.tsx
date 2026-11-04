import { COMMON } from '@/lib/bilingual/common'
import { t } from '@/lib/bilingual/types'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore, selectAuthLoadState } from '@/stores/authStore'
import { PosShiftPersistence } from '@/components/pos/PosShiftPersistence'
import { DeactivatedPage } from '@/pages/DeactivatedPage'
import { BootLoadingScreen } from '@/components/auth/BootLoadingScreen'
import { LoadingButton } from '@/components/ui'

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
  const retryBoot = useAuthStore((s) => s.retryBoot)
  const location = useLocation()

  // BOOTING: Session check still running. Show neutral skeleton.
  // Never redirect or render protected content during this state.
  if (authLoadState === 'booting') {
    return <BootLoadingScreen />
  }

  if (authLoadState === 'boot_failed') {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center"
        role="alert"
      >
        <p className="max-w-md text-sm text-text-secondary">{t(COMMON.bootFailed)}</p>
        <LoadingButton type="button" onClick={() => retryBoot()}>
          {t(COMMON.retry)}
        </LoadingButton>
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
      <div className="h-full min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </>
  )
}
