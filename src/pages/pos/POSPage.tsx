/**
 * POSPage — Main cashier workspace.
 *
 * ≥ lg: two-column — discovery | fixed 480/520px cart+pay
 * < lg: stacked — discovery first, cart+payment below (bounded height so
 *       complete-sale stays reachable; cart body scrolls).
 */

import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useQueryClient } from '@tanstack/react-query'
import { SearchInput } from '@/components/ui'
import { POS } from '@/lib/bilingual/pos'
import { toastErrorBi } from '@/lib/bilingual/toast'
import { bilingualAriaLabel } from '@/lib/bilingual/types'
import { CategoryRail } from '@/components/pos/CategoryRail'
import { ProductGrid } from '@/components/pos/ProductGrid'
import { CartPanel } from '@/components/pos/CartPanel'
import { PaymentPanel } from '@/components/pos/PaymentPanel'
import { PosStockProvider } from '@/components/pos/PosStockProvider'
import { SaleSuccessModal } from './components/SaleSuccessModal'
import { useCategories } from '@/hooks/useInventory'
import { fetchProductSearch, productKeys, useProductSearch } from '@/hooks/useProducts'
import { settingsKeys } from '@/hooks/useBusinessSettings'
import { CACHE_GC, CACHE_STALE } from '@/lib/cachePolicy'
import { tryAddCartItem } from '@/lib/posCartActions'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { usePOSStore } from '@/stores/posStore'
import type { ProductWithUnits } from '@/types'
import type { BusinessSettings, ProductUnit } from '@/types/database'

export function POSPage() {
  const staff     = useAuthStore((s) => s.staff)
  const depotId   = useDepotStore((s) => s.currentDepotId)
  const queryClient = useQueryClient()
  const businessName =
    queryClient.getQueryData<BusinessSettings>(settingsKeys.current)?.business_name ?? 'VHM POS'
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const { data: categories } = useCategories()

  const { saleResult, customer, items } = usePOSStore(useShallow((s) => ({
    saleResult: s.saleResult,
    customer:   s.customer,
    items:      s.items,
  })))

  // For cashiers, use their assigned depot.
  // For admins, use the depot switcher's current depot.
  const effectiveDepotId =
    staff?.role === 'cashier' ? staff.depot_id : depotId

  const categoryName = categories?.find((c) => c.id === categoryId)?.name ?? null

  const catalogQuery = useProductSearch(
    query,
    effectiveDepotId,
    !!effectiveDepotId,
    categoryId,
  )

  useEffect(() => {
    if (!effectiveDepotId) return
    void queryClient.prefetchQuery({
      queryKey: productKeys.search('', effectiveDepotId, null),
      queryFn: () => fetchProductSearch('', effectiveDepotId, null),
      staleTime: CACHE_STALE.catalog,
      gcTime: CACHE_GC.catalog,
    })
  }, [effectiveDepotId, queryClient])

  const handleAddItem = useCallback(
    (product: ProductWithUnits, unit: ProductUnit, qty: number) => {
      const result = tryAddCartItem(
        {
          product_id: product.id,
          product_name: product.name,
          product_photo_url: product.photo_url,
          unit_level: unit.unit_level as 0 | 1 | 2,
          unit_name: unit.unit_name,
          quantity_in_unit: qty,
          unit_price_cfa: unit.selling_price_cfa,
          cost_price_cfa: unit.cost_price_cfa,
          conversion_to_base: unit.conversion_to_base,
        },
        product.current_stock_pieces,
      )
      if (!result.ok) {
        toastErrorBi(POS.remainingStock(result.availablePieces))
      }
    },
    [],
  )

  return (
    <PosStockProvider products={catalogQuery.data}>
      <div className="flex h-full overflow-hidden bg-background no-print flex-col lg:flex-row">
        {/* Discovery */}
        <div className="flex-1 flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-r border-border min-w-0 min-h-0">
          <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-surface/90 backdrop-blur-sm shadow-[0_1px_0_rgba(16,24,40,0.04)]">
            <div className="w-full min-w-0 max-w-60 sm:w-60 sm:flex-shrink-0">
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={bilingualAriaLabel(POS.searchProducts)}
                aria-label={bilingualAriaLabel(POS.searchProducts)}
                autoFocus
              />
            </div>
            <CategoryRail
              activeId={categoryId}
              onSelect={setCategoryId}
              categories={categories ?? []}
            />
          </div>

          <ProductGrid
            className="flex-1 min-h-0 overflow-y-auto"
            depotId={effectiveDepotId}
            query={query}
            categoryId={categoryId}
            categoryName={categoryName}
            catalogQuery={catalogQuery}
            onAddItem={handleAddItem}
            onClearCategory={() => setCategoryId(null)}
          />
        </div>

        {/* Cart + payment — stacked below discovery on < lg; fixed width column on ≥ lg */}
        <div
          className={
            'w-full lg:w-[480px] xl:w-[520px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden bg-background ' +
            'max-lg:h-[min(52vh,28rem)] max-lg:min-h-[16rem] lg:h-full'
          }
        >
          <div
            data-testid="pos-cart-stage"
            className="flex flex-1 flex-col min-h-0 overflow-hidden bg-surface border-b border-border lg:border-b-0"
          >
            <CartPanel className="flex-1 min-h-0 overflow-hidden" />
            <PaymentPanel
              className="relative z-20 flex-shrink-0 border-t border-border mt-auto overflow-visible"
              depotId={effectiveDepotId}
            />
          </div>
        </div>

        {saleResult && (
          <SaleSuccessModal
            result={saleResult}
            customer={customer}
            cartItemCount={items.length}
            businessName={businessName}
          />
        )}
      </div>
    </PosStockProvider>
  )
}
