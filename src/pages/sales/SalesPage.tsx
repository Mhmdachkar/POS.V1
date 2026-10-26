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
 *
 * Phase 13E-A: PageHeader + FilterBar + MoneyDisplay on list totals.
 * Custom sticky CSS-grid list retained (not DataTable).
 */

import { useEffect, useState } from 'react'
import { BiEmptyTitle, BiPageTitle } from '@/lib/bilingual/ui'
import { SALES } from '@/lib/bilingual/sales'
import { COMMON } from '@/lib/bilingual/common'
import { POS } from '@/lib/bilingual/pos'
import { BilingualText } from '@/components/ui/BilingualText'
import { Receipt } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  EmptyState,
  FilterBar,
  MoneyDisplay,
  PageHeader,
  SaleStatusBadge,
  Skeleton,
} from '@/components/ui'
import { formatDateTime } from '@/lib/formatters'
import { useSalesList } from '@/hooks/useSales'
import { useDepotOptions } from '@/hooks/useInventory'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { SaleDetailDrawer } from './components/SaleDetailDrawer'
import type { SaleStatus } from '@/types/database'
import type { FulfillmentStatus } from '@/lib/printPayload'
import { t } from '@/lib/bilingual/types'
import { SALE_STATUS } from '@/lib/bilingual/status'


/** Receipt-number search debounce. Do not query on every keystroke. */
export const SALES_SEARCH_DEBOUNCE_MS = 300

// ─────────────────────────────────────────────────────────────────
// Status filter (UI chips use string "all"; hook still receives null)
// ─────────────────────────────────────────────────────────────────

function statusFilterChips(): Array<{ value: string; label: string }> {
  const options: Array<{ value: SaleStatus | null; label: string }> = [
    { value: null, label: t(COMMON.all) },
    { value: 'completed', label: t(SALE_STATUS.completed) },
    { value: 'partially_returned', label: t(SALE_STATUS.partially_returned) },
    { value: 'returned', label: t(SALE_STATUS.returned) },
    { value: 'voided', label: t(SALE_STATUS.voided) },
  ]
  return options.map((opt) => ({
    value: opt.value ?? 'all',
    label: opt.label,
  }))
}

/** Shared tracks so header + each row grid align (avoid per-row `auto` sizing). */
const SALES_GRID_WITH_DEPOT =
  'grid-cols-[7.25rem_7.25rem_minmax(4.5rem,0.85fr)_minmax(5.25rem,0.95fr)_minmax(5rem,0.9fr)_5.25rem_minmax(7.5rem,8.75rem)]'
const SALES_GRID_NO_DEPOT =
  'grid-cols-[7.25rem_7.25rem_minmax(5.25rem,1fr)_minmax(5.25rem,1fr)_5.25rem_minmax(7.5rem,9rem)]'


// ─────────────────────────────────────────────────────────────────
// Table skeleton
// ─────────────────────────────────────────────────────────────────

function TableSkeleton({
  gridCols,
  showDepotColumn,
}: {
  gridCols: string
  showDepotColumn: boolean
}) {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={cn('grid gap-4 px-4 py-3 bg-surface border-b border-border items-center', gridCols)}
        >
          <Skeleton className="h-4 w-full max-w-[7rem]" />
          <Skeleton className="h-5 w-full max-w-[6.5rem] rounded-full" />
          {showDepotColumn && <Skeleton className="h-4 w-full" />}
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full max-w-[5rem] justify-self-end" />
          <Skeleton className="h-4 w-full max-w-[8rem] justify-self-end" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SalesPage (main export)
// ─────────────────────────────────────────────────────────────────

function fulfillmentChips(): Array<{ value: FulfillmentStatus | 'all'; label: string }> {
  return [
    { value: 'all', label: t(SALES.allFulfillment) },
    { value: 'pending', label: t(SALES.pendingRelease) },
    { value: 'released', label: t(SALES.released) },
  ]
}

export function SalesPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SaleStatus | null>(null)
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentStatus | null>(null)
  const [page, setPage] = useState(0)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

  const staff     = useAuthStore((s) => s.staff)
  const depotId   = useDepotStore((s) => s.currentDepotId)
  const { data: depots } = useDepotOptions()

  const isDepotStaff = staff?.role === 'depot_staff'
  const effectiveDepotId =
    staff?.role === 'cashier' || isDepotStaff ? staff.depot_id : depotId

  const showDepotColumn = staff?.role === 'admin' && depotId === null

  useEffect(() => {
    if (isDepotStaff && fulfillmentFilter === null) {
      setFulfillmentFilter('pending')
    }
  }, [isDepotStaff, fulfillmentFilter])
  const gridCols = showDepotColumn ? SALES_GRID_WITH_DEPOT : SALES_GRID_NO_DEPOT

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
    fulfillmentStatus: fulfillmentFilter,
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

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(0)
  }

  const handleStatusChange = (status: SaleStatus | null) => {
    setStatusFilter(status)
    setPage(0)
  }

  const handleChipChange = (value: string) => {
    handleStatusChange(value === 'all' ? null : (value as SaleStatus))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Single header band: PageHeader + FilterBar */}
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...(isDepotStaff ? SALES.ordersTitle : SALES.historyTitle)} />}
          className="border-b-0"
        />
        <div className="px-3 sm:px-6 pb-3 sm:pb-4">
          <FilterBar
            search={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder={t(SALES.searchReceiptPlaceholder)}
            chips={statusFilterChips()}
            activeChip={statusFilter ?? 'all'}
            onChipChange={handleChipChange}
            count={totalCount}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(isDepotStaff || staff?.role === 'admin') &&
              fulfillmentChips().map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setFulfillmentFilter(opt.value === 'all' ? null : opt.value)
                    setPage(0)
                  }}
                  className={cn(
                    'px-3 h-7 rounded-full text-xs font-medium flex-shrink-0 transition-colors',
                    (fulfillmentFilter ?? 'all') === opt.value ||
                      (opt.value === 'all' && fulfillmentFilter === null)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-muted text-text-secondary border border-border hover:bg-surface',
                  )}
                >
                  {opt.label}
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Table — horizontal scroll stays inside this pane, not the page */}
      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
        {isLoading ? (
          <TableSkeleton gridCols={gridCols} showDepotColumn={showDepotColumn} />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Receipt className="h-8 w-8" />}
              title={<BiEmptyTitle {...SALES.failedToLoad} />}
              description={t(COMMON.checkConnection)}
            />
          </div>
        ) : sales.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Receipt className="h-8 w-8" />}
              title={<BiEmptyTitle {...SALES.noSales} />}
              description={
                search || statusFilter
                  ? t(SALES.noSalesMatch)
                  : t(SALES.noSalesYet)
              }
            />
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="sticky top-0 bg-surface-muted border-b border-border z-[1]">
              <div className={cn('grid gap-4 px-4 py-2 items-center', gridCols)}>
                <span className="text-xs font-semibold text-text-secondary uppercase">Receipt</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Status</span>
                {showDepotColumn && (
                  <span className="text-xs font-semibold text-text-secondary uppercase">Depot</span>
                )}
                <span className="text-xs font-semibold text-text-secondary uppercase">
                  <BilingualText {...SALES.soldBy} variant="tableHeader" />
                </span>
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
                  'w-full text-left grid gap-4 px-4 py-3 items-center',
                  gridCols,
                  'border-b border-border hover:bg-surface-muted transition-colors',
                  'focus:outline-none focus:bg-primary-subtle',
                  selectedSaleId === sale.id && 'bg-primary-subtle',
                )}
              >
                <span className="text-sm font-mono font-semibold text-text-primary truncate min-w-0">
                  {sale.receipt_number}
                </span>
                <span className="min-w-0">
                  <SaleStatusBadge status={sale.status} />
                </span>
                {showDepotColumn && (
                  <span className="text-sm text-text-secondary truncate min-w-0">
                    {depotName(sale.depot_id)}
                  </span>
                )}
                <span className="text-sm text-text-secondary truncate min-w-0 inline-flex items-center gap-1.5">
                  <span className="truncate">{sale.cashier_name ?? '—'}</span>
                  {sale.cashier_role === 'admin' ? (
                    <span className="flex-shrink-0 text-[10px] font-medium text-primary bg-primary/10 px-1 py-0.5 rounded">
                      <BilingualText {...SALES.sellerAdmin} variant="caption" layout="inline" />
                    </span>
                  ) : sale.cashier_role === 'cashier' ? (
                    <span className="flex-shrink-0 text-[10px] font-medium text-text-secondary bg-surface-muted px-1 py-0.5 rounded">
                      <BilingualText {...SALES.sellerCashier} variant="caption" layout="inline" />
                    </span>
                  ) : null}
                </span>
                <span className="text-sm text-text-secondary truncate min-w-0">
                  {sale.customer_name ?? <span className="text-text-muted italic">{t(POS.walkIn)}</span>}
                </span>
                <span className="text-right">
                  <MoneyDisplay
                    amount={sale.admin_override_total_cfa ?? sale.total_cfa}
                    size="small"
                  />
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
        shiftId={null}
        onClose={() => setSelectedSaleId(null)}
      />
    </div>
  )
}
