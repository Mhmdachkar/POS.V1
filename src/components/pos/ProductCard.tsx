import { useRef, useState } from 'react'
import { Package, Plus } from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '@/lib/cn'
import { formatCFA } from '@/lib/formatters'
import { resolveProductPhotoUrl } from '@/lib/productPhotos'
import { canAddProductUnit } from '@/lib/posCartActions'
import { remainingPieces } from '@/lib/posCartStock'
import { getProductStockStatus } from '@/types'
import { usePOSStore } from '@/stores/posStore'
import { UnitPickerPopover } from './UnitPickerPopover'
import { ProductPhotoFrame } from './ProductPhotoFrame'
import { BilingualText } from '@/components/ui/BilingualText'
import { POS } from '@/lib/bilingual/pos'
import type { ProductWithUnits } from '@/types'
import type { ProductUnit } from '@/types/database'
import { localizedUnitLabel, productInitials } from '@/lib/localizedUnits'


export interface ProductCardProps {
  product: ProductWithUnits
  onAddItem: (product: ProductWithUnits, unit: ProductUnit, qty: number) => void
}

function selectPresenceKey(productId: string) {
  return (items: { product_id: string; unit_name: string; quantity_in_unit: number }[]) => {
    const lines = items.filter((i) => i.product_id === productId)
    if (lines.length === 0) return ''
    if (lines.length === 1) return `one:${lines[0].quantity_in_unit}`
    return `multi:${lines.map((l) => `${l.unit_name} × ${l.quantity_in_unit}`).join(' · ')}`
  }
}

function primarySerial(product: ProductWithUnits): string | null {
  const units = product.units ?? []
  const piece = units.find((u) => u.unit_level === 0)
  const serial = (piece ?? units[0])?.serial_number?.trim()
  return serial || null
}

export function ProductCard({ product, onAddItem }: ProductCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [photoFailed, setPhotoFailed] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const cartItems = usePOSStore((s) => s.items)
  const presenceKey = usePOSStore((s) => selectPresenceKey(product.id)(s.items))
  const presence =
    presenceKey === ''
      ? { kind: 'none' as const }
      : presenceKey.startsWith('one:')
        ? { kind: 'one' as const, qty: Number(presenceKey.slice(4)) }
        : { kind: 'multi' as const, tooltip: presenceKey.slice(6) }

  const status = getProductStockStatus(product)
  const available = Number(product.current_stock_pieces)
  // POS: zero on-hand is always Rupture + not sellable (alerts/reports still use track_low_stock).
  const outOfStock = available <= 0 || status === 'out_of_stock'
  const lowStock = !outOfStock && status === 'low_stock'
  const remaining = remainingPieces(available, cartItems, product.id)
  const primaryUnit = product.units[0]
  const serial = primarySerial(product)
  const canAddPrimary =
    !outOfStock &&
    !!primaryUnit &&
    canAddProductUnit(
      product.id,
      primaryUnit.unit_level,
      primaryUnit.conversion_to_base,
      available,
      1,
    )
  const atStockLimit = !outOfStock && remaining <= 0

  const photoSrc = resolveProductPhotoUrl(product.photo_url, product.name)
  const showPhoto = Boolean(photoSrc) && !photoFailed

  const units = product.units
  const multiUnit = units.length > 1
  const displayUnits = multiUnit ? units.slice(0, 2) : units.slice(0, 1)
  const inCart = presence.kind !== 'none'
  const addDisabled = outOfStock || atStockLimit || units.length === 0

  function handleTap() {
    if (outOfStock || atStockLimit || units.length === 0) return
    if (units.length === 1) {
      if (!canAddPrimary) return
      onAddItem(product, units[0], 1)
      return
    }
    setPickerOpen(true)
  }

  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="relative h-full group/card">
        <button
          ref={buttonRef}
          type="button"
          aria-label={serial ? `${product.name} (${serial})` : product.name}
          disabled={outOfStock || (addDisabled && units.length <= 1)}
          onClick={handleTap}
          className={cn(
            'relative w-full h-full min-h-full text-left overflow-hidden rounded-xl flex flex-col',
            'bg-surface border transition-all duration-150 ease-out',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
            'hover:shadow-sm active:scale-[0.99]',
            outOfStock
              ? 'border-border cursor-not-allowed'
              : atStockLimit && units.length <= 1
                ? 'opacity-55 border-border cursor-not-allowed'
                : inCart
                  ? 'border-primary/40 ring-1 ring-primary/15'
                  : 'border-border/80 hover:border-primary/30',
          )}
        >
          <div
            className={cn(
              'relative aspect-[5/4] w-full border-b border-border/50',
              outOfStock && 'opacity-55',
            )}
          >
            {showPhoto ? (
              <ProductPhotoFrame
                src={photoSrc}
                onError={() => setPhotoFailed(true)}
                className="absolute inset-0"
                interactive
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-surface-muted px-2">
                <Package className="h-8 w-8 text-text-muted/70" strokeWidth={1.5} />
                <span className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                  {productInitials(product.name)}
                </span>
              </div>
            )}

            {!outOfStock && !atStockLimit && (
              <span
                className={cn(
                  'absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full',
                  'bg-surface/95 text-primary shadow-sm border border-border/60',
                  'opacity-0 scale-90 transition-all duration-150',
                  'group-hover/card:opacity-100 group-hover/card:scale-100',
                  'group-focus-within/card:opacity-100 group-focus-within/card:scale-100',
                  'max-lg:opacity-100 max-lg:scale-100',
                )}
                aria-hidden="true"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            )}

            {presence.kind === 'one' && (
              <span className="absolute top-1.5 right-1.5 min-w-[1.375rem] h-[22px] px-1.5 rounded-full bg-surface text-primary border border-primary text-xs font-bold flex items-center justify-center">
                ×{presence.qty}
              </span>
            )}
            {presence.kind === 'multi' && (
              <Tooltip.Root delayDuration={200}>
                <Tooltip.Trigger asChild>
                  <span className="absolute top-1.5 right-1.5 h-[22px] px-1.5 rounded-full bg-surface text-primary border border-primary text-[11px] font-semibold flex items-center">
                    <BilingualText
                      {...POS.inCartBadge}
                      variant="caption"
                      layout="inline"
                      frClassName="text-[11px] text-primary"
                    />
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="top"
                    className="z-50 px-2 py-1 rounded-md text-xs bg-text-primary text-white shadow-md"
                  >
                    {presence.tooltip}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            )}

            {lowStock && !outOfStock && (
              <span className="absolute top-1 left-1 px-1 py-px rounded text-[11px] font-semibold uppercase bg-warning-bg text-warning-foreground">
                <BilingualText
                  {...POS.lowBadge}
                  variant="caption"
                  layout="inline"
                  frClassName="text-[11px] font-semibold uppercase text-warning-foreground"
                />
              </span>
            )}
          </div>

          <div className="px-2.5 py-2 space-y-1.5 flex-1 flex flex-col">
            <p className="text-product-name text-text-primary leading-tight line-clamp-2">
              {product.name}
            </p>
            {serial && (
              <p className="text-xs font-mono text-text-muted truncate" title={serial}>
                {serial}
              </p>
            )}

            {outOfStock ? (
              <p className="text-[11px] font-medium text-danger-foreground">
                <BilingualText
                  {...POS.outOfStock}
                  variant="caption"
                  layout="inline"
                  frClassName="text-[11px] font-medium text-danger-foreground"
                />
              </p>
            ) : primaryUnit ? (
              <div className="space-y-1">
                <div className="flex flex-wrap gap-1">
                  {displayUnits.map((unit) => (
                    <span
                      key={unit.id}
                      className="inline-flex items-center gap-1 rounded-md bg-surface-muted border border-border/60 px-1.5 py-0.5 max-w-full min-w-0"
                    >
                      <span className="text-[11px] font-medium text-text-muted whitespace-normal break-words leading-tight">
                        {localizedUnitLabel(unit.unit_name, unit.unit_level)}
                      </span>
                      <span className="text-product-price text-text-primary financial-value whitespace-nowrap">
                        {formatCFA(unit.selling_price_cfa)}
                      </span>
                    </span>
                  ))}
                  {multiUnit && units.length > 2 && (
                    <span className="text-[9px] text-text-muted self-center">+{units.length - 2}</span>
                  )}
                </div>
                {(inCart || remaining <= 5) && (
                  <p className="text-[10px] text-text-secondary tabular-nums">
                    {atStockLimit ? (
                      <BilingualText {...POS.atMax} variant="caption" layout="inline" />
                    ) : (
                      <BilingualText {...POS.leftCount(remaining)} variant="caption" layout="inline" />
                    )}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </button>

        {multiUnit && (
          <UnitPickerPopover
            open={pickerOpen}
            productName={product.name}
            units={units}
            availablePieces={available}
            cartItems={cartItems}
            productId={product.id}
            anchorEl={buttonRef.current}
            onClose={() => setPickerOpen(false)}
            onSelect={(unit) => {
              if (
                !canAddProductUnit(
                  product.id,
                  unit.unit_level,
                  unit.conversion_to_base,
                  available,
                  1,
                )
              ) {
                return
              }
              onAddItem(product, unit, 1)
              setPickerOpen(false)
            }}
          />
        )}
      </div>
    </Tooltip.Provider>
  )
}
