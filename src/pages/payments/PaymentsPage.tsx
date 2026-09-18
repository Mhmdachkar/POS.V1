/**
 * PaymentsPage — Customer payment history list.
 */

import { useState } from 'react'
import { Banknote } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Badge,
  EmptyState,
  FilterBar,
  MoneyDisplay,
  PageHeader,
  Skeleton,
  type FilterBarChip,
} from '@/components/ui'
import { formatDateTime } from '@/lib/formatters'
import { COMMON } from '@/lib/bilingual/common'
import { PAYMENTS } from '@/lib/bilingual/payments'
import {
  BiEmptyDescription,
  BiEmptyTitle,
  BiPageDescription,
  BiPageTitle,
  BiTabLabel,
  BiTableHeader,
} from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { bilingualAriaLabel, bilingualPlain } from '@/lib/bilingual/types'
import { commonPageOf } from '@/lib/bilingual/common'
import { usePaymentList } from '@/hooks/useCustomers'

const REVERSED_CHIPS: FilterBarChip[] = [
  {
    value: 'excluding',
    label: <BiTabLabel {...PAYMENTS.excludingReversed} />,
    ariaLabel: bilingualAriaLabel(PAYMENTS.excludingReversed),
  },
  {
    value: 'including',
    label: <BiTabLabel {...PAYMENTS.includingReversed} />,
    ariaLabel: bilingualAriaLabel(PAYMENTS.includingReversed),
  },
]

const PAYMENTS_GRID =
  'grid-cols-[minmax(9.5rem,10.5rem)_minmax(8rem,1.2fr)_6.5rem_7rem_minmax(6rem,1fr)]'

function TableSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={cn('grid gap-4 px-4 py-3 bg-surface border-b border-border items-center', PAYMENTS_GRID)}
        >
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full max-w-[10rem]" />
          <Skeleton className="h-4 w-full max-w-[5rem] justify-self-end" />
          <Skeleton className="h-5 w-full max-w-[5rem] rounded-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  )
}

export function PaymentsPage() {
  const [page, setPage] = useState(0)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showReversed, setShowReversed] = useState(false)

  const pageSize = 30

  const { data, isLoading, isError } = usePaymentList({
    page,
    pageSize,
    customerSearch,
    showReversed,
  })

  const payments = data?.data ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...PAYMENTS.pageTitle} />}
          description={<BiPageDescription {...PAYMENTS.pageDescLong} />}
          className="border-b-0"
        />
        <div className="px-6 pb-4">
          <FilterBar
            search={customerSearch}
            onSearchChange={(value) => {
              setCustomerSearch(value)
              setPage(0)
            }}
            searchPlaceholder={bilingualPlain(PAYMENTS.searchCustomer)}
            chips={REVERSED_CHIPS}
            activeChip={showReversed ? 'including' : 'excluding'}
            onChipChange={(value) => {
              setShowReversed(value === 'including')
              setPage(0)
            }}
            count={totalCount}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Banknote className="h-8 w-8" />}
              title={<BiEmptyTitle {...PAYMENTS.failedToLoad} />}
              description={<BiEmptyDescription {...COMMON.checkConnection} />}
            />
          </div>
        ) : payments.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Banknote className="h-8 w-8" />}
              title={<BiEmptyTitle {...PAYMENTS.noPayments} />}
              description={
                customerSearch ? (
                  <BiEmptyDescription {...PAYMENTS.noPaymentsFor(customerSearch)} />
                ) : (
                  <BiEmptyDescription {...PAYMENTS.noPaymentsRecorded} />
                )
              }
            />
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border z-[1]">
              <div className={cn('grid gap-4 px-4 py-2 items-center', PAYMENTS_GRID)}>
                <BiTableHeader {...COMMON.date} />
                <BiTableHeader {...COMMON.customer} />
                <span className="text-right">
                  <BiTableHeader {...PAYMENTS.amount} />
                </span>
                <BiTableHeader {...COMMON.status} />
                <BiTableHeader {...PAYMENTS.colNote} />
              </div>
            </div>

            {payments.map((payment) => (
              <div
                key={payment.id}
                className={cn('grid gap-4 px-4 py-3 border-b border-border items-center', PAYMENTS_GRID)}
              >
                <span className="text-sm text-text-secondary whitespace-nowrap">
                  {formatDateTime(payment.recorded_at)}
                </span>
                <span className="text-sm font-medium text-text-primary truncate min-w-0">
                  {payment.customer_name ?? (
                    <span className="text-text-muted italic">
                      <BilingualText {...COMMON.unknown} variant="caption" layout="inline" />
                    </span>
                  )}
                </span>
                <span className="text-right min-w-0">
                  <MoneyDisplay
                    amount={payment.amount_cfa}
                    size="small"
                    className={
                      payment.is_reversed
                        ? 'line-through text-text-muted'
                        : 'text-success-foreground'
                    }
                  />
                </span>
                <span className="min-w-0">
                  {payment.is_reversed ? (
                    <Badge variant="neutral">
                      <BilingualText {...PAYMENTS.statusReversed} variant="caption" layout="inline" />
                    </Badge>
                  ) : (
                    <Badge variant="success" dot>
                      <BilingualText {...PAYMENTS.statusRecorded} variant="caption" layout="inline" />
                    </Badge>
                  )}
                </span>
                <span className="text-sm text-text-muted truncate min-w-0">
                  {payment.note ?? <span className="italic">—</span>}
                </span>
              </div>
            ))}

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
    </div>
  )
}
