/**
 * POSPage — Main cashier workspace.
 *
 * ≥ lg: two-column — discovery | fixed 480/520px cart+pay
 * < lg: tabbed — full-height Produits OR Panier (avoids 50/50 squeeze)
 */

import { useCallback, useEffect, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useQueryClient } from '@tanstack/react-query'
import { SearchInput } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
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
import { cn } from '@/lib/cn'
import { formatCFA } from '@/lib/formatters'
import { tryAddCartItem } from '@/lib/posCartActions'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { effectiveFinalTotal, usePOSStore } from '@/stores/posStore'
import type { ProductWithUnits } from '@/types'
import type { BusinessSettings, ProductUnit } from '@/types/database'

type MobilePane = 'catalog' | 'cart'

export function POSPage() {
  const staff     = useAuthStore((s) => s.staff)
  const depotId   = useDepotStore((s) => s.currentDepotId)
  const queryClient = useQueryClient()
  const businessName =
    queryClient.getQueryData<BusinessSettings>(settingsKeys.current)?.business_name ?? 'VHM POS'
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [mobilePane, setMobilePane] = useState<MobilePane>('catalog')
  const { data: categories } = useCategories()

  const { saleResult, customer, items, totals, overrideTotalCfa } = usePOSStore(useShallow((s) => ({
    saleResult: s.saleResult,
    customer:   s.customer,
    items:      s.items,
    totals:     s.totals,
    overrideTotalCfa: s.overrideTotalCfa,
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

  const cartCount = items.length
  const payableTotal = effectiveFinalTotal(totals.total_cfa, overrideTotalCfa)

  return (
    <PosStockProvider products={catalogQuery.data}>
      <div className="flex h-full overflow-hidden bg-background no-print flex-col">
        {/* Mobile workspace tabs — full-height panes instead of 50/50 stack */}
        <div
          role="tablist"
          aria-label="Caisse mobile"
          data-testid="pos-mobile-tabs"
          className="lg:hidden flex-shrink-0 grid grid-cols-2 gap-1 p-1.5 border-b border-border bg-surface"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobilePane === 'catalog'}
            data-testid="pos-mobile-tab-catalog"
            onClick={() => setMobilePane('catalog')}
            className={cn(
              'h-10 rounded-xl text-sm font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
              mobilePane === 'catalog'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-surface-muted text-text-secondary hover:text-text-primary',
            )}
          >
            <BilingualText {...POS.catalogTab} variant="body" layout="inline" />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobilePane === 'cart'}
            data-testid="pos-mobile-tab-cart"
            onClick={() => setMobilePane('cart')}
            className={cn(
              'h-10 rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
              mobilePane === 'cart'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-surface-muted text-text-secondary hover:text-text-primary',
            )}
          >
            <ShoppingCart className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <BilingualText {...POS.cartTab} variant="body" layout="inline" />
            {cartCount > 0 && (
              <span
                className={cn(
                  'min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums',
                  'flex items-center justify-center',
                  mobilePane === 'cart'
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-primary text-primary-foreground',
                )}
              >
                {cartCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
          {/* Discovery */}
          <div
            className={cn(
              'flex-1 flex-col overflow-hidden border-border min-w-0 min-h-0',
              'lg:flex lg:border-r',
              mobilePane === 'catalog' ? 'flex' : 'hidden lg:flex',
            )}
          >
            <div className="flex-shrink-0 flex flex-col gap-2 px-3 py-2.5 sm:px-4 sm:py-3 border-b border-border bg-surface/90 backdrop-blur-sm shadow-[0_1px_0_rgba(16,24,40,0.04)]">
              <div className="w-full min-w-0">
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

            {/* Mobile cart jump — keep browsing while cart is one tap away */}
            {cartCount > 0 && (
              <div className="lg:hidden flex-shrink-0 border-t border-border bg-surface p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  data-testid="pos-mobile-view-cart"
                  onClick={() => setMobilePane('cart')}
                  className={cn(
                    'w-full h-12 rounded-xl px-4',
                    'inline-flex items-center justify-between gap-3',
                    'bg-primary text-primary-foreground text-sm font-semibold shadow-sm',
                    'active:scale-[0.99] transition-transform',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  )}
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <ShoppingCart className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <BilingualText {...POS.viewCart} variant="body" layout="inline" />
                    <span className="tabular-nums opacity-90">({cartCount})</span>
                  </span>
                  <span className="financial-value tabular-nums flex-shrink-0">
                    {formatCFA(payableTotal)}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Cart + payment — full height on mobile tab; fixed width column on ≥ lg */}
          <div
            className={cn(
              'w-full lg:w-[480px] xl:w-[520px] flex-shrink-0 flex-col min-h-0 overflow-hidden bg-background',
              'lg:flex lg:h-full',
              mobilePane === 'cart' ? 'flex flex-1' : 'hidden lg:flex',
            )}
          >
            <div
              data-testid="pos-cart-stage"
              className="flex flex-1 flex-col min-h-0 overflow-hidden bg-surface"
            >
              <CartPanel
                className="flex-1 min-h-0 overflow-hidden"
                onBrowseProducts={() => setMobilePane('catalog')}
              />
              <PaymentPanel
                className="relative z-20 flex-shrink-0 border-t border-border mt-auto overflow-visible pb-[max(0.5rem,env(safe-area-inset-bottom))]"
                depotId={effectiveDepotId}
              />
            </div>
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
