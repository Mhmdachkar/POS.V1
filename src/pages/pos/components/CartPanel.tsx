/**
 * CartPanel — Right panel: cart items list with quantity controls.
 *
 * Shows all items in the cart with:
 *   - Product name, unit, unit price
 *   - Quantity controls (-, qty input, +)
 *   - Line total (display preview only)
 *   - Remove button
 *   - Clear all button
 *
 * Cart items auto-merge by product+unit when the same combo is added.
 */

import { useRef } from 'react'
import { Trash2, Minus, Plus, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button, EmptyState } from '@/components/ui'
import { formatCFA } from '@/lib/formatters'
import { useShallow } from 'zustand/react/shallow'
import { usePOSStore } from '@/stores/posStore'
import type { CartItem } from '@/types'

// ─────────────────────────────────────────────────────────────────
// CartItemRow
// ─────────────────────────────────────────────────────────────────

interface CartItemRowProps {
  item: CartItem
  onUpdateQty: (qty: number) => void
  onRemove: () => void
}

function CartItemRow({ item, onUpdateQty, onRemove }: CartItemRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value)
    if (!isNaN(val) && val > 0) onUpdateQty(val)
  }

  const handleQtyBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value)
    if (isNaN(val) || val <= 0) {
      e.target.value = String(item.quantity_in_unit)
    }
  }

  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-border last:border-0">
      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{item.product_name}</p>
        <p className="text-xs text-text-secondary">
          {item.unit_name} · {formatCFA(item.unit_price_cfa)} each
        </p>
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => onUpdateQty(item.quantity_in_unit - 1)}
          className={cn(
            'h-6 w-6 rounded flex items-center justify-center',
            'text-text-secondary hover:text-danger hover:bg-danger-bg transition-colors',
            'focus:outline-none focus:ring-1 focus:ring-primary',
          )}
          aria-label={`Decrease quantity of ${item.product_name}`}
        >
          <Minus className="h-3 w-3" />
        </button>

        <input
          ref={inputRef}
          type="number"
          min={1}
          value={item.quantity_in_unit}
          onChange={handleQtyChange}
          onBlur={handleQtyBlur}
          className={cn(
            'w-12 h-6 text-center text-sm rounded border border-border bg-surface',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            'text-text-primary',
          )}
          aria-label={`Quantity: ${item.quantity_in_unit}`}
        />

        <button
          type="button"
          onClick={() => onUpdateQty(item.quantity_in_unit + 1)}
          className={cn(
            'h-6 w-6 rounded flex items-center justify-center',
            'text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors',
            'focus:outline-none focus:ring-1 focus:ring-primary',
          )}
          aria-label={`Increase quantity of ${item.product_name}`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Line total */}
      <div className="w-24 text-right flex-shrink-0">
        <span className="text-sm font-semibold text-text-primary">
          {formatCFA(item.line_total_cfa)}
        </span>
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          'h-6 w-6 rounded flex items-center justify-center flex-shrink-0',
          'text-text-muted hover:text-danger hover:bg-danger-bg transition-colors',
          'focus:outline-none focus:ring-1 focus:ring-danger',
        )}
        aria-label={`Remove ${item.product_name} from cart`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CartPanel (main export)
// ─────────────────────────────────────────────────────────────────

export function CartPanel() {
  const { items, updateQuantity, removeItem, clearCart, totals } = usePOSStore(useShallow((s) => ({
    items: s.items,
    updateQuantity: s.updateQuantity,
    removeItem: s.removeItem,
    clearCart: s.clearCart,
    totals: s.totals,
  })))

  return (
    <div className="flex flex-col h-full">
      {/* Cart header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">
            Cart
          </span>
          {items.length > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
              {items.length}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearCart}
            className="text-danger hover:text-danger hover:bg-danger-bg gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <ShoppingCart className="h-10 w-10 text-text-muted mb-3" />
            <p className="text-sm text-text-secondary font-medium">Cart is empty</p>
            <p className="text-xs text-text-muted mt-1">
              Search products and add them to the cart
            </p>
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <CartItemRow
                key={`${item.product_id}-${item.unit_level}`}
                item={item}
                onUpdateQty={(qty) => updateQuantity(item.product_id, item.unit_level, qty)}
                onRemove={() => removeItem(item.product_id, item.unit_level)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Cart subtotal (preview) */}
      {items.length > 0 && (
        <div className="px-4 py-3 border-t border-border flex-shrink-0 bg-surface-muted">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Subtotal</span>
            <span className="text-sm font-bold text-text-primary">
              {formatCFA(totals.subtotal_cfa)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
