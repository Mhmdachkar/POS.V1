import { localizedUnitLabelForCount } from '@/lib/localizedUnits'
/**
 * ProductDetailDrawer — product identity, stock, units, activity, and actions.
 *
 * Depot is always the product's concrete depot_id.
 * Mutations receive product.id only. All Depots context is never read here.
 * Inactive products: Restock and Adjust are disabled with "Product is inactive".
 */

import { useState, type ReactNode } from 'react'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { ADMIN } from '@/lib/bilingual/admin'
import { COMMON } from '@/lib/bilingual/common'
import { BiModalTitle as BiSectionTitle, BiModalTitle } from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { PackagePlus, Pencil, SlidersHorizontal, UserCheck, UserX } from 'lucide-react'
import { ActiveBadge, Button, ConfirmDialog, Drawer, LoadingButton, Skeleton, StockStatusBadge } from '@/components/ui'
import { formatCFA, formatDateTime, formatPieces } from '@/lib/formatters'
import { getProductStockStatus } from '@/types'
import { useProductDetail } from '@/hooks/useProducts'
import {
  INACTIVE_PRODUCT_MESSAGE,
  packingRulesFromUnits,
  stockHierarchyBreakdown,
  primarySellingUnit,
  useCategories,
  useDepotOptions,
  useInventoryActivity,
} from '@/hooks/useInventory'
import { parseError } from '@/lib/errors'
import { hasDisplayableProductPhoto, resolveProductPhotoUrl } from '@/lib/productPhotos'
import { ProductPhotoFrame } from '@/components/pos/ProductPhotoFrame'
import { useDeactivateProduct, useReactivateProduct } from '@/hooks/useAdminProducts'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { STOCK_TXN_TYPE } from '@/lib/bilingual/inventory'
import { adjustmentTypeLabel } from '@/lib/auditPresentation'
import { RestockModal } from './RestockModal'
import { AdjustmentModal } from './AdjustmentModal'
import { ProductFormModal } from './ProductFormModal'
import { t } from '@/lib/bilingual/types'


function SectionHeader({ title }: { title: ReactNode }) {
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
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [adminError, setAdminError] = useState('')

  const isAdmin = useAuthStore((s) => s.staff?.role === 'admin')
  const currentDepotId = useDepotStore((s) => s.currentDepotId)
  const canMutateProduct = isAdmin && currentDepotId !== null
  const { mutateAsync: deactivateProduct, isPending: deactivating } = useDeactivateProduct()
  const { mutateAsync: reactivateProduct, isPending: reactivating } = useReactivateProduct()

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
        title={isLoading ? t(INVENTORY.productDetails) : (product?.name ?? t(INVENTORY.productDetails))}
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
          <p className="text-sm text-text-muted">{t(INVENTORY.noProducts)}</p>
        ) : (
          <div>
            {hasDisplayableProductPhoto(product.photo_url, product.name) && (
              <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden mb-4 border border-border">
                <ProductPhotoFrame
                  src={resolveProductPhotoUrl(product.photo_url, product.name)}
                  className="absolute inset-0 h-full rounded-lg"
                />
              </div>
            )}

            {(() => {
              const sellingUnit = primarySellingUnit(product.units)
              return (
                <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-text-primary truncate">{product.name}</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {categoryName} · {depotName}
                </p>
              </div>
              <ActiveBadge isActive={product.is_active} />
            </div>

            <SectionHeader title={<BiSectionTitle {...INVENTORY.stockSection} />} />
            <div className="rounded-xl border border-border bg-surface-muted p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-2xl font-bold tabular-nums text-text-primary">
                  {formatPieces(product.current_stock_pieces)}
                </p>
                <StockStatusBadge status={getProductStockStatus(product)} />
              </div>
              {sellingUnit && (
                <p className="mt-2 text-sm text-text-primary">
                  {formatCFA(sellingUnit.selling_price_cfa)}
                  <span className="text-text-secondary font-normal"> / {sellingUnit.unit_name}</span>
                </p>
              )}
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                <BilingualText {...INVENTORY.stockAsUnits} variant="caption" layout="inline" />
              </p>
              <div className="mt-1 space-y-1">
                {(() => {
                  const rows = stockHierarchyBreakdown(product.current_stock_pieces, product.units)
                  // Hide zero remainders (e.g. exact carton stock → only "10 Cartons").
                  const display = rows.filter((row) => Number(row.count) > 0)
                  if (display.length === 0) {
                    return (
                      <p className="text-xs text-text-secondary tabular-nums">
                        <span className="font-medium text-text-primary">{formatPieces(0)}</span>
                      </p>
                    )
                  }
                  return display.map((row) => {
                    const label = localizedUnitLabelForCount(row.count, row.unit_name, row.unit_level)
                    return (
                      <p key={row.unit_level} className="text-xs text-text-secondary tabular-nums">
                        <span className="font-medium text-text-primary">{row.count}</span>
                        {' '}
                        {label}
                      </p>
                    )
                  })
                })()}
              </div>
            </div>

            {(() => {
              const packing = packingRulesFromUnits(product.units)
              if (packing.piecesPerPackage == null && packing.packagesPerCarton == null) {
                return null
              }
              return (
                <>
                  <SectionHeader title={<BiSectionTitle {...INVENTORY.packingSection} />} />
                  <div className="rounded-xl border border-border bg-surface p-3 space-y-1.5">
                    {packing.piecesPerPackage != null && (
                      <p className="text-sm text-text-primary">
                        <BilingualText
                          {...INVENTORY.packingOnePackage(
                            packing.piecesPerPackage,
                            localizedUnitLabelForCount(packing.piecesPerPackage, packing.pieceName, 0),
                            localizedUnitLabelForCount(1, packing.packageName, 1),
                          )}
                          variant="body"
                          layout="inline"
                        />
                      </p>
                    )}
                    {packing.packagesPerCarton != null && packing.piecesPerCarton != null && (
                      <p className="text-sm text-text-primary">
                        <BilingualText
                          {...INVENTORY.packingOneCarton(
                            packing.packagesPerCarton,
                            localizedUnitLabelForCount(packing.packagesPerCarton, packing.packageName, 1),
                            packing.piecesPerCarton,
                            localizedUnitLabelForCount(packing.piecesPerCarton, packing.pieceName, 0),
                          )}
                          variant="body"
                          layout="inline"
                        />
                      </p>
                    )}
                  </div>
                </>
              )
            })()}

            {/* Serial numbers */}
            <SectionHeader title={<BiSectionTitle {...INVENTORY.serialNumbers} />} />
            <div className="space-y-0">
              {product.units.map((unit) => (
                <DetailRow
                  key={unit.id}
                  label={unit.unit_name}
                  value={
                    unit.serial_number ? (
                      <span className="font-mono text-xs bg-surface-muted px-2 py-0.5 rounded border border-border">
                        {unit.serial_number}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )
                  }
                />
              ))}
            </div>

            {/* Cost, price & profit per unit */}
            <SectionHeader title={<BiSectionTitle {...INVENTORY.costSection} />} />
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-text-secondary">
                      <BilingualText fr="Unité" en="Unit" variant="caption" layout="inline" />
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-text-secondary">
                      <BilingualText {...INVENTORY.costPrice} variant="caption" layout="inline" />
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-text-secondary">
                      <BilingualText {...INVENTORY.sellingPrice} variant="caption" layout="inline" />
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-text-secondary">
                      <BilingualText {...INVENTORY.profit} variant="caption" layout="inline" />
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-text-secondary">
                      <BilingualText {...INVENTORY.profitMargin} variant="caption" layout="inline" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {product.units.map((unit) => {
                    const profit = unit.selling_price_cfa - unit.cost_price_cfa
                    const margin = unit.selling_price_cfa > 0
                      ? Number(((profit / unit.selling_price_cfa) * 100).toFixed(2))
                      : null
                    return (
                      <tr key={unit.id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-text-primary">{unit.unit_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{formatCFA(unit.cost_price_cfa)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCFA(unit.selling_price_cfa)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${profit >= 0 ? 'text-success-foreground' : 'text-danger-foreground'}`}>
                          {profit >= 0 ? '+' : ''}{formatCFA(profit)}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${margin != null && margin >= 0 ? 'text-success-foreground' : 'text-danger-foreground'}`}>
                          {margin != null ? `${margin}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <SectionHeader title={<BiSectionTitle {...INVENTORY.monitoringSection} />} />
            <div className="space-y-0">
              <DetailRow
                label={t(INVENTORY.trackLowStock)}
                value={product.track_low_stock ? t(COMMON.yes) : t(COMMON.no)}
              />
              {product.track_low_stock && (
                <DetailRow
                  label={t(INVENTORY.threshold)}
                  value={
                    product.low_stock_threshold == null
                      ? '—'
                      : formatPieces(product.low_stock_threshold)
                  }
                />
              )}
            </div>
                </>
              )
            })()}

            <SectionHeader title={<BiSectionTitle {...INVENTORY.stockActivitySection} />} />
            {loadingActivity ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !activity || activity.length === 0 ? (
              <p className="text-sm text-text-muted">{t(INVENTORY.noMovements)}</p>
            ) : (
              <div className="space-y-px rounded-lg overflow-hidden border border-border">
                {activity.map((row) => {
                  const metaType = typeof row.metadata?.type === 'string' ? row.metadata.type : null
                  const metaReason = typeof row.metadata?.reason === 'string' ? row.metadata.reason : null
                  const positive = row.quantity_pieces > 0
                  const txnLabel = STOCK_TXN_TYPE[row.transaction_type as keyof typeof STOCK_TXN_TYPE]
                  return (
                    <div
                      key={row.id}
                      className="flex items-start justify-between gap-3 px-3 py-2 bg-surface border-b border-border last:border-0 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary">
                          {txnLabel ? t(txnLabel) : row.transaction_type}
                          {metaType ? ` · ${adjustmentTypeLabel(metaType)}` : ''}
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
                          positive ? 'text-success-foreground' : 'text-danger-foreground'
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
              {adminError && (
                <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
                  <p className="text-sm text-danger-foreground">{adminError}</p>
                </div>
              )}
              {canMutateProduct && (
                <Button variant="secondary" className="w-full gap-2" onClick={() => setShowEdit(true)}>
                  <Pencil className="h-4 w-4" />
                  {t(INVENTORY.editProduct)}
                </Button>
              )}
              <Button
                className="w-full gap-2"
                onClick={() => setShowRestock(true)}
                disabled={inactive}
                title={inactive ? INACTIVE_PRODUCT_MESSAGE : undefined}
              >
                <PackagePlus className="h-4 w-4" />
                {t(INVENTORY.restock)}
              </Button>
              <Button
                variant="secondary"
                className="w-full gap-2"
                onClick={() => setShowAdjust(true)}
                disabled={inactive}
                title={inactive ? INACTIVE_PRODUCT_MESSAGE : undefined}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {t(INVENTORY.adjustTitle)}
              </Button>
              {canMutateProduct && product.is_active && (
                <LoadingButton
                  variant="ghost"
                  className="w-full gap-2 text-warning-foreground hover:bg-warning-bg"
                  onClick={() => setConfirmDeactivate(true)}
                  loading={deactivating}
                >
                  <UserX className="h-4 w-4" />
                  <BilingualText fr="Désactiver le produit" en="Deactivate product" variant="body" layout="inline" />
                </LoadingButton>
              )}
              {canMutateProduct && !product.is_active && (
                <LoadingButton
                  variant="ghost"
                  className="w-full gap-2 text-success-foreground hover:bg-success-bg"
                  onClick={async () => {
                    setAdminError('')
                    try {
                      await reactivateProduct(product.id)
                    } catch (err) {
                      setAdminError(parseError(err).message)
                    }
                  }}
                  loading={reactivating}
                >
                  <UserCheck className="h-4 w-4" />
                  {t(INVENTORY.reactivateProduct)}
                </LoadingButton>
              )}
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
      {product && (
        <ProductFormModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          depotId={product.depot_id}
          product={product}
        />
      )}
      <ConfirmDialog
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={async () => {
          if (!product) return
          setAdminError('')
          try {
            await deactivateProduct(product.id)
            setConfirmDeactivate(false)
          } catch (err) {
            setAdminError(parseError(err).message)
            setConfirmDeactivate(false)
          }
        }}
        title={<BiModalTitle {...INVENTORY.deactivateProduct} />}
        message={t(INVENTORY.deactivateEvenWithStock)}
        confirmLabel={t(ADMIN.deactivate)}
        isLoading={deactivating}
      />
    </>
  )
}
