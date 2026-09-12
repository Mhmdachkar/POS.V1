import { ClipboardList } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * AuditPage — Phase 12 implementation target.
 *
 * Will contain:
 * - Audit log timeline (actor, action, entity, timestamp)
 * - Before/after detail drawer
 * - Filters: action type, actor, date range, depot, entity type
 *
 * Audit log is append-only. No UPDATE or DELETE allowed by any role.
 * Raw SQL errors and internal field names are never exposed to users.
 */
export function AuditPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<ClipboardList className="h-8 w-8" />}
        title="Audit Log — Coming in Phase 12"
        description="System-wide audit trail will be implemented in Phase 12."
      />
    </div>
  )
}
