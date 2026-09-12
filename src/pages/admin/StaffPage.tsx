import { UserCog } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * StaffPage — Phase 11 implementation target.
 *
 * Will contain:
 * - Staff list (name, username, role, depot, active status)
 * - Create staff (create_staff RPC — creates Supabase Auth user with synthetic email)
 * - Deactivate staff (deactivate_staff RPC — sets is_active=false, does NOT delete auth user)
 *
 * Deactivation: staff.is_active = false + deactivated_at.
 * Auth revocation via Supabase banUser or similar non-destructive mechanism.
 * Historical records (sales, shifts, payments) remain intact and attributed.
 */
export function StaffPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<UserCog className="h-8 w-8" />}
        title="Staff Management — Coming in Phase 11"
        description="Staff creation and deactivation will be implemented in Phase 11."
      />
    </div>
  )
}
