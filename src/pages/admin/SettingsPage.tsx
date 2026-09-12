import { Settings } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * SettingsPage — Phase 11 implementation target.
 *
 * Will contain:
 * - Business name and logo
 * - CFA/USD exchange rate (current rate, update time, updated by)
 * - Exchange rate update (with confirmation — stored in business_settings)
 *
 * Exchange rate is locked at sale time (cfa_to_usd_rate_used on sales).
 * Historical sales are never recalculated with a new rate.
 */
export function SettingsPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<Settings className="h-8 w-8" />}
        title="Settings — Coming in Phase 11"
        description="Business settings, logo, and exchange rate configuration will be implemented in Phase 11."
      />
    </div>
  )
}
