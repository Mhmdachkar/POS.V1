import { LayoutDashboard } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * DashboardPage — Phase 11 implementation target.
 *
 * Will contain:
 * - Today's sales (CFA), gross profit, transaction count, avg sale
 * - Action required: low stock alerts, outstanding balances, shift discrepancies, exchange rate
 * - Top products
 * - Sales performance chart
 *
 * Queries use authoritative transaction data — not raw sums of all sales.
 */
export function DashboardPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<LayoutDashboard className="h-8 w-8" />}
        title="Admin Dashboard — Coming in Phase 11"
        description="Business overview, metrics, alerts, and analytics will be implemented in Phase 11."
      />
    </div>
  )
}
