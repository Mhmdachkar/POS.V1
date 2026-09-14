/**
 * POSPage — Main cashier workspace.
 *
 * Two-column layout:
 *   Left  (flex-1): product search + results grid
 *   Right (w-96 fixed): cart items + checkout panel
 *
 * The left panel is where the cashier searches products and adds them.
 * The right panel shows the live cart, customer selector, discount,
 * cash tendered, totals preview, and the Complete Sale button.
 *
 * After a successful sale, a modal shows the server-authoritative result
 * and offers Print Receipt + New Sale.
 *
 * Business rules enforced:
 *   - No barcode / SKU fields
 *   - Cash-only checkout (no payment method selector)
 *   - Walk-in vs customer selection
 *   - Idempotent sale submission (same key reused on retry)
 *   - Server-authoritative financials replace preview on success
 *   - Products scoped to the cashier's depot (enforced by RLS)
 */

import { useShallow } from 'zustand/react/shallow'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { usePOSStore } from '@/stores/posStore'
import { ProductSearchPanel } from './components/ProductSearchPanel'
import { CartPanel } from './components/CartPanel'
import { CheckoutPanel } from './components/CheckoutPanel'
import { SaleSuccessModal } from './components/SaleSuccessModal'
import { PosShiftIndicator } from './components/PosShiftIndicator'

export function POSPage() {
  const staff     = useAuthStore((s) => s.staff)
  const depotId   = useDepotStore((s) => s.currentDepotId)

  const { saleResult, customer, items, shiftId } = usePOSStore(useShallow((s) => ({
    saleResult:    s.saleResult,
    customer:      s.customer,
    items:         s.items,
    shiftId:       s.shiftId,
  })))

  // For cashiers, use their assigned depot.
  // For admins, use the depot switcher's current depot.
  const effectiveDepotId =
    staff?.role === 'cashier' ? staff.depot_id : depotId

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background no-print">
      <PosShiftIndicator />
      <div className="flex flex-1 overflow-hidden min-h-0">
      {/* ── Left: Product search panel ──────────────────────────── */}
      <div className="flex-1 overflow-hidden border-r border-border">
        <ProductSearchPanel depotId={effectiveDepotId} />
      </div>

      {/* ── Right: Cart + Checkout panel ──────────────────────── */}
      <div className="w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col overflow-hidden bg-surface">
        {/* Cart items (scrollable) */}
        <div className="flex-1 overflow-hidden min-h-0">
          <CartPanel />
        </div>

        {/* Checkout section (fixed height, scrollable internally if needed) */}
        <div className="border-t border-border overflow-y-auto max-h-[60vh] scrollbar-thin">
          <CheckoutPanel
            depotId={effectiveDepotId}
            shiftId={shiftId}
          />
        </div>
      </div>
      </div>

      {saleResult && (
        <SaleSuccessModal
          result={saleResult}
          customer={customer}
          cartItemCount={items.length}
        />
      )}
    </div>
  )
}
