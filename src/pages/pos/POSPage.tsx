import { ShoppingCart } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * POSPage — Phase 5 implementation target.
 *
 * Will contain:
 * - Product search bar
 * - Category filter
 * - Product grid (ProductCard components)
 * - Persistent cart panel
 * - Unit selector modal
 * - Checkout flow (inline or separate route)
 *
 * Business rules enforced:
 * - No barcode/scanner UI (Business Rule: NO BARCODE)
 * - Cash only checkout (Business Rule: CASH ONLY)
 * - Walk-in vs customer selection (Business Rule: WALK-IN VS CUSTOMER)
 * - create_sale PostgreSQL RPC with FOR UPDATE locking (Business Rule: TRANSACTION ARCHITECTURE)
 */
export function POSPage() {
  return (
    <div className="flex h-full">
      <EmptyState
        icon={<ShoppingCart className="h-8 w-8" />}
        title="POS — Coming in Phase 5"
        description="The POS workspace will be implemented in Phase 5 after the database and Edge Functions are set up."
        className="flex-1"
      />
    </div>
  )
}
