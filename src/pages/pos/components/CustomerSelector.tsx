/**
 * CustomerSelector — Walk-in / existing customer / create customer picker.
 *
 * Renders inside the checkout panel. Allows the cashier to:
 *   1. Select Walk-in (customer_id = null)
 *   2. Search and select an existing customer
 *   3. Create a new customer inline
 *
 * The selected customer's current balance is shown as a read-only reference.
 * Balance is NOT a payment method — it is shown only for cashier awareness.
 */

import { useState, useRef, useEffect } from 'react'
import { Search, X, User, UserPlus, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button, LoadingButton } from '@/components/ui'
import { formatCFA } from '@/lib/formatters'
import { useCustomerSearch, useCreateCustomer } from '@/hooks/useCustomers'
import { useShallow } from 'zustand/react/shallow'
import { usePOSStore } from '@/stores/posStore'
import type { Customer } from '@/types/database'

// ─────────────────────────────────────────────────────────────────
// CreateCustomerForm — inline inside the dropdown
// ─────────────────────────────────────────────────────────────────

interface CreateCustomerFormProps {
  onCreated: (customer: Customer) => void
  onCancel: () => void
  initialName?: string
}

function CreateCustomerForm({ onCreated, onCancel, initialName = '' }: CreateCustomerFormProps) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [nameError, setNameError] = useState('')
  const { mutateAsync, isPending } = useCreateCustomer()
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError('Name is required')
      return
    }
    setNameError('')
    try {
      const result = await mutateAsync({
        p_name:  name.trim(),
        p_phone: phone.trim() || null,
      })
      // Map CreateCustomerResult to the Customer shape expected by the POS store
      onCreated({
        id:               result.id,
        name:             result.name,
        phone:            result.phone,
        address:          result.address ?? null,
        balance_owed_cfa: result.balance_owed_cfa,
        is_active:        result.is_active,
        deactivated_at:   null,
        created_by:       '',
        created_at:       result.created_at,
        updated_at:       result.updated_at,
      })
    } catch {
      setNameError('Failed to create customer. Try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-border space-y-2">
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">New Customer</p>
      <div>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setNameError('') }}
          placeholder="Full name *"
          className={cn(
            'w-full h-8 px-3 text-sm rounded-md border bg-surface text-text-primary',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            nameError ? 'border-danger' : 'border-border',
          )}
        />
        {nameError && <p className="text-xs text-danger mt-0.5">{nameError}</p>}
      </div>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone (optional)"
        className="w-full h-8 px-3 text-sm rounded-md border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <LoadingButton type="submit" size="sm" className="flex-1" loading={isPending}>
          Create
        </LoadingButton>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────
// CustomerDropdown — the search + results panel
// ─────────────────────────────────────────────────────────────────

interface CustomerDropdownProps {
  onSelect: (customer: Customer) => void
  onClose: () => void
}

function CustomerDropdown({ onSelect, onClose }: CustomerDropdownProps) {
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // activeOnly=true: inactive customers cannot be selected for new sales at POS.
  // Backend enforces this too (complete_sale rejects inactive customer_id).
  const { data: customers, isLoading } = useCustomerSearch(query, !showCreate, true)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleCreated = (customer: Customer) => {
    onSelect(customer)
  }

  return (
    <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full h-8 pl-7 pr-3 text-sm rounded-md border border-border bg-surface-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
          />
        </div>
      </div>

      {/* Results */}
      <div className="max-h-52 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 text-sm text-text-muted text-center">Searching…</div>
        ) : !customers || customers.length === 0 ? (
          <div className="p-3 text-sm text-text-muted text-center">
            {query ? 'No customers found' : 'Type to search customers'}
          </div>
        ) : (
          customers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              className="w-full text-left px-3 py-2 hover:bg-surface-muted flex items-center justify-between gap-2 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
                {c.phone && (
                  <p className="text-xs text-text-muted">{c.phone}</p>
                )}
              </div>
              {c.balance_owed_cfa > 0 && (
                <span className="text-xs font-medium text-danger flex-shrink-0">
                  Owes {formatCFA(c.balance_owed_cfa)}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Create customer / Walk-in buttons */}
      {showCreate ? (
        <CreateCustomerForm
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
          initialName={query}
        />
      ) : (
        <div className="p-2 border-t border-border flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => setShowCreate(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            New Customer
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CustomerSelector (main export)
// ─────────────────────────────────────────────────────────────────

export function CustomerSelector() {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { customer, isWalkIn, setCustomer, setWalkIn } = usePOSStore(useShallow((s) => ({
    customer: s.customer,
    isWalkIn: s.isWalkIn,
    setCustomer: s.setCustomer,
    setWalkIn: s.setWalkIn,
  })))

  // Close dropdown on outside click
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

  const handleSelectCustomer = (c: Customer) => {
    setCustomer(c)
    setDropdownOpen(false)
  }

  const handleClearCustomer = () => {
    setWalkIn(true)
    setDropdownOpen(false)
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
        Customer
      </label>

      <div ref={wrapperRef} className="relative">
        {/* Mode toggle: Walk-in vs Named customer */}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => { setWalkIn(true); setDropdownOpen(false) }}
            className={cn(
              'flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium transition-colors',
              isWalkIn
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-muted text-text-secondary border border-border hover:bg-surface',
            )}
          >
            <User className="h-3.5 w-3.5" />
            Walk-in
          </button>

          {customer ? (
            // Selected customer chip
            <div className="flex-1 flex items-center gap-2 px-3 h-9 rounded-md border border-primary/40 bg-primary-subtle text-sm">
              <span className="flex-1 font-medium text-primary truncate">{customer.name}</span>
              {customer.balance_owed_cfa > 0 && (
                <span className="text-xs text-danger flex-shrink-0 font-medium">
                  Owes {formatCFA(customer.balance_owed_cfa)}
                </span>
              )}
              <button
                type="button"
                onClick={handleClearCustomer}
                aria-label="Clear customer"
                className="text-text-secondary hover:text-danger transition-colors flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            // Open search button
            <button
              type="button"
              onClick={() => { setDropdownOpen((v) => !v); setWalkIn(false) }}
              className={cn(
                'flex-1 flex items-center justify-between gap-2 px-3 h-9',
                'rounded-md border text-sm transition-colors',
                !isWalkIn && dropdownOpen
                  ? 'border-primary bg-surface'
                  : 'border-border bg-surface text-text-secondary hover:border-primary/40',
              )}
            >
              <span>Select customer…</span>
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {dropdownOpen && !customer && (
          <CustomerDropdown
            onSelect={handleSelectCustomer}
            onClose={() => setDropdownOpen(false)}
          />
        )}
      </div>
    </div>
  )
}
