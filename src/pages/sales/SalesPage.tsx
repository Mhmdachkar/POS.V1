import { Receipt } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * SalesPage — Phase 8 implementation target.
 *
 * Will contain:
 * - Sales history list (paginated, filterable)
 * - Sale detail drawer (receipt view)
 * - Return initiation
 * - Void initiation
 */
export function SalesPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<Receipt className="h-8 w-8" />}
        title="Sales History — Coming in Phase 8"
        description="Sales history, sale detail, and return/void workflows will be implemented in Phase 8."
      />
    </div>
  )
}
