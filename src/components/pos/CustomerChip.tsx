import { useState, useRef, useEffect } from 'react'
import { X, User, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatCFA } from '@/lib/formatters'
import { BilingualText } from '@/components/ui/BilingualText'
import { POS } from '@/lib/bilingual/pos'
import { t, bilingualAriaLabel } from '@/lib/bilingual/types'
import { useShallow } from 'zustand/react/shallow'
import { usePOSStore } from '@/stores/posStore'
import { CustomerDropdown } from '@/pages/pos/components/CustomerSelector'
import type { Customer } from '@/types/database'

/**
 * Compact POS customer picker. Store updates happen only on Walk-in /
 * customer selection — opening the overlay does not change checkout state.
 */
export function CustomerChip() {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { customer, isWalkIn, setCustomer, setWalkIn } = usePOSStore(useShallow((s) => ({
    customer: s.customer,
    isWalkIn: s.isWalkIn,
    setCustomer: s.setCustomer,
    setWalkIn: s.setWalkIn,
  })))

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
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
    <div ref={wrapperRef} className="relative z-30">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setDropdownOpen((v) => !v)}
          aria-label={bilingualAriaLabel(POS.selectCustomer)}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          className={cn(
            'flex-1 flex items-center gap-2 px-2.5 h-9 min-w-0',
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
            className="h-9 w-9 flex items-center justify-center rounded-md text-text-muted hover:text-danger hover:bg-danger-bg transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {dropdownOpen && (
        <CustomerDropdown
          onSelect={handleSelectCustomer}
          onSelectWalkIn={handleSelectWalkIn}
          onClose={() => setDropdownOpen(false)}
          isWalkIn={isWalkIn}
          selectedCustomerId={customer?.id ?? null}
        />
      )}
    </div>
  )
}
