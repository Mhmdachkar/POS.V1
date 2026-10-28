/**
 * CustomerActivityPage — paginated account activity for one customer.
 *
 * Newest first. Sales, returns, and standalone payments are separate events.
 * Current balance is read from the customer record, never from visible rows.
 */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, FileText, MessageCircle, ScrollText } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Badge,
  Button,
  EmptyState,
  LoadingButton,
  MoneyDisplay,
  PageHeader,
  PaginationBar,
  Skeleton,
} from '@/components/ui'
import { formatDate, formatMoney } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { NAV } from '@/lib/bilingual/nav'
import { COMMON } from '@/lib/bilingual/common'
import {
  BiEmptyDescription,
  BiEmptyTitle,
  BiButtonInline,
} from '@/lib/bilingual/ui'
import { useCustomer } from '@/hooks/useCustomers'
import {
  CUSTOMER_ACTIVITY_PAGE_SIZE,
  emptyActivityMessage,
  formatActivityRange,
  useCustomerActivity,
  useCustomerActivitySummary,
  withRunningBalances,
  type CustomerActivityTypeFilter,
} from '@/hooks/useCustomerActivity'
import {
  downloadCustomerAccountXlsx,
  fetchCustomerAccountExport,
} from '@/lib/customerAccountExport'
import { exportCustomerStatement } from '@/lib/loadCustomerStatement'
import { LEDGER_PERIOD_SQL_NOTE_THRESHOLD } from '@/lib/customerStatement'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { SaleDetailDrawer } from '@/pages/sales/components/SaleDetailDrawer'
import { CustomerFinancialSummary } from './components/CustomerFinancialSummary'
import { CustomerAvatar } from '@/components/customers/CustomerAvatar'
import { t } from '@/lib/bilingual/types'
import {
  ActivityFilterTabs,
  ActivityTypeBadge,
  SignedActivityAmount,
} from './components/CustomerActivitySection'

const ACTIVITY_GRID =
  'grid-cols-[4.75rem_minmax(6.5rem,1fr)_minmax(6rem,1.4fr)_6.75rem_6.5rem_6.5rem]'

function TableSkeleton() {
  return (
    <div className="space-y-px" role="status" aria-label={t(CUSTOMERS.loadingActivity)}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={cn('grid gap-4 px-4 py-3 bg-surface border-b border-border items-center', ACTIVITY_GRID)}
        >
          <Skeleton className="h-5 w-full max-w-[4.5rem] rounded-full" />
          <Skeleton className="h-4 w-full max-w-[8rem]" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full max-w-[5rem] justify-self-end" />
        </div>
      ))}
    </div>
  )
}

export function CustomerActivityPage() {
  const { customerId } = useParams<{ customerId: string }>()
  const [filter, setFilter] = useState<CustomerActivityTypeFilter>('all')
  const [page, setPage] = useState(0)
  const [saleDetailId, setSaleDetailId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const isAdmin = useAuthStore((s) => s.staff?.role === 'admin')
  const depotId = useDepotStore((s) => s.currentDepotId)

  const { data: customer, isLoading: loadingCustomer } = useCustomer(customerId ?? null)
  const {
    data: activity,
    isLoading: loadingActivity,
    isError,
    refetch,
  } = useCustomerActivity(customerId ?? null, {
    type: filter,
    page,
    pageSize: CUSTOMER_ACTIVITY_PAGE_SIZE,
  })
  const { data: summary, isLoading: loadingSummary } = useCustomerActivitySummary(
    customerId ?? null,
  )

  const rows = withRunningBalances(
    activity?.data ?? [],
    customer?.balance_owed_cfa ?? 0,
  )
  const totalCount = activity?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / CUSTOMER_ACTIVITY_PAGE_SIZE))
  const isLoading = loadingCustomer || loadingActivity

  const handleFilterChange = (next: CustomerActivityTypeFilter) => {
    setFilter(next)
    setPage(0)
  }

  const handleExport = async (kind: 'xlsx') => {
    if (!customer) return
    setExportError('')
    setExporting(true)
    try {
      const dataset = await fetchCustomerAccountExport(customer.id)
      downloadCustomerAccountXlsx(dataset)
    } catch (err) {
      setExportError(parseError(err).message || t(CUSTOMERS.exportAccountFailed))
    } finally {
      setExporting(false)
    }
  }

  const handleStatement = async (mode: 'pdf' | 'whatsapp') => {
    if (!customer) return
    setExportError('')
    setExporting(true)
    try {
      await exportCustomerStatement({
        customer,
        depotId,
        periodFromYmd: periodFrom || null,
        periodToYmd: periodTo || null,
        mode,
      })
    } catch (err) {
      setExportError(parseError(err).message || t(CUSTOMERS.exportAccountFailed))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <div className="px-6 pt-3">
          <Link
            to="/customers"
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <BiButtonInline {...NAV.customers} />
          </Link>
        </div>
        <PageHeader
          title={
            loadingCustomer || !customer ? (
              t(CUSTOMERS.customerActivity)
            ) : (
              <span className="inline-flex items-center gap-3">
                <CustomerAvatar
                  name={customer.name}
                  balanceOwedCfa={customer.balance_owed_cfa}
                  isActive={customer.is_active}
                />
                <span>{customer.name}</span>
              </span>
            )
          }
          className="border-b-0 pt-2"
          actions={
            customer ? (
              <div className="flex flex-col items-end gap-2">
                <div className="text-right">
                  <p className="text-xs text-text-secondary">{t(CUSTOMERS.outstandingBalance)}</p>
                  <MoneyDisplay
                    amount={customer.balance_owed_cfa}
                    size="medium"
                    danger={customer.balance_owed_cfa > 0}
                    className={customer.balance_owed_cfa <= 0 ? 'text-success-foreground' : undefined}
                  />
                </div>
                {isAdmin && (
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <label className="text-xs text-text-secondary flex items-center gap-1">
                        <span>{t(CUSTOMERS.statementPeriodFrom)}</span>
                        <input
                          type="date"
                          value={periodFrom}
                          onChange={(e) => setPeriodFrom(e.target.value)}
                          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                        />
                      </label>
                      <label className="text-xs text-text-secondary flex items-center gap-1">
                        <span>{t(CUSTOMERS.statementPeriodTo)}</span>
                        <input
                          type="date"
                          value={periodTo}
                          onChange={(e) => setPeriodTo(e.target.value)}
                          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <LoadingButton
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        loading={exporting}
                        disabled={exporting}
                        onClick={() => { void handleExport('xlsx') }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <BiButtonInline {...CUSTOMERS.exportAccountExcel} />
                      </LoadingButton>
                      <LoadingButton
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        loading={exporting}
                        disabled={exporting}
                        onClick={() => { void handleStatement('pdf') }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <BiButtonInline {...CUSTOMERS.statementPdf} />
                      </LoadingButton>
                      <LoadingButton
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        loading={exporting}
                        disabled={exporting}
                        onClick={() => { void handleStatement('whatsapp') }}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <BiButtonInline {...CUSTOMERS.statementWhatsApp} />
                      </LoadingButton>
                    </div>
                    {totalCount > LEDGER_PERIOD_SQL_NOTE_THRESHOLD && (
                      <p className="text-xs text-text-muted max-w-xs text-right">
                        {t(CUSTOMERS.statementLargeLedgerNote)}
                      </p>
                    )}
                  </div>
                )}
                {exportError && (
                  <p className="text-xs text-danger-foreground max-w-xs text-right">{exportError}</p>
                )}
              </div>
            ) : null
          }
        />
        <div className="px-6 pb-3 space-y-3">
          {customer && (
            <CustomerFinancialSummary
              layout="page"
              summary={summary}
              isLoading={loadingSummary}
              outstandingBalanceCfa={customer.balance_owed_cfa}
            />
          )}
          <ActivityFilterTabs value={filter} onChange={handleFilterChange} />
          {!isLoading && !isError && (
            <p className="text-sm text-text-secondary tabular-nums">
              {formatActivityRange(page, CUSTOMER_ACTIVITY_PAGE_SIZE, totalCount)}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto min-w-0">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<ScrollText className="h-8 w-8" />}
              title={<BiEmptyTitle {...CUSTOMERS.failedActivity} />}
              action={
                <Button variant="secondary" onClick={() => void refetch()}>
                  <BiButtonInline {...COMMON.retry} />
                </Button>
              }
            />
          </div>
        ) : !customer ? (
          <div className="p-8">
            <EmptyState
              icon={<ScrollText className="h-8 w-8" />}
              title={<BiEmptyTitle {...CUSTOMERS.notFound} />}
              description={<BiEmptyDescription {...CUSTOMERS.notFoundHint} />}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<ScrollText className="h-8 w-8" />}
              title={emptyActivityMessage(filter)}
            />
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border z-[1]">
              <div className={cn('grid gap-4 px-4 py-2 items-center', ACTIVITY_GRID)}>
                <span className="text-xs font-semibold text-text-secondary">{t(COMMON.type)}</span>
                <span className="text-xs font-semibold text-text-secondary">{t(COMMON.reference)}</span>
                <span className="text-xs font-semibold text-text-secondary">{t(COMMON.description)}</span>
                <span className="text-xs font-semibold text-text-secondary">{t(COMMON.date)}</span>
                <span className="text-xs font-semibold text-text-secondary text-right">{t(COMMON.amount)}</span>
                <span className="text-xs font-semibold text-text-secondary text-right">{t(CUSTOMERS.runningBalance)}</span>
              </div>
            </div>

            {rows.map((event) => {
              const clickable = Boolean(event.saleId && event.type !== 'payment')
              const cells = (
                <>
                  <span className="min-w-0">
                    <ActivityTypeBadge type={event.type} />
                  </span>
                  <span className="text-sm font-mono font-medium text-text-primary truncate min-w-0">
                    {event.reference}
                  </span>
                  <span className="text-sm text-text-secondary truncate min-w-0">
                    {event.description}
                    {event.isReversed && (
                      <Badge variant="neutral" className="ml-2 text-[10px]">{t(CUSTOMERS.activityReversed)}</Badge>
                    )}
                  </span>
                  <span className="text-sm text-text-secondary whitespace-nowrap">
                    {formatDate(event.occurredAt)}
                  </span>
                  <span className="text-right min-w-0">
                    <SignedActivityAmount event={event} />
                  </span>
                  <span className="text-right text-sm tabular-nums text-text-primary">
                    {formatMoney(event.runningBalanceCfa ?? 0)}
                  </span>
                </>
              )

              if (clickable) {
                return (
                  <button
                    key={`${event.type}-${event.id}`}
                    type="button"
                    onClick={() => setSaleDetailId(event.saleId)}
                    aria-label={`${event.type} ${event.reference}`}
                    className={cn(
                      'w-full text-left grid gap-4 px-4 py-3 items-center',
                      ACTIVITY_GRID,
                      'border-b border-border hover:bg-surface-muted transition-colors',
                      'focus:outline-none focus:bg-primary-subtle',
                    )}
                  >
                    {cells}
                  </button>
                )
              }

              return (
                <div
                  key={`${event.type}-${event.id}`}
                  className={cn(
                    'grid gap-4 px-4 py-3 items-center border-b border-border',
                    ACTIVITY_GRID,
                  )}
                >
                  {cells}
                </div>
              )
            })}

            <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      <SaleDetailDrawer
        saleId={saleDetailId}
        shiftId={null}
        onClose={() => setSaleDetailId(null)}
      />
    </div>
  )
}
