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
import { bilingualAriaLabel, t } from '@/lib/bilingual/types'
import { APP_BUSINESS_FALLBACK } from '@/lib/formatters'
import { CategoryRail } from '@/components/pos/CategoryRail'
import { ProductGrid } from '@/components/pos/ProductGrid'
import { CartPanel } from '@/components/pos/CartPanel'
import { PaymentPanel } from '@/components/pos/PaymentPanel'
import { FastEntryPanel } from '@/components/pos/FastEntryPanel'
import { PosStockProvider } from '@/components/pos/PosStockProvider'
import {
  clearPosDraft,
  loadPosDraft,
  loadPosMode,
  savePosDraft,
  savePosMode,
  type PosEntryMode,
} from '@/lib/posDraft'
import { SaleSuccessModal } from './components/SaleSuccessModal'
import { useCategories } from '@/hooks/useInventory'
import { fetchProductSearch, productKeys, usePOSProductCatalog } from '@/hooks/useProducts'
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
    queryClient.getQueryData<BusinessSettings>(settingsKeys.current)?.business_name ?? APP_BUSINESS_FALLBACK
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [mobilePane, setMobilePane] = useState<MobilePane>('catalog')
  const [entryMode, setEntryMode] = useState<PosEntryMode>('grid')
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
  const isAdmin = staff?.role === 'admin'
  const useFastEntry = isAdmin && entryMode === 'fast'

  const categoryName = categories?.find((c) => c.id === categoryId)?.name ?? null

  const catalogQuery = usePOSProductCatalog(
    query,
    effectiveDepotId,
    !!effectiveDepotId,
    categoryId,
  )

  useEffect(() => {
    if (!staff?.id || staff.role !== 'admin') {
      setEntryMode('grid')
      return
    }
    setEntryMode(loadPosMode(staff.id))
  }, [staff?.id, staff?.role])

  useEffect(() => {
    if (!staff?.id || !effectiveDepotId) return
    const current = usePOSStore.getState()
    if (current.items.length === 0 && !current.saleResult) {
      const draft = loadPosDraft(staff.id, effectiveDepotId)
      if (draft?.items?.length) {
        usePOSStore.getState().restoreCart(draft.items)
        if (draft.documentDateYmd) usePOSStore.getState().setDocumentDateYmd(draft.documentDateYmd)
        if (draft.externalRef) usePOSStore.getState().setExternalRef(draft.externalRef)
      }
    }
    return usePOSStore.subscribe((state) => {
      if (state.saleResult) {
        clearPosDraft(staff.id, effectiveDepotId)
        return
      }
      savePosDraft(staff.id, effectiveDepotId, {
        items: state.items,
        documentDateYmd: state.documentDateYmd,
        externalRef: state.externalRef,
      })
    })
  }, [staff?.id, effectiveDepotId])

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
        toastErrorBi(POS.remainingStock(result.remainingPieces))
      }
    },
    [],
  )

  const cartCount = items.length
  const payableTotal = effectiveFinalTotal(totals.total_cfa, overrideTotalCfa)

  return (
    <PosStockProvider products={catalogQuery.data}>
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-background no-print">
        {/* Mobile workspace tabs — full-height panes instead of 50/50 stack */}
        <div
          role="tablist"
          aria-label={bilingualAriaLabel(POS.mobileRegisterAria)}
          data-testid="pos-mobile-tabs"
          className="min-[800px]:hidden flex-shrink-0 grid grid-cols-2 gap-1 p-1.5 border-b border-border bg-surface"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobilePane === 'catalog'}
            data-testid="pos-mobile-tab-catalog"
            onClick={() => setMobilePane('catalog')}
            className={cn(
              'h-11 min-h-[44px] rounded-xl text-sm font-semibold transition-colors',
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
              'h-11 min-h-[44px] rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2',
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

        {isAdmin && (
          <div className="flex-shrink-0 flex gap-1 px-3 py-2 border-b border-border bg-surface">
            <button
              type="button"
              className={cn(
                'h-9 px-3 rounded-full text-sm font-medium',
                entryMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-text-secondary',
              )}
              onClick={() => {
                setEntryMode('grid')
                if (staff?.id) savePosMode(staff.id, 'grid')
              }}
            >
              {t(POS.grilleMode)}
            </button>
            <button
              type="button"
              className={cn(
                'h-9 px-3 rounded-full text-sm font-medium',
                entryMode === 'fast' ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-text-secondary',
              )}
              onClick={() => {
                setEntryMode('fast')
                if (staff?.id) savePosMode(staff.id, 'fast')
              }}
            >
              {t(POS.saisieRapide)}
            </button>
          </div>
        )}

        <div className="flex flex-1 min-h-0 flex-col min-[800px]:flex-row overflow-hidden">
          {useFastEntry ? (
            <div className="flex flex-1 min-h-0 flex-col min-[800px]:flex-row overflow-hidden">
              <div className="flex-1 min-h-0 min-w-0 border-border min-[800px]:border-r">
                <FastEntryPanel
                  depotId={effectiveDepotId}
                  onRequestPay={() => setMobilePane('cart')}
                />
              </div>
              <div className="w-full min-[800px]:w-[320px] lg:w-[480px] xl:w-[520px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden bg-background">
                <PaymentPanel
                  className="relative z-20 flex-1 flex flex-col border-t border-border overflow-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]"
                  depotId={effectiveDepotId}
                  hideCustomerChip
                />
              </div>
            </div>
          ) : (
            <>
          {/* Discovery */}
          <div
            className={cn(
              'flex-1 flex-col overflow-hidden border-border min-w-0 min-h-0',
              'min-[800px]:flex min-[800px]:border-r',
              mobilePane === 'catalog' ? 'flex' : 'hidden min-[800px]:flex',
            )}
          >
            <div className="flex-shrink-0 flex flex-col min-[800px]:flex-row min-[800px]:items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 border-b border-border bg-surface/90 backdrop-blur-sm shadow-[0_1px_0_rgba(16,24,40,0.04)]">
              <div className="w-full min-w-0 min-[800px]:w-64 min-[800px]:flex-shrink-0">
                <SearchInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={bilingualAriaLabel(POS.searchProducts)}
                  aria-label={bilingualAriaLabel(POS.searchProducts)}
                  autoFocus
                  className="text-base"
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
              <div className="min-[800px]:hidden flex-shrink-0 border-t border-border bg-surface p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
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
              'w-full min-[800px]:w-[320px] lg:w-[480px] xl:w-[520px] flex-shrink-0 flex-col min-h-0 overflow-hidden bg-background',
              'min-[800px]:flex min-[800px]:min-h-0',
              mobilePane === 'cart' ? 'flex flex-1' : 'hidden min-[800px]:flex',
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
            </>
          )}
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
