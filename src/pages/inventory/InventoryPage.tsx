/**
 * InventoryPage — depot-scoped product list with stock status, restock, and adjustments.
 *
 * All list filters (search, category, stock status, depot) are applied at the
 * PostgREST layer before pagination. Stock status is never filtered in React
 * against the current page only.
 *
 * Mutations use restock_product / adjust_inventory RPCs and always target
 * the clicked product's concrete product_id. All Depots is viewing scope only.
 */

import { useEffect, useState } from 'react'
import { BiEmptyTitle, BiPageDescription, BiPageTitle } from '@/lib/bilingual/ui'
import { COMMON } from '@/lib/bilingual/common'
import { ADMIN } from '@/lib/bilingual/admin'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { SALES } from '@/lib/bilingual/sales'
import { Package, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { resolveProductPhotoUrl } from '@/lib/productPhotos'
import { ActiveBadge, Button, EmptyState, PageHeader, Skeleton, StockStatusBadge } from '@/components/ui'
import { formatCFA, formatDate, formatPieces } from '@/lib/formatters'
import { getProductStockStatus, type StockStatus } from '@/types'
import { productPerfMark } from '@/lib/productPerf'
import {
  INVENTORY_PAGE_SIZE,
  primarySellingUnit,
  useCategories,
  useDepotOptions,
  useInventoryList,
} from '@/hooks/useInventory'
import { useDepotStore } from '@/stores/depotStore'
import { useAuthStore } from '@/stores/authStore'
import { ProductDetailDrawer } from './components/ProductDetailDrawer'
import { ProductFormModal } from './components/ProductFormModal'

export function clampInventoryPage(page: number, totalPages: number): number {
  if (page <= 0) return 0
  if (totalPages === 0) return 0
  if (page >= totalPages) return totalPages - 1
  return page
}

type StockFilter = StockStatus | 'all'

const STOCK_FILTERS: Array<{ value: StockFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'out_of_stock', label: INVENTORY.outOfStockFilter.fr },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'healthy', label: 'Healthy' },
]

function TableSkeleton({
  gridCols,
  showDepotColumn,
}: {
  gridCols: string
  showDepotColumn: boolean
}) {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={cn('grid gap-4 px-4 py-3 bg-surface border-b border-border items-center', gridCols)}
        >
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-4 w-full max-w-[10rem]" />
          <Skeleton className="h-4 w-full" />
          {showDepotColumn && <Skeleton className="h-4 w-full" />}
          <Skeleton className="h-4 w-full max-w-[4rem] justify-self-end" />
          <Skeleton className="h-4 w-full max-w-[4rem] justify-self-end" />
          <Skeleton className="h-5 w-full max-w-[5rem] rounded-full" />
          <Skeleton className="h-4 w-full max-w-[3rem]" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  )
}

export function InventoryPage() {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [stockStatus, setStockStatus] = useState<StockFilter>('all')
  const [page, setPage] = useState(0)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const currentDepotId = useDepotStore((s) => s.currentDepotId)
  const isAdmin = useAuthStore((s) => s.staff?.role === 'admin')
  const canCreateProduct = isAdmin && currentDepotId !== null
  const { data: categories } = useCategories()
  const { data: depots } = useDepotOptions()

  const showDepotColumn = currentDepotId === null

  useEffect(() => {
    setPage(0)
  }, [currentDepotId])

  const { data, isLoading, isError, isFetching, isPlaceholderData } = useInventoryList({
    page,
    pageSize: INVENTORY_PAGE_SIZE,
    search,
    categoryId,
    stockStatus,
    depotId: currentDepotId,
  })

  const products = data?.data ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / INVENTORY_PAGE_SIZE)
  const showInitialSkeleton = isLoading && !data

  useEffect(() => {
    if (isLoading) return
    const next = clampInventoryPage(page, totalPages)
    if (next !== page) setPage(next)
  }, [isLoading, page, totalPages])

  useEffect(() => {
    if (!isFetching && data) {
      productPerfMark('inventory:list:settled', {
        categoryId,
        count: data.count,
        rows: data.data.length,
      })
    }
  }, [isFetching, data, categoryId])

  const depotName = (depotId: string) =>
    depots?.find((d) => d.id === depotId)?.name ?? '—'

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(0)
  }

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value || null
    productPerfMark('inventory:category:click', { categoryId: next })
    setCategoryId(next)
    setPage(0)
  }

  const handleStockFilter = (value: StockFilter) => {
    setStockStatus(value)
    setPage(0)
  }

  const gridCols = showDepotColumn
    ? 'grid-cols-[2.25rem_minmax(7rem,1.3fr)_minmax(5rem,0.8fr)_minmax(5rem,0.7fr)_minmax(5.5rem,0.7fr)_4.75rem_6.5rem_4.25rem_6.5rem]'
    : 'grid-cols-[2.25rem_minmax(7rem,1.3fr)_minmax(5rem,0.8fr)_minmax(5.5rem,0.7fr)_4.75rem_6.5rem_4.25rem_6.5rem]'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...INVENTORY.pageTitle} />}
          description={
            totalCount > 0 ? (
              <BiPageDescription {...INVENTORY.productCount(totalCount)} />
            ) : (
              <BiPageDescription {...INVENTORY.stockByDepot} />
            )
          }
          icon={<Package className="h-5 w-5" />}
          className="border-b-0"
          actions={
            <div className="flex items-center gap-2">
              <div className="relative w-52">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={handleSearchChange}
                  placeholder={INVENTORY.searchProducts.fr}
                  aria-label={INVENTORY.searchProducts.fr}
                  className={cn(
                    'w-full h-9 pl-9 pr-3 rounded-md border border-border bg-surface',
                    'text-sm text-text-primary placeholder:text-text-muted',
                    'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
                  )}
                />
              </div>
              <select
                value={categoryId ?? ''}
                onChange={handleCategoryChange}
                className="h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">{COMMON.allCategories.fr}</option>
                {(categories ?? []).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {canCreateProduct && (
                <Button className="gap-1.5 flex-shrink-0" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4" />
                  New Product
                </Button>
              )}
            </div>
          }
        />
        <div className="px-6 pb-4 flex items-center gap-3 flex-wrap">
          <div className="flex gap-1.5 overflow-x-auto">
          {STOCK_FILTERS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleStockFilter(opt.value)}
              className={cn(
                'px-3 h-7 rounded-full text-xs font-medium flex-shrink-0 transition-colors',
                stockStatus === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-muted text-text-secondary border border-border hover:bg-surface',
              )}
            >
              {opt.label}
            </button>
          ))}
          </div>
          {isFetching && isPlaceholderData && (
            <span className="text-xs text-text-muted" data-testid="inventory-list-updating">
              Updating list…
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {showInitialSkeleton ? (
          <TableSkeleton gridCols={gridCols} showDepotColumn={showDepotColumn} />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title={<BiEmptyTitle {...INVENTORY.failedToLoad} />}
              description={COMMON.checkConnection.fr}
            />
          </div>
        ) : products.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title={<BiEmptyTitle {...INVENTORY.noProducts} />}
              description={
                search || categoryId || stockStatus !== 'all'
                  ? INVENTORY.noProductsMatch.fr
                  : INVENTORY.noProductsInView.fr
              }
            />
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border z-[1]">
              <div className={cn('grid gap-4 px-4 py-2 items-center', gridCols)}>
                <span className="text-xs font-semibold text-text-secondary uppercase w-8" />
                <span className="text-xs font-semibold text-text-secondary uppercase">Product</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Category</span>
                {showDepotColumn && (
                  <span className="text-xs font-semibold text-text-secondary uppercase">Depot</span>
                )}
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">Price</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">Stock</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Status</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Track</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Updated</span>
              </div>
            </div>

            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setSelectedProductId(product.id)}
                className={cn(
                  'w-full text-left grid gap-4 px-4 py-3 items-center',
                  gridCols,
                  'border-b border-border hover:bg-surface-muted transition-colors',
                  'focus:outline-none focus:bg-primary-subtle',
                  selectedProductId === product.id && 'bg-primary-subtle',
                )}
              >
                {(() => {
                  const thumb = resolveProductPhotoUrl(product.photo_url, product.name)
                  return thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-8 w-8 rounded object-contain object-center bg-surface-muted p-0.5"
                    />
                  ) : (
                    <span
                      className="h-8 w-8 rounded bg-surface-muted flex-shrink-0"
                      aria-hidden="true"
                    />
                  )
                })()}
                <span className="text-sm font-medium text-text-primary truncate flex flex-col min-w-0">
                  <span className="truncate flex items-center gap-2">
                    <span className="truncate">{product.name}</span>
                    {!product.is_active && <ActiveBadge isActive={false} />}
                  </span>
                  {(() => {
                    const serials = (product.units ?? [])
                      .map((u) => u.serial_number)
                      .filter(Boolean)
                    if (serials.length === 0) return null
                    return (
                      <span className="text-[10px] font-mono text-text-muted truncate">
                        {serials.join(' · ')}
                      </span>
                    )
                  })()}
                </span>
                <span className="text-sm text-text-secondary truncate min-w-0">
                  {product.category_name}
                </span>
                {showDepotColumn && (
                  <span className="text-sm text-text-secondary truncate min-w-0">
                    {depotName(product.depot_id)}
                  </span>
                )}
                <span className="text-sm tabular-nums text-right text-text-primary min-w-0">
                  {(() => {
                    const unit = primarySellingUnit(product.units)
                    return unit ? formatCFA(unit.selling_price_cfa) : '—'
                  })()}
                </span>
                <span className="text-sm font-semibold tabular-nums text-right text-text-primary">
                  {formatPieces(product.current_stock_pieces)}
                </span>
                <span className="min-w-0">
                  <StockStatusBadge status={getProductStockStatus(product)} />
                </span>
                <span className="text-sm text-text-secondary whitespace-nowrap">
                  {product.track_low_stock ? 'On' : 'Off'}
                </span>
                <span className="text-sm text-text-secondary whitespace-nowrap">
                  {formatDate(product.updated_at)}
                </span>
              </button>
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-sm text-text-secondary">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 h-8 text-sm rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 h-8 text-sm rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ProductDetailDrawer
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
      />
      <ProductFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        depotId={currentDepotId}
      />
    </div>
  )
}
