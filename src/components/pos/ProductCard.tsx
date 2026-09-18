import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '@/lib/cn'
import { formatCFA } from '@/lib/formatters'
import { hasDisplayableProductPhoto, resolveProductPhotoUrl } from '@/lib/productPhotos'
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

export interface ProductCardProps {
  product: ProductWithUnits
  onAddItem: (product: ProductWithUnits, unit: ProductUnit, qty: number) => void
  onPhotoError?: () => void
}

function selectPresenceKey(productId: string) {
  return (items: { product_id: string; unit_name: string; quantity_in_unit: number }[]) => {
    const lines = items.filter((i) => i.product_id === productId)
    if (lines.length === 0) return ''
    if (lines.length === 1) return `one:${lines[0].quantity_in_unit}`
    return `multi:${lines.map((l) => `${l.unit_name} × ${l.quantity_in_unit}`).join(' · ')}`
  }
}

export function ProductCard({ product, onAddItem, onPhotoError }: ProductCardProps) {
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
  const outOfStock = status === 'out_of_stock'
  const lowStock = status === 'low_stock'
  const available = Number(product.current_stock_pieces)
  const remaining = remainingPieces(available, cartItems, product.id)
  const primaryUnit = product.units[0]
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

  if (!hasDisplayableProductPhoto(product.photo_url, product.name)) {
    return null
  }

  const photoSrc = resolveProductPhotoUrl(product.photo_url, product.name)
  const hasPhoto = Boolean(photoSrc) && !photoFailed

  if (!hasPhoto) {
    return null
  }
  const units = product.units
  const multiUnit = units.length > 1
  const displayUnits = multiUnit ? units.slice(0, 2) : units.slice(0, 1)
  const inCart = presence.kind !== 'none'
  const addDisabled = outOfStock || atStockLimit || units.length === 0

  function handleTap() {
    if (outOfStock || units.length === 0) return
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
          aria-label={product.name}
          disabled={addDisabled && units.length <= 1}
          onClick={handleTap}
          className={cn(
            'relative w-full h-full text-left overflow-hidden rounded-xl',
            'bg-surface border transition-all duration-150 ease-out',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
            'hover:shadow-sm active:scale-[0.99]',
            outOfStock || (atStockLimit && units.length <= 1)
              ? 'opacity-55 border-border cursor-not-allowed'
              : inCart
                ? 'border-primary/40 ring-1 ring-primary/15'
                : 'border-border/80 hover:border-primary/30',
          )}
        >
          <div className="relative aspect-[5/4] w-full border-b border-border/50">
            <ProductPhotoFrame
              src={photoSrc}
              onError={() => {
                setPhotoFailed(true)
                onPhotoError?.()
              }}
              className="absolute inset-0"
              interactive
            />

            {!outOfStock && !atStockLimit && (
              <span
                className={cn(
                  'absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full',
                  'bg-surface/95 text-primary shadow-sm border border-border/60',
                  'opacity-0 scale-90 transition-all duration-150',
                  'group-hover/card:opacity-100 group-hover/card:scale-100',
                  'group-focus-within/card:opacity-100 group-focus-within/card:scale-100',
                  // Touch devices have no hover — keep the affordance visible on small screens
                  'max-lg:opacity-100 max-lg:scale-100',
                )}
                aria-hidden="true"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            )}

            {presence.kind === 'one' && (
              <span className="absolute top-1 right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                ×{presence.qty}
              </span>
            )}
            {presence.kind === 'multi' && (
              <Tooltip.Root delayDuration={200}>
                <Tooltip.Trigger asChild>
                  <span className="absolute top-1 right-1 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center">
                    <BilingualText {...POS.inCartBadge} variant="caption" layout="inline" />
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
              <span className="absolute top-1 left-1 px-1 py-px rounded text-[9px] font-semibold uppercase bg-warning/90 text-white">
                <BilingualText {...POS.lowBadge} variant="caption" layout="inline" />
              </span>
            )}
          </div>

          <div className="px-2 py-1.5 space-y-1">
            <p className="text-xs font-semibold text-text-primary leading-tight line-clamp-2">
              {product.name}
            </p>

            {outOfStock ? (
              <p className="text-[10px] font-medium text-danger-foreground">
                <BilingualText {...POS.outOfStock} variant="caption" layout="inline" />
              </p>
            ) : primaryUnit ? (
              <div className="space-y-1">
                <div className="flex flex-wrap gap-1">
                  {displayUnits.map((unit) => (
                    <span
                      key={unit.id}
                      className="inline-flex items-center gap-1 rounded-md bg-surface-muted border border-border/60 px-1.5 py-0.5 max-w-full min-w-0"
                    >
                      <span className="text-[9px] font-medium uppercase text-text-muted truncate">
                        {unit.unit_name}
                      </span>
                      <span className="text-[10px] font-bold text-text-primary financial-value whitespace-nowrap">
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
