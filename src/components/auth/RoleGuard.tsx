import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import type { StaffRole } from '@/types/database'

interface RoleGuardProps {
  /** Roles allowed to access the wrapped routes */
  roles: StaffRole[]
  /** Where to redirect if role is not allowed (defaults to '/') */
  redirectTo?: string
}

/**
 * RoleGuard — restricts routes to specific staff roles.
 *
 * Placed inside AuthGuard routes so session is guaranteed.
 * Reads role from the staff record (authoritative DB source via authStore).
 *
 * IMPORTANT: This is a UI-level guard for navigation flow.
 * Real authorization is enforced server-side by RLS policies and
 * Edge Function role checks. Never trust client-side role checks alone.
 */
export function RoleGuard({ roles, redirectTo = '/' }: RoleGuardProps) {
  const staff = useAuthStore((s) => s.staff)

  if (!staff || !roles.includes(staff.role)) {
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}
