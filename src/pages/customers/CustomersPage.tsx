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
 */

import { useState } from 'react'
import { Users, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Badge, Button, EmptyState, Skeleton } from '@/components/ui'
import { formatCFA, formatDate } from '@/lib/formatters'
import { useCustomerList } from '@/hooks/useCustomers'
import { useAuthStore } from '@/stores/authStore'
import { CustomerDetailDrawer } from './components/CustomerDetailDrawer'
import { CustomerFormModal } from './components/CustomerFormModal'

// ─────────────────────────────────────────────────────────────────
// Filter options
// ─────────────────────────────────────────────────────────────────

type CustomerFilter = 'all' | 'active' | 'inactive' | 'with_balance'

interface FilterOption {
  value: CustomerFilter
  label: string
  adminOnly?: boolean
}

const FILTER_OPTIONS: FilterOption[] = [
  { value: 'all',          label: 'All' },
  { value: 'active',       label: 'Active' },
  { value: 'with_balance', label: 'With Balance' },
  { value: 'inactive',     label: 'Inactive', adminOnly: true },
]

// ─────────────────────────────────────────────────────────────────
// Table skeleton
// ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 bg-surface border-b border-border">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24 ml-auto" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CustomersPage (main export)
// ─────────────────────────────────────────────────────────────────

export function CustomersPage() {
  const [search, setSearch]               = useState('')
  const [filter, setFilter]               = useState<CustomerFilter>('all')
  const [page, setPage]                   = useState(0)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal]       = useState(false)

  const staff   = useAuthStore((s) => s.staff)
  const isAdmin = staff?.role === 'admin'

  const pageSize = 30

  const { data, isLoading, isError } = useCustomerList({
    page,
    pageSize,
    search,
    filter,
  })

  const customers   = data?.data ?? []
  const totalCount  = data?.count ?? 0
  const totalPages  = Math.ceil(totalCount / pageSize)

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(0)
  }

  const handleFilterChange = (f: CustomerFilter) => {
    setFilter(f)
    setPage(0)
  }

  const visibleFilters = FILTER_OPTIONS.filter((f) => !f.adminOnly || isAdmin)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-text-primary">Customers</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {totalCount > 0
                ? `${totalCount} customer${totalCount !== 1 ? 's' : ''}`
                : 'Manage customer accounts and balances'
              }
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={handleSearchChange}
                placeholder="Name or phone…"
                className={cn(
                  'w-full h-9 pl-9 pr-3 rounded-md border border-border bg-surface',
                  'text-sm text-text-primary placeholder:text-text-muted',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
                )}
              />
            </div>

            {/* New Customer button */}
            <Button
              className="gap-1.5 flex-shrink-0"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="h-4 w-4" />
              New Customer
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 mt-3 overflow-x-auto">
          {visibleFilters.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleFilterChange(opt.value)}
              className={cn(
                'px-3 h-7 rounded-full text-xs font-medium flex-shrink-0 transition-colors',
                filter === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-muted text-text-secondary border border-border hover:bg-surface',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="Failed to load customers"
              description="Check your connection and try again."
            />
          </div>
        ) : customers.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No customers found"
              description={
                search || filter !== 'all'
                  ? 'No customers match your filters.'
                  : 'No customers yet. Create the first one.'
              }
            />
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="sticky top-0 bg-surface-muted border-b border-border">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2">
                <span className="text-xs font-semibold text-text-secondary uppercase">Name</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Phone</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">Balance Owed</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Status</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Since</span>
              </div>
            </div>

            {/* Rows */}
            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => setSelectedCustomerId(customer.id)}
                className={cn(
                  'w-full text-left grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3',
                  'border-b border-border hover:bg-surface-muted transition-colors',
                  'focus:outline-none focus:bg-primary-subtle',
                  selectedCustomerId === customer.id && 'bg-primary-subtle',
                )}
              >
                <span className="text-sm font-medium text-text-primary truncate">
                  {customer.name}
                </span>
                <span className="text-sm text-text-secondary">
                  {customer.phone ?? <span className="text-text-muted italic">—</span>}
                </span>
                <span className={cn(
                  'text-sm font-semibold tabular-nums text-right',
                  customer.balance_owed_cfa > 0 ? 'text-danger' : 'text-text-muted',
                )}>
                  {customer.balance_owed_cfa > 0 ? formatCFA(customer.balance_owed_cfa) : '—'}
                </span>
                <span>
                  {customer.is_active
                    ? <Badge variant="success" dot>Active</Badge>
                    : <Badge variant="neutral" dot>Inactive</Badge>
                  }
                </span>
                <span className="text-sm text-text-secondary">
                  {formatDate(customer.created_at)}
                </span>
              </button>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-sm text-text-secondary">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 h-8 text-sm rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 h-8 text-sm rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
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
