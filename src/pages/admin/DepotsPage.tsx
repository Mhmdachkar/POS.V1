import { Building2 } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * DepotsPage — Phase 11 implementation target.
 *
 * Will contain:
 * - Depot list (name, location, code, active status)
 * - Create depot
 * - Edit depot (name, location only — code is immutable after creation)
 * - Deactivate depot
 *
 * Product ownership is per-depot. Deactivating a depot hides its
 * products from POS but preserves all historical records.
 */
export function DepotsPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<Building2 className="h-8 w-8" />}
        title="Depots — Coming in Phase 11"
        description="Depot creation and management will be implemented in Phase 11."
      />
    </div>
  )
}
