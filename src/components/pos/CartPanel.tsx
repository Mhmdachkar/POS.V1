import { useState } from 'react'
import { ShoppingCart, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '@/lib/cn'
import { Button, ConfirmDialog, EmptyState } from '@/components/ui'
import {
  BiButtonInline,
  BiButtonStack,
  BiEmptyDescription,
  BiEmptyTitle,
  BiModalTitle,
} from '@/lib/bilingual/ui'
import { POS } from '@/lib/bilingual/pos'
import { usePOSStore } from '@/stores/posStore'
import { CartItem } from './CartItem'
import { BilingualText } from '@/components/ui/BilingualText'

export interface CartPanelProps {
  className?: string
  /** Mobile: jump back to catalog from empty cart */
  onBrowseProducts?: () => void
}

export function CartPanel({ className, onBrowseProducts }: CartPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { items, clearCart } = usePOSStore(useShallow((s) => ({
    items: s.items,
    clearCart: s.clearCart,
  })))

  function handleClear() {
    if (items.length === 0) return
    if (items.length === 1) {
      clearCart()
      return
    }
    setConfirmOpen(true)
  }

  return (
    <div className={cn('flex flex-col min-h-0 overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-2 h-9 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ShoppingCart className="h-4 w-4 text-text-secondary flex-shrink-0" />
          <span
            className="text-sm font-semibold text-text-primary"
            data-cart-count={items.length}
          >
            <BilingualText {...POS.cartLines(items.length)} variant="body" layout="inline" />
          </span>
        </div>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-danger hover:text-danger hover:bg-danger-bg gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <BiButtonInline {...POS.clearCart} />
          </Button>
        )}
      </div>

      <div
        data-testid="cart-items"
        className="flex-1 min-h-0 overflow-y-auto px-4"
      >
        {items.length === 0 ? (
          <EmptyState
            className="py-6 items-start justify-start text-left px-0"
            icon={<ShoppingCart className="h-8 w-8" />}
            title={<BiEmptyTitle {...POS.emptyCartTitle} />}
            description={<BiEmptyDescription {...POS.emptyCartHint} />}
            action={
              onBrowseProducts ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="lg:hidden"
                  onClick={onBrowseProducts}
                >
                  <BiButtonInline {...POS.emptyCartBrowse} />
                </Button>
              ) : undefined
            }
          />
        ) : (
          items.map((item) => (
            <CartItem key={`${item.product_id}-${item.unit_level}`} item={item} />
          ))
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          clearCart()
          setConfirmOpen(false)
        }}
        title={<BiModalTitle {...POS.clearCartConfirmTitle} />}
        message={<BilingualText {...POS.clearCartConfirmMessage} variant="body" />}
        confirmLabel={<BiButtonStack {...POS.clearCartConfirm} />}
        variant="danger"
      />
    </div>
  )
}
