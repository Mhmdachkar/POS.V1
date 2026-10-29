/**
 * PaymentsPage — Customer payment history list.
 */

import { useMemo, useState } from 'react'
import { Banknote } from 'lucide-react'
import { NavPictogram } from '@/components/layout/NavPictogram'
import { cn } from '@/lib/cn'
import {
  Badge,
  Button,
  DatePresetFilter,
  EmptyState,
  FilterBar,
  MoneyDisplay,
  PageHeader,
  PaginationBar,
  Skeleton,
  type FilterBarChip,
  type ListDatePreset,
} from '@/components/ui'
import { formatDateTime } from '@/lib/formatters'
import { resolveReportDateRange } from '@/lib/reportDates'
import { COMMON } from '@/lib/bilingual/common'
import { PAYMENTS } from '@/lib/bilingual/payments'
import {
  BiButtonInline,
  BiEmptyDescription,
  BiEmptyTitle,
  BiPageDescription,
  BiPageTitle,
  BiTabLabel,
  BiTableHeader,
} from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { bilingualAriaLabel, bilingualPlain, t } from '@/lib/bilingual/types'
import { fetchPaymentList, usePaymentList } from '@/hooks/useCustomers'
import { useAuthStore } from '@/stores/authStore'
import { exportFilteredList, LIST_EXPORT_MAX_ROWS } from '@/lib/listExport'
import { toastErrorBi } from '@/lib/bilingual/toast'

const PAYMENT_EXPORT_HEADERS = ['Date', 'Client', 'Enregistre par', 'Montant CFA', 'Inverse', 'Note']

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
  const [datePreset, setDatePreset] = useState<ListDatePreset | null>(null)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const isCashier = useAuthStore((s) => s.staff?.role === 'cashier')

  const pageSize = 30

  const dateRange = useMemo(
    () =>
      datePreset
        ? resolveReportDateRange(datePreset, customStart, customEnd)
        : null,
    [datePreset, customStart, customEnd],
  )
  const dateSeed = useMemo(() => resolveReportDateRange('today'), [])

  const { data, isLoading, isError } = usePaymentList({
    page,
    pageSize,
    customerSearch,
    showReversed,
    startDate: dateRange?.startDate,
    endDate: dateRange?.endDate,
  })

  const payments = data?.data ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  async function handleExport(kind: 'csv' | 'xlsx') {
    try {
      const result = await fetchPaymentList({
        page: 0,
        pageSize: LIST_EXPORT_MAX_ROWS,
        customerSearch,
        showReversed,
        startDate: dateRange?.startDate,
        endDate: dateRange?.endDate,
      })
      const body = result.data.map((p) => [
        p.recorded_at,
        p.customer_name ?? '',
        p.recorded_by_name ?? '',
        p.amount_cfa,
        p.is_reversed ? '1' : '0',
        p.note ?? '',
      ])
      exportFilteredList({
        kind,
        basename: 'paiements',
        sheetName: 'Paiements',
        headers: PAYMENT_EXPORT_HEADERS,
        rows: body,
      })
      if (result.count > LIST_EXPORT_MAX_ROWS) {
        toastErrorBi(COMMON.exportTruncated)
      }
    } catch {
      toastErrorBi(COMMON.failedToLoadData)
    }
  }

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
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={totalCount === 0}
                onClick={() => void handleExport('csv')}
              >
                <BiButtonInline {...COMMON.exportCsv} />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={totalCount === 0}
                onClick={() => void handleExport('xlsx')}
              >
                <BiButtonInline {...COMMON.exportXlsx} />
              </Button>
            </div>
          }
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
          <DatePresetFilter
            className="mt-3"
            preset={datePreset}
            onPresetChange={(p) => {
              setDatePreset(p)
              setPage(0)
              if (p === 'custom' && !customStart && !customEnd) {
                setCustomStart(dateSeed.startDate)
                setCustomEnd(dateSeed.endDate)
              }
            }}
            customStart={customStart || dateSeed.startDate}
            customEnd={customEnd || dateSeed.endDate}
            onCustomStartChange={(v) => {
              setCustomStart(v)
              setPage(0)
            }}
            onCustomEndChange={(v) => {
              setCustomEnd(v)
              setPage(0)
            }}
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
