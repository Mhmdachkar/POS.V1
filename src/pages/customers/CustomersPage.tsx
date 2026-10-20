/**
 * CustomersPage — Customer management: list, search, detail, lifecycle.
 *
 * Features:
 *   - Paginated customer list (alphabetical)
 *   - Search by name or phone (300ms debounce)
 *   - Filter: All | Active | With Balance | Inactive (admin can see inactive)
 *   - Row click → CustomerDetailDrawer (identity, balance, sales, payments, actions)
 *   - "+ New Customer" → CustomerFormModal
 *   - Balance displayed prominently; outstanding balance highlighted in danger color
 *
 * Authorization:
 *   - Admin + cashier: full list access (customers are global entities)
 *   - depot_staff: no access (RLS blocks the customer table)
 *
 * Lifecycle display:
 *   - Inactive customers shown with "Inactive" badge
 *   - "Inactive" filter only available to admin (cashiers see active+inactive in the list,
 *     but can only use the POS to create new sales for active customers)
 *
 * Phase 13E-B: PageHeader + FilterBar + MoneyDisplay; custom sticky CSS-grid retained.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Users, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Badge,
  Button,
  EmptyState,
  FilterBar,
  MoneyDisplay,
  PageHeader,
  Skeleton,
} from '@/components/ui'
import { formatDate } from '@/lib/formatters'
import { COMMON, commonPageOf } from '@/lib/bilingual/common'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import {
  BiButtonStack,
  BiEmptyDescription,
  BiEmptyTitle,
  BiPageTitle,
  BiTabLabel,
  BiTableHeader,
} from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { t, bilingualAriaLabel, bilingualPlain } from '@/lib/bilingual/types'
import { useCustomerList, type CustomerListFilter } from '@/hooks/useCustomers'
import { useAuthStore } from '@/stores/authStore'
import { CustomerDetailDrawer } from './components/CustomerDetailDrawer'
import { CustomerFormModal } from './components/CustomerFormModal'

/** Name/phone search debounce. Do not query on every keystroke. */
export const CUSTOMERS_SEARCH_DEBOUNCE_MS = 300

// ─────────────────────────────────────────────────────────────────
// Filter options
// ─────────────────────────────────────────────────────────────────

interface FilterOption {
  value: CustomerListFilter
  label: ReactNode
  aria: string
  adminOnly?: boolean
}

const FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: <BiTabLabel {...CUSTOMERS.filterAll} />, aria: bilingualAriaLabel(CUSTOMERS.filterAll) },
  { value: 'active', label: <BiTabLabel {...CUSTOMERS.filterActive} />, aria: bilingualAriaLabel(CUSTOMERS.filterActive) },
  { value: 'with_balance', label: <BiTabLabel {...CUSTOMERS.filterWithBalance} />, aria: bilingualAriaLabel(CUSTOMERS.filterWithBalance) },
  { value: 'inactive', label: <BiTabLabel {...CUSTOMERS.filterInactive} />, aria: bilingualAriaLabel(CUSTOMERS.filterInactive), adminOnly: true },
]

/** Name | Phone | Balance Owed | Status | Since */
const CUSTOMERS_GRID =
  'grid-cols-[minmax(10rem,1.4fr)_8.5rem_7rem_6.5rem_7.5rem]'

// ─────────────────────────────────────────────────────────────────
// Table skeleton
// ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={cn('grid gap-4 px-4 py-3 bg-surface border-b border-border items-center', CUSTOMERS_GRID)}
        >
          <Skeleton className="h-4 w-full max-w-[10rem]" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full max-w-[5rem] justify-self-end" />
          <Skeleton className="h-5 w-full max-w-[4.5rem] rounded-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CustomersPage (main export)
// ─────────────────────────────────────────────────────────────────

export function CustomersPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState<CustomerListFilter>('all')
  const [page, setPage] = useState(0)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const staff   = useAuthStore((s) => s.staff)
  const isAdmin = staff?.role === 'admin'
  const canCreateCustomer = staff?.role === 'admin' || staff?.role === 'cashier'

  const pageSize = 30

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), CUSTOMERS_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError } = useCustomerList({
    page,
    pageSize,
    search: debouncedSearch,
    filter,
  })

  const customers   = data?.data ?? []
  const totalCount  = data?.count ?? 0
  const totalPages  = Math.ceil(totalCount / pageSize)

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(0)
  }

  const handleFilterChange = (f: CustomerListFilter) => {
    setFilter(f)
    setPage(0)
  }

  const visibleFilters = FILTER_OPTIONS.filter((f) => !f.adminOnly || isAdmin)
  const filterChips = visibleFilters.map((opt) => ({
    value: opt.value,
    label: opt.label,
    ariaLabel: opt.aria,
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Single header band: PageHeader + FilterBar */}
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...CUSTOMERS.pageTitle} />}
          className="border-b-0"
          actions={
            canCreateCustomer ? (
              <Button
                className="gap-1.5 flex-shrink-0"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="h-4 w-4" />
                <BiButtonStack {...CUSTOMERS.newCustomerButton} />
              </Button>
            ) : undefined
          }
        />
        <div className="px-3 sm:px-6 pb-3 sm:pb-4">
          <FilterBar
            search={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder={bilingualPlain(CUSTOMERS.searchPlaceholder)}
            chips={filterChips}
            activeChip={filter}
            onChipChange={(value) => handleFilterChange(value as CustomerListFilter)}
            count={totalCount}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title={<BiEmptyTitle {...CUSTOMERS.failedToLoad} />}
              description={<BiEmptyDescription {...COMMON.checkConnection} />}
            />
          </div>
        ) : customers.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title={<BiEmptyTitle {...CUSTOMERS.noCustomers} />}
              description={
                search || filter !== 'all' ? (
                  <BiEmptyDescription {...CUSTOMERS.noMatchFilters} />
                ) : (
                  <BiEmptyDescription {...CUSTOMERS.createFirst} />
                )
              }
            />
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="sticky top-0 bg-surface-muted border-b border-border z-[1]">
              <div className={cn('grid gap-4 px-4 py-2 items-center', CUSTOMERS_GRID)}>
                <BiTableHeader {...CUSTOMERS.name} />
                <BiTableHeader {...CUSTOMERS.phone} />
                <span className="text-right">
                  <BiTableHeader {...CUSTOMERS.balanceOwed} />
                </span>
                <BiTableHeader {...COMMON.status} />
                <BiTableHeader {...CUSTOMERS.colSince} />
              </div>
            </div>

            {/* Rows */}
            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => setSelectedCustomerId(customer.id)}
                className={cn(
                  'w-full text-left grid gap-4 px-4 py-3 items-center',
                  CUSTOMERS_GRID,
                  'border-b border-border hover:bg-surface-muted transition-colors',
                  'focus:outline-none focus:bg-primary-subtle',
                  selectedCustomerId === customer.id && 'bg-primary-subtle',
                )}
              >
                <span className="text-sm font-medium text-text-primary truncate min-w-0">
                  {customer.name}
                </span>
                <span className="text-sm text-text-secondary truncate min-w-0">
                  {customer.phone ?? <span className="text-text-muted italic">—</span>}
                </span>
                <span className="text-right min-w-0">
                  {customer.balance_owed_cfa > 0 ? (
                    <MoneyDisplay amount={customer.balance_owed_cfa} size="small" danger />
                  ) : (
                    <span className="text-sm text-text-muted">—</span>
                  )}
                </span>
                <span className="min-w-0">
                  {customer.is_active
                    ? (
                      <Badge variant="success" dot>
                        <BilingualText {...COMMON.active} variant="caption" layout="inline" />
                      </Badge>
                    )
                    : (
                      <Badge variant="neutral" dot>
                        <BilingualText {...COMMON.inactive} variant="caption" layout="inline" />
                      </Badge>
                    )
                  }
                </span>
                <span className="text-sm text-text-secondary whitespace-nowrap">
                  {formatDate(customer.created_at)}
                </span>
              </button>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-sm text-text-secondary">
                  <BilingualText {...commonPageOf(page + 1, totalPages)} variant="caption" layout="inline" />
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 h-8 text-sm rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <BilingualText {...COMMON.previous} variant="caption" layout="inline" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 h-8 text-sm rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <BilingualText {...COMMON.next} variant="caption" layout="inline" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail drawer */}
      <CustomerDetailDrawer
        customerId={selectedCustomerId}
        onClose={() => setSelectedCustomerId(null)}
      />

      {/* Create customer modal */}
      <CustomerFormModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  )
}
