import { Clock } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * ShiftsPage — Phase 10 implementation target.
 *
 * Will contain:
 * - Open shift form (opening float entry)
 * - Active shift view (cash sales, payments received, cash refunds, expected cash)
 * - Close shift (actual cash entry, discrepancy display, confirmation)
 *
 * Expected cash formula (enforced server-side in close_shift RPC):
 *   opening_float
 *   + SUM(sales.amount_applied_cfa WHERE shift_id = ?)
 *   + SUM(payments.amount_cfa WHERE shift_id = ? AND is_reversed = false)
 *   - SUM(sale_returns.cash_refunded_cfa WHERE shift_id = ?)
 */
export function ShiftsPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<Clock className="h-8 w-8" />}
        title="Shift Management — Coming in Phase 10"
        description="Shift open, active shift view, and close shift with reconciliation will be implemented in Phase 10."
      />
    </div>
  )
}
