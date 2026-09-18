import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { formatCFA } from '@/lib/formatters'
import { POS } from '@/lib/bilingual/pos'
import { bilingualAriaLabel } from '@/lib/bilingual/types'
import { canAddUnitQuantity } from '@/lib/posCartStock'
import type { CartLinePieces } from '@/lib/posCartStock'
import type { ProductUnit } from '@/types/database'

export interface UnitPickerPopoverProps {
  open: boolean
  productName: string
  units: ProductUnit[]
  anchorEl: HTMLElement | null
  onClose: () => void
  onSelect: (unit: ProductUnit) => void
  availablePieces?: number | null
  cartItems?: CartLinePieces[]
  productId?: string
}

/**
 * Portaled unit picker so the product grid's overflow does not clip it.
 */
export function UnitPickerPopover({
  open,
  productName,
  units,
  anchorEl,
  onClose,
  onSelect,
  availablePieces = null,
  cartItems = [],
  productId,
}: UnitPickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    function onPointer(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorEl?.contains(target)) return
      onClose()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, onClose, anchorEl])

  if (!open || !anchorEl) return null

  const rect = anchorEl.getBoundingClientRect()
  const estimatedHeight = 16 + units.length * 48
  const spaceBelow = window.innerHeight - rect.bottom
  const openAbove = spaceBelow < estimatedHeight + 8 && rect.top > spaceBelow
  const top = openAbove
    ? Math.max(8, rect.top - estimatedHeight - 6)
    : rect.bottom + 6
  const left = Math.min(
    Math.max(8, rect.left),
    window.innerWidth - Math.max(rect.width, 220) - 8,
  )

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={bilingualAriaLabel(POS.selectUnitAria(productName))}
      className={cn(
        'fixed z-50 min-w-[220px] rounded-lg border border-border bg-surface shadow-md p-1.5 space-y-1',
      )}
      style={{ top, left, width: Math.max(rect.width, 220) }}
    >
      {units.map((unit) => {
        const disabled =
          availablePieces != null &&
          productId != null &&
          !canAddUnitQuantity(
            availablePieces,
            cartItems,
            productId,
            unit.unit_level,
            unit.conversion_to_base,
            1,
          )
        return (
          <button
            key={unit.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return
              onSelect(unit)
            }}
            className={cn(
              'w-full h-11 px-3 rounded-md flex items-center justify-between gap-3',
              'text-sm text-text-primary',
              'focus:outline-none focus:ring-2 focus:ring-primary',
              disabled
                ? 'opacity-45 cursor-not-allowed'
                : 'hover:bg-primary-subtle',
            )}
          >
            <span className="font-medium truncate">{unit.unit_name}</span>
            <span className="financial-value text-sm flex-shrink-0">
              {formatCFA(unit.selling_price_cfa)}
            </span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
