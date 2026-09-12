import { BarChart2 } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * ReportsPage — Phase 12 implementation target.
 *
 * Will contain tabs:
 * - Sales: revenue, transactions, gross profit, top products
 * - Inventory: stock value, low stock, turnover
 * - Customers: outstanding balances, payment history
 * - Cash: shift reconciliation summary, discrepancies
 *
 * Reports always respect:
 * - Sale status (exclude voided/returned from revenue)
 * - Reversed payments (exclude from active totals)
 * - Date range and depot filters
 */
export function ReportsPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<BarChart2 className="h-8 w-8" />}
        title="Reports — Coming in Phase 12"
        description="Sales, inventory, customer, and cash reports will be implemented in Phase 12."
      />
    </div>
  )
}
