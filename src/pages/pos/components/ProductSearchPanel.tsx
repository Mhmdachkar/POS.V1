/**
 * ProductSearchPanel — Left panel of the POS.
 *
 * Provides:
 * - Search input (debounced, 300ms)
 * - Product results grid
 * - Unit selector per product card
 * - Quantity input before adding to cart
 * - Clear stock/inactive indicators
 *
 * Business rules:
 * - Only active products shown (is_active = true)
 * - Only products in the current depot shown
 * - Stock is shown for cashier awareness; final validation is server-side
 * - No barcode/SKU fields
 */

import { useState, useRef, useCallback } from 'react'
import { Search, Package, Plus, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Input, Button, Skeleton, EmptyState } from '@/components/ui'
import { formatCFA, formatPieces } from '@/lib/formatters'
import { useProductSearch } from '@/hooks/useProducts'
import { usePOSStore } from '@/stores/posStore'
import type { ProductWithUnits } from '@/types'
import type { ProductUnit } from '@/types/database'

// ─────────────────────────────────────────────────────────────────
// AddToCartRow — unit selector + qty input inside product card
// ─────────────────────────────────────────────────────────────────

interface AddToCartRowProps {
  product: ProductWithUnits
  unit: ProductUnit
  onAdd: (unit: ProductUnit, qty: number) => void
}

function AddToCartRow({ product, unit, onAdd }: AddToCartRowProps) {
  const [qty, setQty] = useState(1)

  const insufficientStock = unit.conversion_to_base * qty > product.current_stock_pieces
  const outOfStock = product.current_stock_pieces <= 0

  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-xs text-text-secondary w-16 truncate">{unit.unit_name}</span>
      <span className="text-xs font-medium text-text-primary w-20 text-right">
        {formatCFA(unit.selling_price_cfa)}
      </span>
      <input
        type="number"
        min={1}
        step={1}
        value={qty}
        onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
        className={cn(
          'w-14 h-7 text-center text-xs rounded-md border bg-surface text-text-primary',
          'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
          insufficientStock ? 'border-danger text-danger' : 'border-border',
        )}
        disabled={outOfStock}
        aria-label={`Quantity for ${unit.unit_name}`}
      />
      <Button
        variant="primary"
        size="icon-sm"
        onClick={() => {
          onAdd(unit, qty)
          setQty(1)
        }}
        disabled={outOfStock || qty <= 0}
        aria-label={`Add ${qty} ${unit.unit_name} of ${product.name}`}
        title={outOfStock ? 'Out of stock' : `Add ${qty} ${unit.unit_name}`}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ProductCard
// ─────────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: ProductWithUnits
  onAddItem: (product: ProductWithUnits, unit: ProductUnit, qty: number) => void
}

function ProductCard({ product, onAddItem }: ProductCardProps) {
  const outOfStock = product.current_stock_pieces <= 0
  const lowStock = !outOfStock && product.current_stock_pieces <= 10

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg p-3',
        'hover:border-primary/40 hover:shadow-sm transition-all duration-150',
        outOfStock && 'opacity-60',
      )}
    >
      {/* Product header */}
      <div className="flex items-start gap-2 mb-2">
        <div className="w-8 h-8 rounded-md bg-surface-muted flex items-center justify-center flex-shrink-0">
          {product.photo_url ? (
            <img
              src={product.photo_url}
              alt={product.name}
              className="w-8 h-8 rounded-md object-cover"
            />
          ) : (
            <Package className="h-4 w-4 text-text-muted" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary leading-tight truncate">
            {product.name}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            {outOfStock ? (
              <span className="flex items-center gap-1 text-xs text-danger font-medium">
                <AlertTriangle className="h-3 w-3" />
                Out of stock
              </span>
            ) : lowStock ? (
              <span className="text-xs text-warning-foreground font-medium">
                Low: {formatPieces(product.current_stock_pieces)}
              </span>
            ) : (
              <span className="text-xs text-text-muted">
                {formatPieces(product.current_stock_pieces)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Unit rows */}
      <div className="space-y-1">
        {product.units.length === 0 ? (
          <p className="text-xs text-text-muted italic">No units configured</p>
        ) : (
          product.units.map((unit) => (
            <AddToCartRow
              key={unit.id}
              product={product}
              unit={unit}
              onAdd={(u, qty) => onAddItem(product, u, qty)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Loading skeleton grid
// ─────────────────────────────────────────────────────────────────

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-surface border border-border rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-7 w-full" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ProductSearchPanel (main export)
// ─────────────────────────────────────────────────────────────────

interface ProductSearchPanelProps {
  depotId: string | null
}

export function ProductSearchPanel({ depotId }: ProductSearchPanelProps) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const addItem = usePOSStore((s) => s.addItem)

  const { data: products, isLoading, isError } = useProductSearch(
    query,
    depotId,
    !!depotId, // only search when a depot is set
  )

  const handleAddItem = useCallback(
    (product: ProductWithUnits, unit: ProductUnit, qty: number) => {
      addItem({
        product_id: product.id,
        product_name: product.name,
        product_photo_url: product.photo_url,
        unit_level: unit.unit_level as 0 | 1 | 2,
        unit_name: unit.unit_name,
        quantity_in_unit: qty,
        unit_price_cfa: unit.selling_price_cfa,
        cost_price_cfa: unit.cost_price_cfa,
        conversion_to_base: unit.conversion_to_base,
      })
    },
    [addItem],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className={cn(
              'w-full h-10 pl-9 pr-4 rounded-md border border-border bg-surface',
              'text-sm text-text-primary placeholder:text-text-muted',
              'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
              'transition-colors duration-150',
            )}
            aria-label="Search products"
            autoComplete="off"
            autoFocus
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4">
        {!depotId ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="No depot selected"
            description="Select a depot to view products."
          />
        ) : isError ? (
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8" />}
            title="Failed to load products"
            description="Check your connection and try again."
          />
        ) : isLoading ? (
          <ProductGridSkeleton />
        ) : !products || products.length === 0 ? (
          <EmptyState
            icon={<Search className="h-8 w-8" />}
            title={query ? 'No products found' : 'No active products'}
            description={
              query
                ? `No products matching "${query}" in this depot.`
                : 'This depot has no active products with configured units.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddItem={handleAddItem}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
