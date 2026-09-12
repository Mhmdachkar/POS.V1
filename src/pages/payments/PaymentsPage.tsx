/**
 * PaymentsPage — Customer payment history list.
 *
 * Shows only payment_type='customer_payment' records.
 * sale_payment records (POS cash mirrors) are NOT shown here —
 * those are visible in the Sales page as part of individual sale detail.
 *
 * This page shows: standalone customer debt repayments.
 *
 * Payment model language:
 *   "Customer Payments" — never "Payment allocated to Sale #X".
 *   The pooled balance model has no payment-to-sale allocation.
 *
 * Depot isolation:
 *   RLS (Phase 6 amendment) ensures cashiers only see payment records
 *   within their authorized depot. Admin sees all depots.
 *   This is enforced at the database level; the frontend applies no
 *   additional depot filter (RLS is the authority).
 *
 * Cash-only:
 *   All payments are cash. No payment method selector.
 *
 * Roles:
 *   - Admin: sees all customer_payment records (all depots per RLS)
 *   - Cashier: sees only records from their depot (RLS-enforced)
 *   - depot_staff: no access (customer table RLS)
 */

import { useState } from 'react'
import { Banknote, Search, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Badge, EmptyState, Skeleton } from '@/components/ui'
import { formatCFA, formatDateTime } from '@/lib/formatters'
import { usePaymentList } from '@/hooks/useCustomers'

// ─────────────────────────────────────────────────────────────────
// Table skeleton
// ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 bg-surface border-b border-border">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20 ml-auto" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PaymentsPage (main export)
// ─────────────────────────────────────────────────────────────────

export function PaymentsPage() {
  const [page, setPage]               = useState(0)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showReversed, setShowReversed]     = useState(false)

  const pageSize = 30

  const { data, isLoading, isError } = usePaymentList({
    page,
    pageSize,
    customerSearch,
    showReversed,
  })

  const payments    = data?.data ?? []
  const totalCount  = data?.count ?? 0
  const totalPages  = Math.ceil(totalCount / pageSize)

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerSearch(e.target.value)
    setPage(0)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-text-primary">Customer Payments</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {totalCount > 0
                ? `${totalCount} payment${totalCount !== 1 ? 's' : ''}`
                : 'Standalone customer debt repayments'
              }
            </p>
          </div>

          {/* Search */}
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <input
              type="search"
              value={customerSearch}
              onChange={handleSearchChange}
              placeholder="Customer name…"
              className={cn(
                'w-full h-9 pl-9 pr-3 rounded-md border border-border bg-surface',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
              )}
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => { setShowReversed((v) => !v); setPage(0) }}
            className={cn(
              'px-3 h-7 rounded-full text-xs font-medium flex-shrink-0 transition-colors',
              showReversed
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-muted text-text-secondary border border-border hover:bg-surface',
            )}
          >
            {showReversed ? 'Showing reversed' : 'Excluding reversed'}
          </button>
          <span className="text-xs text-text-muted">
            · Depot isolation enforced by database — you see only your authorized payments.
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Banknote className="h-8 w-8" />}
              title="Failed to load payments"
              description="Check your connection and try again."
            />
          </div>
        ) : payments.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Banknote className="h-8 w-8" />}
              title="No customer payments found"
              description={
                customerSearch
                  ? `No payments found for "${customerSearch}".`
                  : 'No customer debt repayments have been recorded yet.'
              }
            />
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="sticky top-0 bg-surface-muted border-b border-border">
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-2">
                <span className="text-xs font-semibold text-text-secondary uppercase">Date</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Customer</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">Amount</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Status</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Note</span>
              </div>
            </div>

            {/* Rows */}
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 border-b border-border"
              >
                <span className="text-sm text-text-secondary whitespace-nowrap">
                  {formatDateTime(payment.recorded_at)}
                </span>
                <span className="text-sm font-medium text-text-primary truncate">
                  {(payment as any).customer_name ?? <span className="text-text-muted italic">Unknown</span>}
                </span>
                <span className={cn(
                  'text-sm font-semibold tabular-nums text-right whitespace-nowrap',
                  payment.is_reversed ? 'line-through text-text-muted' : 'text-success-foreground',
                )}>
                  {formatCFA(payment.amount_cfa)}
                </span>
                <span>
                  {payment.is_reversed
                    ? <Badge variant="neutral">Reversed</Badge>
                    : <Badge variant="success" dot>Recorded</Badge>
                  }
                </span>
                <span className="text-sm text-text-muted truncate max-w-32">
                  {payment.note ?? <span className="italic">—</span>}
                </span>
              </div>
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
    </div>
  )
}
