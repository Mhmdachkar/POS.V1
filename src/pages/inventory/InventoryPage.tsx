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
import { Package, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ActiveBadge, EmptyState, Skeleton, StockStatusBadge } from '@/components/ui'
import { formatDate, formatPieces } from '@/lib/formatters'
import { getStockStatus, type StockStatus } from '@/types'
import {
  INVENTORY_PAGE_SIZE,
  useCategories,
  useDepotOptions,
  useInventoryList,
} from '@/hooks/useInventory'
import { useDepotStore } from '@/stores/depotStore'
import { ProductDetailDrawer } from './components/ProductDetailDrawer'

export function clampInventoryPage(page: number, totalPages: number): number {
  if (page <= 0) return 0
  if (totalPages === 0) return 0
  if (page >= totalPages) return totalPages - 1
  return page
}

type StockFilter = StockStatus | 'all'

const STOCK_FILTERS: Array<{ value: StockFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'healthy', label: 'Healthy' },
]

function TableSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 bg-surface border-b border-border">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20 ml-auto" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
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

  const currentDepotId = useDepotStore((s) => s.currentDepotId)
  const { data: categories } = useCategories()
  const { data: depots } = useDepotOptions()

  const showDepotColumn = currentDepotId === null

  useEffect(() => {
    setPage(0)
  }, [currentDepotId])

  const { data, isLoading, isError } = useInventoryList({
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

  useEffect(() => {
    if (isLoading) return
    const next = clampInventoryPage(page, totalPages)
    if (next !== page) setPage(next)
  }, [isLoading, page, totalPages])

  const depotName = (depotId: string) =>
    depots?.find((d) => d.id === depotId)?.name ?? '—'

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(0)
  }

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategoryId(e.target.value || null)
    setPage(0)
  }

  const handleStockFilter = (value: StockFilter) => {
    setStockStatus(value)
    setPage(0)
  }

  const gridCols = showDepotColumn
    ? 'grid-cols-[auto_1fr_auto_auto_auto_auto_auto]'
    : 'grid-cols-[auto_1fr_auto_auto_auto_auto]'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-text-primary">Inventory</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {totalCount > 0
                ? `${totalCount} product${totalCount !== 1 ? 's' : ''}`
                : 'Stock by product for this depot'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={handleSearchChange}
                placeholder="Search products…"
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
              <option value="">All Categories</option>
              {(categories ?? []).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-1.5 mt-3 overflow-x-auto">
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
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="Failed to load inventory"
              description="Check your connection and try again."
            />
          </div>
        ) : products.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="No products found"
              description={
                search || categoryId || stockStatus !== 'all'
                  ? 'No products match your filters.'
                  : 'No products in this inventory view.'
              }
            />
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border">
              <div className={cn('grid gap-4 px-4 py-2', gridCols)}>
                <span className="text-xs font-semibold text-text-secondary uppercase w-8" />
                <span className="text-xs font-semibold text-text-secondary uppercase">Product</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Category</span>
                {showDepotColumn && (
                  <span className="text-xs font-semibold text-text-secondary uppercase">Depot</span>
                )}
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">Stock</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Status</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Updated</span>
              </div>
            </div>

            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setSelectedProductId(product.id)}
                className={cn(
                  'w-full text-left grid gap-4 px-4 py-3',
                  gridCols,
                  'border-b border-border hover:bg-surface-muted transition-colors',
                  'focus:outline-none focus:bg-primary-subtle',
                  selectedProductId === product.id && 'bg-primary-subtle',
                )}
              >
                <img
                  src={product.photo_url}
                  alt=""
                  className="h-8 w-8 rounded object-cover bg-surface-muted"
                />
                <span className="text-sm font-medium text-text-primary truncate flex items-center gap-2 min-w-0">
                  <span className="truncate">{product.name}</span>
                  {!product.is_active && <ActiveBadge isActive={false} />}
                </span>
                <span className="text-sm text-text-secondary truncate">
                  {product.category_name}
                </span>
                {showDepotColumn && (
                  <span className="text-sm text-text-secondary truncate">
                    {depotName(product.depot_id)}
                  </span>
                )}
                <span className="text-sm font-semibold tabular-nums text-right text-text-primary">
                  {formatPieces(product.current_stock_pieces)}
                </span>
                <span>
                  <StockStatusBadge status={getStockStatus(product.current_stock_pieces)} />
                </span>
                <span className="text-sm text-text-secondary">
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
    </div>
  )
}
