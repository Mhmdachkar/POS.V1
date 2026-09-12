import { Package } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * InventoryPage — Phase 7 implementation target.
 *
 * Will contain:
 * - Product list with stock status (Healthy / Low Stock / Out of Stock)
 * - Category filter, search by name
 * - Product detail (units, prices, stock, activity timeline)
 * - Restock form (restock_product RPC)
 * - Inventory adjustment form (adjust_inventory RPC)
 * - Unified stock activity list
 *
 * Stock is per-depot (depot-owned product model).
 * All mutations use SELECT ... FOR UPDATE in PostgreSQL transactions.
 */
export function InventoryPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<Package className="h-8 w-8" />}
        title="Inventory — Coming in Phase 7"
        description="Product list, stock activity, restock, and inventory adjustments will be implemented in Phase 7."
      />
    </div>
  )
}
