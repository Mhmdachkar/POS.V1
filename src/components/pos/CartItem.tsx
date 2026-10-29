import { useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { formatCFA, formatPieces } from '@/lib/formatters'
import { resolveProductPhotoUrl } from '@/lib/productPhotos'
import { tryUpdateCartQuantity } from '@/lib/posCartActions'
import { localizedUnitLabel } from '@/lib/localizedUnits'
import { maxQuantityInUnit, remainingPieces } from '@/lib/posCartStock'
import { POS } from '@/lib/bilingual/pos'
import { toastErrorBi } from '@/lib/bilingual/toast'
import { t, bilingualAriaLabel } from '@/lib/bilingual/types'
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
  const [qtyInvalid, setQtyInvalid] = useState(false)
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
    if (next < 0) {
      setQtyInvalid(true)
      return
    }
    setQtyInvalid(false)
    const result = tryUpdateCartQuantity(
      item.product_id,
      item.unit_level,
      next,
      available,
    )
    if (!result.ok) {
      if (result.reason === 'invalid_quantity') {
        setQtyInvalid(true)
        return
      }
      toastErrorBi(POS.remainingStock(result.remainingPieces))
    }
  }

  return (
    <div className="flex flex-col gap-2 py-2.5 border-b border-border last:border-0 sm:flex-row sm:items-center sm:gap-2 sm:py-1.5 sm:min-h-[52px]">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        {hasPhoto ? (
          <img
            src={photoSrc}
            alt=""
            width={36}
            height={36}
            onError={() => setPhotoFailed(true)}
            className="h-9 w-9 rounded-md object-contain object-center bg-surface-muted flex-shrink-0 p-0.5"
          />
        ) : (
          <div className="h-9 w-9 rounded-md bg-surface-muted flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{item.product_name}</p>
          <p className="text-xs text-text-secondary truncate">{localizedUnitLabel(item.unit_name, item.unit_level)}</p>
          {available != null && rem != null && (
            <p className="text-[10px] text-text-muted tabular-nums">
              <BilingualText {...POS.available} variant="caption" layout="inline" />{' '}
              {formatPieces(available)} ·{' '}
              <BilingualText {...POS.left} variant="caption" layout="inline" />{' '}
              {formatPieces(rem)}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-sm font-semibold financial-value text-text-primary tabular-nums">
            {formatCFA(item.line_total_cfa)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-text-muted hover:text-danger-foreground hover:bg-danger-bg sm:hidden"
            aria-label={bilingualAriaLabel(POS.removeFromCartAria(item.product_name))}
            onClick={() => removeItem(item.product_id, item.unit_level)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-1 flex-shrink-0 pl-11 sm:pl-0">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-10 w-10 sm:h-9 sm:w-9"
          aria-label={bilingualAriaLabel(POS.decreaseQtyAria(item.product_name))}
          onClick={() => applyQuantity(item.quantity_in_unit - 1)}
        >
          <Minus className="h-4 w-4" />
        </Button>

        <input
          type="number"
          min={1}
          value={item.quantity_in_unit}
          aria-label={bilingualAriaLabel(POS.qtyAria(item.product_name))}
          aria-invalid={qtyInvalid || undefined}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10)
            if (Number.isNaN(val)) return
            applyQuantity(val)
          }}
          className={cn(
            'w-12 h-10 sm:w-11 sm:h-9 text-center text-sm rounded-md border bg-surface',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            'text-text-primary',
            qtyInvalid ? 'border-danger' : 'border-border',
          )}
        />

        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-10 w-10 sm:h-9 sm:w-9"
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

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex h-9 w-9 text-text-muted hover:text-danger-foreground hover:bg-danger-bg flex-shrink-0"
          aria-label={bilingualAriaLabel(POS.removeFromCartAria(item.product_name))}
          onClick={() => removeItem(item.product_id, item.unit_level)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
        {qtyInvalid && (
          <p role="status" className="text-[10px] text-danger-foreground">
            {t(POS.qtyInvalid)}
          </p>
        )}
      </div>
    </div>
  )
}
