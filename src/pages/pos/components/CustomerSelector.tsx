/**
 * CustomerSelector — POS customer search / create dropdown.
 *
 * Query and create behavior is unchanged: active-only search via
 * useCustomerSearch, optional inline create via useCreateCustomer.
 * Presentation is a compact overlay so PaymentPanel height does not change.
 */

import { useState, useRef, useEffect } from 'react'
import { Search, User, UserPlus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button, LoadingButton } from '@/components/ui'
import { formatCFA } from '@/lib/formatters'
import { useCustomerSearch, useCreateCustomer } from '@/hooks/useCustomers'
import { BilingualText } from '@/components/ui/BilingualText'
import { COMMON } from '@/lib/bilingual/common'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { POS } from '@/lib/bilingual/pos'
import { NAV } from '@/lib/bilingual/nav'
import { BiButtonInline, BiButtonStack } from '@/lib/bilingual/ui'
import { t, bilingualAriaLabel, bilingualPlain } from '@/lib/bilingual/types'
import type { Customer } from '@/types/database'
import { CustomerAvatar } from '@/components/customers/CustomerAvatar'

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
      setNameError(bilingualPlain(CUSTOMERS.nameRequired))
      return
    }
    setNameError('')
    try {
      const result = await mutateAsync({
        p_name:  name.trim(),
        p_phone: phone.trim() || null,
      })
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
      setNameError(bilingualPlain(CUSTOMERS.createFailed))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 space-y-2 overflow-y-auto min-h-0 flex-1">
      <BiButtonStack {...CUSTOMERS.newCustomerButton} />
      <div>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setNameError('') }}
          placeholder={bilingualPlain(CUSTOMERS.fullNameRequired)}
          className={cn(
            'w-full h-8 px-3 text-sm rounded-md border bg-surface text-text-primary',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            nameError ? 'border-danger' : 'border-border',
          )}
        />
        {nameError && <p className="text-xs text-danger-foreground mt-0.5">{nameError}</p>}
      </div>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={bilingualPlain(CUSTOMERS.phoneOptional)}
        className="w-full h-8 px-3 text-sm rounded-md border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="flex-1">
          <BiButtonInline {...COMMON.cancel} />
        </Button>
        <LoadingButton type="submit" size="sm" className="flex-1" loading={isPending}>
          <BiButtonInline {...CUSTOMERS.create} />
        </LoadingButton>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────
// CustomerDropdown — compact overlay: search + Walk-in + results
// ─────────────────────────────────────────────────────────────────

export interface CustomerDropdownProps {
  onSelect: (customer: Customer) => void
  onSelectWalkIn: () => void
  onClose: () => void
  isWalkIn: boolean
  selectedCustomerId: string | null
}

const WALK_IN_ID = 'pos-customer-opt-walkin'
const LISTBOX_ID = 'pos-customer-listbox'

export function CustomerDropdown({
  onSelect,
  onSelectWalkIn,
  onClose,
  isWalkIn,
  selectedCustomerId,
}: CustomerDropdownProps) {
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  // activeOnly=true: inactive customers cannot be selected for new sales at POS.
  // Backend enforces this too (complete_sale rejects inactive customer_id).
  const { data: customers, isLoading } = useCustomerSearch(query, !showCreate, true)

  const results = customers ?? []
  const optionCount = 1 + results.length
  const activeId = showCreate
    ? undefined
    : activeIndex === 0
      ? WALK_IN_ID
      : results[activeIndex - 1]
        ? `pos-customer-opt-${results[activeIndex - 1].id}`
        : WALK_IN_ID

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (activeIndex >= optionCount) setActiveIndex(0)
  }, [activeIndex, optionCount])

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex])

  function selectAt(index: number) {
    if (index <= 0) {
      onSelectWalkIn()
      return
    }
    const customer = results[index - 1]
    if (customer) onSelect(customer)
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (showCreate) {
        setShowCreate(false)
        return
      }
      onClose()
      return
    }
    if (showCreate) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, optionCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectAt(activeIndex)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(Math.max(optionCount - 1, 0))
    }
  }

  const handleCreated = (customer: Customer) => {
    onSelect(customer)
  }

  return (
    <div
      data-testid="pos-customer-picker"
      data-state="open"
      className={cn(
        'absolute z-30 left-0 right-0 bottom-full mb-1',
        'flex flex-col max-h-64',
        'bg-surface border border-border rounded-lg shadow-lg overflow-hidden',
      )}
    >
      {showCreate ? (
        <CreateCustomerForm
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
          initialName={query}
        />
      ) : (
        <>
          <div className="p-2 border-b border-border flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={bilingualPlain(CUSTOMERS.searchNamePhone)}
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={LISTBOX_ID}
                aria-activedescendant={activeId}
                className="w-full h-8 pl-7 pr-3 text-sm rounded-md border border-border bg-surface-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                onKeyDown={onSearchKeyDown}
              />
            </div>
          </div>

          <div
            id={LISTBOX_ID}
            role="listbox"
            aria-label={bilingualAriaLabel(NAV.customers)}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <button
              ref={(el) => { optionRefs.current[0] = el }}
              type="button"
              role="option"
              id={WALK_IN_ID}
              aria-selected={isWalkIn}
              onMouseEnter={() => setActiveIndex(0)}
              onClick={() => onSelectWalkIn()}
              className={cn(
                'w-full text-left px-3 py-2 flex items-center gap-2 transition-colors border-b border-border',
                activeIndex === 0 ? 'bg-surface-muted' : 'hover:bg-surface-muted',
                isWalkIn && 'font-medium',
              )}
            >
              <User className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
              <div className="min-w-0">
                <BilingualText {...POS.walkIn} variant="body" />
                <BilingualText {...CUSTOMERS.walkInNoAccount} variant="caption" as="p" />
              </div>
            </button>

            {isLoading ? (
              <div className="p-3 text-center">
                <BilingualText {...CUSTOMERS.searching} variant="body" className="text-text-muted" />
              </div>
            ) : results.length === 0 ? (
              <div className="p-3 text-sm text-text-muted text-center">
                {query.trim() ? (
                  <BilingualText {...CUSTOMERS.noCustomers} variant="body" />
                ) : (
                  <BilingualText {...CUSTOMERS.typeNamePhone} variant="body" />
                )}
              </div>
            ) : (
              results.map((c, i) => {
                const index = i + 1
                const selected = selectedCustomerId === c.id
                return (
                  <button
                    key={c.id}
                    ref={(el) => { optionRefs.current[index] = el }}
                    type="button"
                    role="option"
                    id={`pos-customer-opt-${c.id}`}
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onSelect(c)}
                    className={cn(
                      'w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors',
                      activeIndex === index ? 'bg-surface-muted' : 'hover:bg-surface-muted',
                      c.balance_owed_cfa > 0 && 'border-l-2 border-l-danger',
                      c.balance_owed_cfa <= 0 && 'border-l-2 border-l-success',
                    )}
                  >
                    <CustomerAvatar
                      name={c.name}
                      balanceOwedCfa={c.balance_owed_cfa}
                      isActive={c.is_active}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
                      {c.phone && (
                        <p className="text-xs text-text-muted truncate">{c.phone}</p>
                      )}
                    </div>
                    {c.balance_owed_cfa > 0 ? (
                      <span className="text-xs font-semibold text-danger-foreground financial-value flex-shrink-0">
                        {formatCFA(c.balance_owed_cfa)}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-success-foreground flex-shrink-0">OK</span>
                    )}
                  </button>
                )
              })
            )}
          </div>

          <div className="p-1.5 border-t border-border flex-shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 h-8"
              onClick={() => setShowCreate(true)}
            >
              <UserPlus className="h-3.5 w-3.5" />
              <BiButtonInline {...CUSTOMERS.newCustomerButton} />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
