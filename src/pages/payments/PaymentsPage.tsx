import { Banknote } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * PaymentsPage — Phase 6 implementation target.
 *
 * Will contain:
 * - Recent payments list
 * - Quick payment recording for a customer
 *
 * All payments are cash-only. No payment method selection.
 * Payments reduce the customer's pooled balance_owed_cfa.
 */
export function PaymentsPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<Banknote className="h-8 w-8" />}
        title="Payments — Coming in Phase 6"
        description="Customer payment recording will be implemented in Phase 6."
      />
    </div>
  )
}
