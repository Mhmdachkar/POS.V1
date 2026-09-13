/**
 * SalesPage — Sales history list with filters and detail drawer.
 *
 * Features:
 *   - Paginated sales list (newest first)
 *   - Filter by status (All / Completed / Voided / Returned / Partially Returned)
 *   - Search by receipt number
 *   - Row click opens SaleDetailDrawer (with Return + Void actions)
 *   - Depot scoped (RLS enforces — cashier sees only their depot)
 *
 * Roles:
 *   - cashier: sees their depot's sales
 *   - admin: sees selected depot's sales (or all if no depot selected)
 */

import { useEffect, useState } from 'react'
import { Receipt, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { SaleStatusBadge, Skeleton, EmptyState } from '@/components/ui'
import { formatCFA, formatDateTime } from '@/lib/formatters'
import { useSalesList } from '@/hooks/useSales'
import { useDepotOptions } from '@/hooks/useInventory'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { usePOSStore } from '@/stores/posStore'
import { SaleDetailDrawer } from './components/SaleDetailDrawer'
import type { SaleStatus } from '@/types/database'

/** Receipt-number search debounce. Do not query on every keystroke. */
export const SALES_SEARCH_DEBOUNCE_MS = 300

// ─────────────────────────────────────────────────────────────────
// Status filter
// ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: SaleStatus | null; label: string }> = [
  { value: null,               label: 'All' },
  { value: 'completed',        label: 'Completed' },
  { value: 'partially_returned', label: 'Partially Returned' },
  { value: 'returned',         label: 'Returned' },
  { value: 'voided',           label: 'Voided' },
]

// ─────────────────────────────────────────────────────────────────
// Table skeleton
// ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 bg-surface border-b border-border">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20 ml-auto" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SalesPage (main export)
// ─────────────────────────────────────────────────────────────────

export function SalesPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SaleStatus | null>(null)
  const [page, setPage] = useState(0)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

  const staff     = useAuthStore((s) => s.staff)
  const depotId   = useDepotStore((s) => s.currentDepotId)
  const shiftId   = usePOSStore((s) => s.shiftId)
  const { data: depots } = useDepotOptions()

  const effectiveDepotId =
    staff?.role === 'cashier' ? staff.depot_id : depotId

  const showDepotColumn = staff?.role === 'admin' && depotId === null

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SALES_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(0)
  }, [depotId])

  const { data, isLoading, isError } = useSalesList({
    depotId: effectiveDepotId,
    status:  statusFilter,
    search:  debouncedSearch,
    page,
    pageSize: 30,
  })

  const depotName = (id: string) =>
    depots?.find((d) => d.id === id)?.name ?? '—'

  const sales = data?.data ?? []
  const totalCount = data?.count ?? 0
  const pageSize = 30
  const totalPages = Math.ceil(totalCount / pageSize)

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(0)
  }

  const handleStatusChange = (status: SaleStatus | null) => {
    setStatusFilter(status)
    setPage(0)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-text-primary">Sales History</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {totalCount > 0
                ? `${totalCount} sale${totalCount !== 1 ? 's' : ''}`
                : 'All sales'
              }
            </p>
          </div>

          {/* Search */}
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={handleSearchChange}
              placeholder="Receipt number…"
              className={cn(
                'w-full h-9 pl-9 pr-3 rounded-md border border-border bg-surface',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
              )}
            />
          </div>
        </div>

        {/* Status filters */}
        <div className="flex gap-1.5 mt-3 overflow-x-auto">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => handleStatusChange(opt.value)}
              className={cn(
                'px-3 h-7 rounded-full text-xs font-medium flex-shrink-0 transition-colors',
                statusFilter === opt.value
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
              icon={<Receipt className="h-8 w-8" />}
              title="Failed to load sales"
              description="Check your connection and try again."
            />
          </div>
        ) : sales.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Receipt className="h-8 w-8" />}
              title="No sales found"
              description={
                search || statusFilter
                  ? 'No sales match your current filters.'
                  : 'No sales have been recorded yet.'
              }
            />
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="sticky top-0 bg-surface-muted border-b border-border">
              <div className={cn(
                'grid gap-4 px-4 py-2',
                showDepotColumn
                  ? 'grid-cols-[1fr_auto_auto_auto_auto_auto]'
                  : 'grid-cols-[1fr_auto_auto_auto_auto]',
              )}>
                <span className="text-xs font-semibold text-text-secondary uppercase">Receipt</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Status</span>
                {showDepotColumn && (
                  <span className="text-xs font-semibold text-text-secondary uppercase">Depot</span>
                )}
                <span className="text-xs font-semibold text-text-secondary uppercase">Customer</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">Total</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">Date</span>
              </div>
            </div>

            {/* Rows */}
            {sales.map((sale) => (
              <button
                key={sale.id}
                type="button"
                onClick={() => setSelectedSaleId(sale.id)}
                className={cn(
                  'w-full text-left grid gap-4 px-4 py-3',
                  showDepotColumn
                    ? 'grid-cols-[1fr_auto_auto_auto_auto_auto]'
                    : 'grid-cols-[1fr_auto_auto_auto_auto]',
                  'border-b border-border hover:bg-surface-muted transition-colors',
                  'focus:outline-none focus:bg-primary-subtle',
                  selectedSaleId === sale.id && 'bg-primary-subtle',
                )}
              >
                <span className="text-sm font-mono font-medium text-text-primary truncate">
                  {sale.receipt_number}
                </span>
                <span>
                  <SaleStatusBadge status={sale.status} />
                </span>
                {showDepotColumn && (
                  <span className="text-sm text-text-secondary truncate max-w-36">
                    {depotName(sale.depot_id)}
                  </span>
                )}
                <span className="text-sm text-text-secondary truncate max-w-36">
                  {sale.customer_name ?? <span className="text-text-muted italic">Walk-in</span>}
                </span>
                <span className="text-sm font-semibold text-text-primary tabular-nums text-right">
                  {formatCFA(sale.total_cfa)}
                </span>
                <span className="text-sm text-text-secondary text-right whitespace-nowrap">
                  {formatDateTime(sale.created_at)}
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

      {/* Sale detail drawer */}
      <SaleDetailDrawer
        saleId={selectedSaleId}
        shiftId={shiftId}
        onClose={() => setSelectedSaleId(null)}
      />
    </div>
  )
}
