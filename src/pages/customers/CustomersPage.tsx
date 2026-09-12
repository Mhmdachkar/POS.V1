import { Users } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * CustomersPage — Phase 6 implementation target.
 *
 * Will contain:
 * - Customer list with balance display
 * - Customer search
 * - Customer detail profile (with purchase history, payment history)
 * - Payment recording
 *
 * Financial model: Pooled balance accounting.
 * balance_owed_cfa is authoritative and maintained by Edge Functions.
 */
export function CustomersPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="Customers — Coming in Phase 6"
        description="Customer list, profiles, balances, and payment history will be implemented in Phase 6."
      />
    </div>
  )
}
