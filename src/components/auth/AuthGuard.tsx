import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Skeleton } from '@/components/ui'

/**
 * AuthGuard — protects all routes that require authentication.
 *
 * While the initial session check is running (isLoading), shows a
 * full-screen skeleton to prevent flash of unauthenticated content.
 *
 * If no session: redirects to /login, preserving the intended path
 * in location state so the user is redirected back after login.
 *
 * If session exists: renders child routes via <Outlet />.
 *
 * NOTE: This guard checks session presence only.
 * Role-based access control is handled by <RoleGuard />.
 * The actual backend authorization is enforced by RLS + Edge Functions.
 */
export function AuthGuard() {
  const session = useAuthStore((s) => s.session)
  const isLoading = useAuthStore((s) => s.isLoading)
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="space-y-3 w-64">
          <Skeleton height={8} className="rounded-full" />
          <Skeleton height={8} width="80%" className="rounded-full" />
          <Skeleton height={8} width="60%" className="rounded-full" />
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
