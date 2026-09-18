import * as Tooltip from '@radix-ui/react-tooltip'
import { AlertTriangle, Package, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Button, EmptyState, ProductCardSkeleton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { useMemo, useState, useCallback } from 'react'
import { useProductSearch } from '@/hooks/useProducts'
import { filterProductsForPosWall } from '@/lib/productPhotos'
import { COMMON } from '@/lib/bilingual/common'
import { POS } from '@/lib/bilingual/pos'
import { BiButtonInline, BiEmptyDescription, BiEmptyTitle } from '@/lib/bilingual/ui'
import { ProductCard } from './ProductCard'
import type { ProductWithUnits } from '@/types'
import type { ProductUnit } from '@/types/database'

const MIN_CARD_WIDTH = 148

function CatalogRefreshBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      data-testid="catalog-refresh-error"
      className="flex items-center justify-between gap-3 mx-2.5 mt-2.5 px-3 py-2 rounded-lg border border-warning/30 bg-warning-bg text-warning-foreground text-xs"
    >
      <BilingualText {...POS.catalogRefreshFailed} variant="caption" />
      <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
        <BiButtonInline {...COMMON.retry} />
      </Button>
    </div>
  )
}

type CatalogQuery = ReturnType<typeof useProductSearch>

export interface ProductGridProps {
  depotId: string | null
  query: string
  categoryId: string | null
  categoryName?: string | null
  /** When provided (POSPage), avoids a second catalog fetch. */
  catalogQuery?: CatalogQuery
  onAddItem: (product: ProductWithUnits, unit: ProductUnit, qty: number) => void
  onClearCategory: () => void
  className?: string
}

export function ProductGrid({
  depotId,
  query,
  categoryId,
  categoryName,
  catalogQuery: catalogQueryProp,
  onAddItem,
  onClearCategory,
  className,
}: ProductGridProps) {
  const internalQuery = useProductSearch(
    query,
    depotId,
    !!depotId && !catalogQueryProp,
    categoryId,
  )
  const { data: products, isLoading, isError, isFetching, refetch } =
    catalogQueryProp ?? internalQuery

  const [brokenPhotoIds, setBrokenPhotoIds] = useState<Set<string>>(() => new Set())

  const productsWithPhotos = useMemo(
    () => filterProductsForPosWall(products ?? []),
    [products],
  )

  const visibleProducts = useMemo(
    () => productsWithPhotos.filter((p) => !brokenPhotoIds.has(p.id)),
    [productsWithPhotos, brokenPhotoIds],
  )

  const markPhotoBroken = useCallback((productId: string) => {
    setBrokenPhotoIds((prev) => {
      if (prev.has(productId)) return prev
      const next = new Set(prev)
      next.add(productId)
      return next
    })
  }, [])

  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${MIN_CARD_WIDTH}px, 1fr))`,
  } as const

  if (!depotId) {
    return (
      <div className={cn('flex-1 min-h-0 overflow-y-auto', className)}>
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title={<BiEmptyTitle {...POS.noDepotSelected} />}
          description={<BiEmptyDescription {...POS.noDepotHint} />}
          action={
            <Button asChild variant="secondary">
              <Link to="/dashboard">
                <BiButtonInline {...POS.overviewLink} />
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (products === undefined && isLoading) {
    return (
      <div
        className={cn('grid gap-2.5 p-2.5 sm:p-3 pos-discovery-canvas', className)}
        style={gridStyle}
        data-testid="product-grid-loading"
        aria-busy={isFetching}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (products === undefined && isError) {
    return (
      <div className={cn('flex-1 min-h-0 overflow-y-auto', className)}>
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title={<BiEmptyTitle {...POS.failedProducts} />}
          description={<BiEmptyDescription {...COMMON.checkConnection} />}
          action={
            <Button type="button" variant="secondary" onClick={() => void refetch()}>
              <BiButtonInline {...COMMON.retry} />
            </Button>
          }
        />
      </div>
    )
  }

  const noVisibleAfterPhotoFilter =
    Boolean(products && products.length > 0 && visibleProducts.length === 0)

  if (!products || products.length === 0 || noVisibleAfterPhotoFilter) {
    const inCategory = Boolean(categoryId && categoryName)
    return (
      <div className={cn('flex-1 min-h-0 overflow-y-auto', className)}>
        {isError && <CatalogRefreshBanner onRetry={() => void refetch()} />}
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title={
            noVisibleAfterPhotoFilter ? (
              <BiEmptyTitle {...POS.noProductsWithPhotos} />
            ) : inCategory ? (
              <BiEmptyTitle {...POS.noProductsInCategory(categoryName!)} />
            ) : query ? (
              <BiEmptyTitle {...POS.noProductsFound} />
            ) : (
              <BiEmptyTitle {...POS.noActiveProducts} />
            )
          }
          description={
            noVisibleAfterPhotoFilter ? (
              <BiEmptyDescription {...POS.noProductsWithPhotosHint} />
            ) : inCategory ? (
              <BiEmptyDescription {...POS.tryAnotherCategory} />
            ) : query ? (
              <BiEmptyDescription {...POS.noProductsMatching(query)} />
            ) : (
              <BiEmptyDescription {...POS.noActiveUnits} />
            )
          }
          action={
            inCategory ? (
              <Button variant="secondary" onClick={onClearCategory}>
                <BiButtonInline {...POS.showAll} />
              </Button>
            ) : undefined
          }
        />
      </div>
    )
  }

  return (
    <Tooltip.Provider delayDuration={200}>
      <div className={cn('flex-1 min-h-0 overflow-y-auto pos-discovery-canvas', className)}>
        {isError && <CatalogRefreshBanner onRetry={() => void refetch()} />}
        <div className="p-4">
          {productsWithPhotos.length === 40 && (
            <p className="text-xs text-text-secondary mb-3 px-1">
              <BilingualText {...POS.showing40Results} variant="caption" />
            </p>
          )}
          <div className="grid gap-2.5" style={gridStyle} data-testid="product-grid">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddItem={onAddItem}
                onPhotoError={() => markPhotoBroken(product.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  )
}
