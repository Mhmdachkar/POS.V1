/**
 * PaymentsPage — Customer payment history list.
 */

import { useState } from 'react'
import { Banknote } from 'lucide-react'
import { NavPictogram } from '@/components/layout/NavPictogram'
import { cn } from '@/lib/cn'
import {
  Badge,
  EmptyState,
  FilterBar,
  MoneyDisplay,
  PageHeader,
  PaginationBar,
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
import { bilingualAriaLabel, bilingualPlain, t } from '@/lib/bilingual/types'
import { usePaymentList } from '@/hooks/useCustomers'
import { useAuthStore } from '@/stores/authStore'

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
  'grid-cols-[minmax(9.5rem,10.5rem)_minmax(7rem,1fr)_minmax(7rem,0.9fr)_6.5rem_minmax(7rem,0.9fr)_minmax(6rem,1fr)]'

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
  const isCashier = useAuthStore((s) => s.staff?.role === 'cashier')

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
          description={
            isCashier
              ? t(PAYMENTS.cashierScopeHint)
              : <BiPageDescription {...PAYMENTS.pageDesc} />
          }
          icon={<NavPictogram path="/payments" size="header" />}
          className="border-b-0"
        />
        <div className="px-3 sm:px-6 pb-3 sm:pb-4">
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

      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
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
                <BiTableHeader {...PAYMENTS.recordedBy} />
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
                <span className="text-sm text-text-secondary truncate min-w-0">
                  {payment.recorded_by_name ?? '—'}
                </span>
                <span className="text-right min-w-0">
                  <MoneyDisplay
                    amount={payment.amount_cfa}
                    size="small"
                    className={payment.is_reversed ? 'line-through text-text-muted' : undefined}
                  />
                </span>
                <span className="min-w-0 flex flex-wrap items-center gap-1">
                  {payment.is_reversed ? (
                    <Badge variant="neutral">
                      <BilingualText {...PAYMENTS.statusReversed} variant="caption" layout="inline" />
                    </Badge>
                  ) : (
                    <Badge variant="success" dot>
                      <BilingualText {...PAYMENTS.statusRecorded} variant="caption" layout="inline" />
                    </Badge>
                  )}
                  {payment.shift_id == null && (
                    <Badge variant="warning">
                      <BilingualText {...PAYMENTS.noShift} variant="caption" layout="inline" />
                    </Badge>
                  )}
                </span>
                <span className="text-sm text-text-muted truncate min-w-0">
                  {payment.note ?? <span className="italic">—</span>}
                </span>
              </div>
            ))}

            <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
