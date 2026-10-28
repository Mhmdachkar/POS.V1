import { useState, useRef, useEffect, useLayoutEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { X, User, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatCFA } from '@/lib/formatters'
import { BilingualText } from '@/components/ui/BilingualText'
import { POS } from '@/lib/bilingual/pos'
import { bilingualAriaLabel } from '@/lib/bilingual/types'
import { useShallow } from 'zustand/react/shallow'
import { usePOSStore } from '@/stores/posStore'
import { CustomerDropdown } from '@/pages/pos/components/CustomerSelector'
import type { Customer } from '@/types/database'

/**
 * Compact POS customer picker. Store updates happen only on Walk-in /
 * customer selection — opening the overlay does not change checkout state.
 *
 * Dropdown is portaled + fixed so it is not clipped by POS overflow or
 * buried under TopBar (z-20).
 */
export function CustomerChip() {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const wrapperRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const { customer, isWalkIn, setCustomer, setWalkIn } = usePOSStore(useShallow((s) => ({
    customer: s.customer,
    isWalkIn: s.isWalkIn,
    setCustomer: s.setCustomer,
    setWalkIn: s.setWalkIn,
  })))

  useLayoutEffect(() => {
    if (!dropdownOpen || !wrapperRef.current) return

    function place() {
      const anchor = wrapperRef.current?.getBoundingClientRect()
      if (!anchor) return
      const gap = 4
      const maxH = 256
      const spaceBelow = window.innerHeight - anchor.bottom - gap
      const spaceAbove = anchor.top - gap
      const openDown = spaceBelow >= 160 || spaceBelow >= spaceAbove
      const height = Math.min(maxH, Math.max(120, openDown ? spaceBelow : spaceAbove))
      const width = Math.max(anchor.width, 280)
      let left = anchor.left
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8)
      }
      setPanelStyle({
        position: 'fixed',
        zIndex: 80,
        left,
        width,
        maxHeight: height,
        ...(openDown
          ? { top: anchor.bottom + gap }
          : { bottom: window.innerHeight - anchor.top + gap }),
      })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [dropdownOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (wrapperRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setDropdownOpen(false)
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  function handleSelectCustomer(c: Customer) {
    setCustomer(c)
    setDropdownOpen(false)
  }

  function handleSelectWalkIn() {
    setWalkIn(true)
    setDropdownOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative min-w-0 flex-1 sm:flex-none sm:min-w-[14rem]">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setDropdownOpen((v) => !v)}
          aria-label={bilingualAriaLabel(POS.selectCustomer)}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          className={cn(
            'flex-1 flex items-center gap-2 px-2.5 h-11 min-h-[44px] min-w-0',
            'rounded-md border text-sm transition-colors',
            dropdownOpen
              ? 'border-primary bg-surface'
              : customer
                ? 'border-primary/40 bg-primary-subtle'
                : 'border-border bg-surface-muted text-text-primary',
          )}
        >
          <User className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
          <span
            className={cn(
              'flex-1 truncate text-left',
              customer ? 'font-medium text-primary' : 'font-medium text-text-primary',
            )}
          >
            {customer ? (
              customer.name
            ) : (
              <BilingualText {...POS.walkIn} variant="body" layout="inline" />
            )}
          </span>
          {customer && customer.balance_owed_cfa > 0 && (
            <span className="text-xs text-text-secondary financial-value flex-shrink-0">
              {formatCFA(customer.balance_owed_cfa)}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-text-muted flex-shrink-0" />
        </button>

        {customer && (
          <button
            type="button"
            onClick={handleSelectWalkIn}
            aria-label={bilingualAriaLabel(POS.clearCustomer)}
            className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-text-muted hover:text-danger-foreground hover:bg-danger-bg transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {dropdownOpen &&
        createPortal(
          <div ref={panelRef} style={panelStyle} className="flex flex-col min-h-0">
            <CustomerDropdown
              onSelect={handleSelectCustomer}
              onSelectWalkIn={handleSelectWalkIn}
              onClose={() => setDropdownOpen(false)}
              isWalkIn={isWalkIn}
              selectedCustomerId={customer?.id ?? null}
              className="max-h-full h-full w-full"
            />
          </div>,
          document.body,
        )}
    </div>
  )
}
