/**
 * ProductDetailDrawer — product identity, stock, units, activity, and actions.
 *
 * Depot is always the product's concrete depot_id.
 * Mutations receive product.id only. All Depots context is never read here.
 * Inactive products: Restock and Adjust are disabled with "Product is inactive".
 */

import { useState } from 'react'
import { PackagePlus, SlidersHorizontal } from 'lucide-react'
import { ActiveBadge, Button, Drawer, Skeleton, StockStatusBadge } from '@/components/ui'
import { formatCFA, formatDateTime, formatPieces } from '@/lib/formatters'
import { getStockStatus } from '@/types'
import { useProductDetail } from '@/hooks/useProducts'
import {
  INACTIVE_PRODUCT_MESSAGE,
  formatDerivedUnitQuantity,
  useCategories,
  useDepotOptions,
  useInventoryActivity,
} from '@/hooks/useInventory'
import { RestockModal } from './RestockModal'
import { AdjustmentModal } from './AdjustmentModal'

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mt-5 mb-2 first:mt-0">
      {title}
    </p>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary flex-shrink-0">{label}</span>
      <span className="text-sm text-text-primary text-right font-medium">{value}</span>
    </div>
  )
}

interface ProductDetailDrawerProps {
  productId: string | null
  onClose: () => void
}

export function ProductDetailDrawer({ productId, onClose }: ProductDetailDrawerProps) {
  const [showRestock, setShowRestock] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)

  const { data: product, isLoading } = useProductDetail(productId)
  const { data: activity, isLoading: loadingActivity } = useInventoryActivity(productId)
  const { data: categories } = useCategories()
  const { data: depots } = useDepotOptions()

  const categoryName =
    product
      ? (product.category_name ?? categories?.find((c) => c.id === product.category_id)?.name ?? '—')
      : '—'
  const depotName =
    product
      ? (depots?.find((d) => d.id === product.depot_id)?.name ?? '—')
      : '—'

  const inactive = !!product && !product.is_active

  return (
    <>
      <Drawer
        open={!!productId}
        onClose={onClose}
        title={isLoading ? 'Product Details' : (product?.name ?? 'Product Details')}
        description={inactive ? INACTIVE_PRODUCT_MESSAGE : undefined}
        width="lg"
      >
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : !product ? (
          <p className="text-sm text-text-muted">Product not found.</p>
        ) : (
          <div>
            <img
              src={product.photo_url}
              alt=""
              className="w-full h-32 rounded-lg object-cover bg-surface-muted mb-4"
            />

            <SectionHeader title="Product Info" />
            <div className="space-y-0">
              <DetailRow
                label="Name"
                value={
                  <span className="flex items-center justify-end gap-2">
                    {product.name}
                    <ActiveBadge isActive={product.is_active} />
                  </span>
                }
              />
              <DetailRow label="Category" value={categoryName} />
              <DetailRow label="Depot" value={depotName} />
              <DetailRow label="Updated" value={formatDateTime(product.updated_at)} />
            </div>

            <SectionHeader title="Current Stock" />
            <div className="rounded-xl border border-border bg-surface-muted p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-2xl font-bold tabular-nums text-text-primary">
                  {formatPieces(product.current_stock_pieces)}
                </p>
                <StockStatusBadge status={getStockStatus(product.current_stock_pieces)} />
              </div>
              <div className="mt-3 space-y-1">
                {product.units.map((unit) => (
                  <p key={unit.id} className="text-xs text-text-secondary tabular-nums">
                    {formatDerivedUnitQuantity(product.current_stock_pieces, unit.conversion_to_base)}{' '}
                    {unit.unit_name}
                    {formatDerivedUnitQuantity(product.current_stock_pieces, unit.conversion_to_base) !== 1 ? 's' : ''}
                    <span className="text-text-muted"> (display only)</span>
                  </p>
                ))}
              </div>
            </div>

            <SectionHeader title="Unit Prices" />
            <div className="space-y-px rounded-lg overflow-hidden border border-border">
              {product.units.map((unit) => (
                <div
                  key={unit.id}
                  className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border last:border-0 text-sm"
                >
                  <span className="font-medium text-text-primary">{unit.unit_name}</span>
                  <span className="text-text-secondary tabular-nums">
                    Cost {formatCFA(unit.cost_price_cfa)} · Selling {formatCFA(unit.selling_price_cfa)}
                  </span>
                </div>
              ))}
            </div>

            <SectionHeader title="Stock Activity" />
            {loadingActivity ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !activity || activity.length === 0 ? (
              <p className="text-sm text-text-muted">No activity yet.</p>
            ) : (
              <div className="space-y-px rounded-lg overflow-hidden border border-border">
                {activity.map((row) => {
                  const metaType = typeof row.metadata?.type === 'string' ? row.metadata.type : null
                  const metaReason = typeof row.metadata?.reason === 'string' ? row.metadata.reason : null
                  const positive = row.quantity_pieces > 0
                  return (
                    <div
                      key={row.id}
                      className="flex items-start justify-between gap-3 px-3 py-2 bg-surface border-b border-border last:border-0 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary">
                          {row.transaction_type}
                          {metaType ? ` · ${metaType}` : ''}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatDateTime(row.created_at)} · {row.staff_name ?? '—'}
                        </p>
                        {metaReason && (
                          <p className="text-xs text-text-secondary italic mt-0.5">{metaReason}</p>
                        )}
                      </div>
                      <span
                        className={`font-semibold tabular-nums flex-shrink-0 ${
                          positive ? 'text-success-foreground' : 'text-danger'
                        }`}
                      >
                        {positive ? '+' : ''}
                        {formatPieces(row.quantity_pieces)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-border space-y-2">
              {inactive && (
                <p className="text-sm text-warning-foreground">{INACTIVE_PRODUCT_MESSAGE}</p>
              )}
              <Button
                className="w-full gap-2"
                onClick={() => setShowRestock(true)}
                disabled={inactive}
                title={inactive ? INACTIVE_PRODUCT_MESSAGE : undefined}
              >
                <PackagePlus className="h-4 w-4" />
                Restock
              </Button>
              <Button
                variant="secondary"
                className="w-full gap-2"
                onClick={() => setShowAdjust(true)}
                disabled={inactive}
                title={inactive ? INACTIVE_PRODUCT_MESSAGE : undefined}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Adjust Inventory
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {product && (
        <RestockModal
          open={showRestock}
          onClose={() => setShowRestock(false)}
          product={product}
        />
      )}
      {product && (
        <AdjustmentModal
          open={showAdjust}
          onClose={() => setShowAdjust(false)}
          product={product}
        />
      )}
    </>
  )
}
