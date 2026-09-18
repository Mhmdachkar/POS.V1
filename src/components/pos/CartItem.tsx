import { useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { formatCFA, formatPieces } from '@/lib/formatters'
import { resolveProductPhotoUrl } from '@/lib/productPhotos'
import { tryUpdateCartQuantity } from '@/lib/posCartActions'
import { maxQuantityInUnit, remainingPieces } from '@/lib/posCartStock'
import { POS } from '@/lib/bilingual/pos'
import { toastErrorBi } from '@/lib/bilingual/toast'
import { bilingualAriaLabel } from '@/lib/bilingual/types'
import { usePosCatalogStock } from '@/hooks/usePosCatalogStock'
import { useProductDetail } from '@/hooks/useProducts'
import { usePOSStore } from '@/stores/posStore'
import { UnitChangeSelect } from './UnitChangeSelect'
import type { CartItem as CartItemType } from '@/types'

export interface CartItemProps {
  item: CartItemType
}

export function CartItem({ item }: CartItemProps) {
  const removeItem = usePOSStore((s) => s.removeItem)
  const cartItems = usePOSStore((s) => s.items)
  const { getAvailablePieces } = usePosCatalogStock()
  const { data: productDetail } = useProductDetail(item.product_id)
  const [photoFailed, setPhotoFailed] = useState(false)
  const photoSrc = resolveProductPhotoUrl(item.product_photo_url, item.product_name)
  const hasPhoto = Boolean(photoSrc) && !photoFailed

  const available =
    getAvailablePieces(item.product_id) ??
    (productDetail != null ? Number(productDetail.current_stock_pieces) : null)

  const maxQty =
    available == null
      ? null
      : maxQuantityInUnit(
          available,
          cartItems,
          item.product_id,
          item.unit_level,
          item.conversion_to_base,
        )
  const atMax = maxQty != null && item.quantity_in_unit >= maxQty
  const rem =
    available == null ? null : remainingPieces(available, cartItems, item.product_id)

  function applyQuantity(next: number) {
    const result = tryUpdateCartQuantity(
      item.product_id,
      item.unit_level,
      next,
      available,
    )
    if (!result.ok) {
      toastErrorBi(POS.remainingStock(result.remainingPieces))
      if (maxQty != null && maxQty > 0) {
        tryUpdateCartQuantity(item.product_id, item.unit_level, maxQty, available)
      }
    }
  }

  return (
    <div className="flex items-center gap-2 py-1.5 min-h-[52px] border-b border-border last:border-0">
      {hasPhoto ? (
        <img
          src={photoSrc}
          alt=""
          width={32}
          height={32}
          onError={() => setPhotoFailed(true)}
          className="h-8 w-8 rounded-md object-contain object-center bg-surface-muted flex-shrink-0 p-0.5"
        />
      ) : (
        <div className="h-8 w-8 rounded-md bg-surface-muted flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary truncate">{item.product_name}</p>
        <p className="text-xs text-text-secondary truncate">{item.unit_name}</p>
        {available != null && rem != null && (
          <p className="text-[10px] text-text-muted tabular-nums">
            <BilingualText {...POS.available} variant="caption" layout="inline" />{' '}
            {formatPieces(available)} ·{' '}
            <BilingualText {...POS.left} variant="caption" layout="inline" />{' '}
            {formatPieces(rem)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-9 w-9"
          aria-label={bilingualAriaLabel(POS.decreaseQtyAria(item.product_name))}
          onClick={() => applyQuantity(item.quantity_in_unit - 1)}
        >
          <Minus className="h-4 w-4" />
        </Button>

        <input
          type="number"
          min={1}
          max={maxQty ?? undefined}
          value={item.quantity_in_unit}
          aria-label={bilingualAriaLabel(POS.qtyAria(item.product_name))}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10)
            if (!Number.isNaN(val) && val > 0) {
              applyQuantity(val)
            }
          }}
          className={cn(
            'w-11 h-9 text-center text-sm rounded-md border border-border bg-surface',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            'text-text-primary',
          )}
        />

        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-9 w-9"
          aria-label={bilingualAriaLabel(POS.increaseQtyAria(item.product_name))}
          disabled={atMax}
          onClick={() => {
            if (atMax) return
            applyQuantity(item.quantity_in_unit + 1)
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>

        <UnitChangeSelect
          productId={item.product_id}
          currentUnitLevel={item.unit_level}
          productName={item.product_name}
          availablePieces={available}
        />
      </div>

      <span className="text-sm font-semibold financial-value text-text-primary flex-shrink-0 w-[5.5rem] text-right">
        {formatCFA(item.line_total_cfa)}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-text-muted hover:text-danger hover:bg-danger-bg flex-shrink-0"
        aria-label={bilingualAriaLabel(POS.removeFromCartAria(item.product_name))}
        onClick={() => removeItem(item.product_id, item.unit_level)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
