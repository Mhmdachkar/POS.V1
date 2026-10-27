/**
 * TransfersPage — depot-to-depot stock transfer list and actions.
 *
 * Admin All Depots: combined view, Source + Destination columns, never a mutation target.
 * Admin selected depot / depot_staff: from OR to that depot.
 * Mutations always submit explicit depot IDs through Create Transfer.
 */

import { useEffect, useState } from 'react'
import { BiEmptyTitle, BiPageTitle } from '@/lib/bilingual/ui'
import { ADMIN } from '@/lib/bilingual/admin'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { COMMON } from '@/lib/bilingual/common'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { SALES } from '@/lib/bilingual/sales'
import { ArrowLeftRight, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button, EmptyState, PageHeader, PaginationBar, Skeleton, TransferStatusBadge } from '@/components/ui'
import { NavPictogram } from '@/components/layout/NavPictogram'
import { formatDateTime } from '@/lib/formatters'
import {
  TRANSFER_PAGE_SIZE,
  useTransfersList,
} from '@/hooks/useTransfers'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import type { TransferStatus } from '@/types/database'
import { TransferDetailDrawer } from './components/TransferDetailDrawer'
import { CreateTransferModal } from './components/CreateTransferModal'
import { TRANSFER_STATUS } from '@/lib/bilingual/status'
import { t } from '@/lib/bilingual/types'


function statusOptions(): Array<{ value: TransferStatus | null; label: string }> {
  return [
    { value: null, label: t(COMMON.all) },
    { value: 'pending', label: t(TRANSFER_STATUS.pending) },
    { value: 'completed', label: t(TRANSFER_STATUS.completed) },
    { value: 'cancelled', label: t(TRANSFER_STATUS.cancelled) },
  ]
}

export function clampTransferPage(page: number, totalPages: number): number {
  if (page <= 0) return 0
  if (totalPages === 0) return 0
  if (page >= totalPages) return totalPages - 1
  return page
}

function TableSkeleton({ gridCols }: { gridCols: string }) {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={cn('grid gap-4 px-4 py-3 bg-surface border-b border-border items-center', gridCols)}
        >
          <Skeleton className="h-5 w-full max-w-[5rem] rounded-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-8 justify-self-end" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  )
}

export function TransfersPage() {
  const [statusFilter, setStatusFilter] = useState<TransferStatus | null>(null)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const staff = useAuthStore((s) => s.staff)
  const currentDepotId = useDepotStore((s) => s.currentDepotId)

  const involvingDepotId =
    staff?.role === 'depot_staff' ? staff.depot_id : currentDepotId

  useEffect(() => {
    setPage(0)
  }, [currentDepotId])

  const { data, isLoading, isError } = useTransfersList({
    involvingDepotId,
    status: statusFilter,
    page,
    pageSize: TRANSFER_PAGE_SIZE,
  })

  const transfers = data?.data ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / TRANSFER_PAGE_SIZE)

  useEffect(() => {
    if (isLoading) return
    const next = clampTransferPage(page, totalPages)
    if (next !== page) setPage(next)
  }, [isLoading, page, totalPages])

  const handleStatusChange = (status: TransferStatus | null) => {
    setStatusFilter(status)
    setPage(0)
  }

  const gridCols =
    'grid-cols-[7rem_minmax(6rem,1fr)_minmax(6rem,1fr)_4rem_minmax(7rem,0.9fr)_minmax(9.5rem,10.5rem)]'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...TRANSFERS.pageTitle} />}
          description={
            totalCount > 0
              ? t(TRANSFERS.transferCount(totalCount))
              : t(TRANSFERS.pageDesc)
          }
          icon={<NavPictogram path="/transfers" size="header" />}
          className="border-b-0"
          actions={
            <Button
              type="button"
              onClick={() => setShowCreate(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              {t(TRANSFERS.createTransfer)}
            </Button>
          }
        />
        <div className="px-3 sm:px-6 pb-3 sm:pb-4 flex gap-1.5 overflow-x-auto">
          {statusOptions().map((opt) => (
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

      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
        {isLoading ? (
          <TableSkeleton gridCols={gridCols} />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<ArrowLeftRight className="h-8 w-8" />}
              title={<BiEmptyTitle {...TRANSFERS.failedToLoad} />}
              description={t(COMMON.checkConnection)}
            />
          </div>
        ) : transfers.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<ArrowLeftRight className="h-8 w-8" />}
              title={<BiEmptyTitle {...TRANSFERS.noTransfers} />}
              description={
                statusFilter
                  ? t(TRANSFERS.noTransfersMatch)
                  : t(TRANSFERS.createFirstHint)
              }
            />
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border z-[1]">
              <div className={cn('grid gap-4 px-4 py-2 items-center', gridCols)}>
                <span className="text-xs font-semibold text-text-secondary uppercase">{t(TRANSFERS.statusCol)}</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">{t(TRANSFERS.sourceCol)}</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">{t(TRANSFERS.destinationCol)}</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">{t(TRANSFERS.itemsCol)}</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">{t(TRANSFERS.createdBy)}</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">{t(TRANSFERS.createdAtCol)}</span>
              </div>
            </div>

            {transfers.map((transfer) => (
              <button
                key={transfer.id}
                type="button"
                onClick={() => setSelectedId(transfer.id)}
                className={cn(
                  'w-full text-left grid gap-4 px-4 py-3 items-center',
                  gridCols,
                  'border-b border-border hover:bg-surface-muted transition-colors',
                  'focus:outline-none focus:bg-primary-subtle',
                  selectedId === transfer.id && 'bg-primary-subtle',
                )}
              >
                <span className="min-w-0">
                  <TransferStatusBadge status={transfer.status} />
                </span>
                <span className="text-sm text-text-primary truncate min-w-0">{transfer.from_depot_name}</span>
                <span className="text-sm text-text-primary truncate min-w-0">{transfer.to_depot_name}</span>
                <span className="text-sm tabular-nums text-right text-text-secondary">
                  {transfer.item_count}
                </span>
                <span className="text-sm text-text-secondary truncate min-w-0">
                  {transfer.created_by_name ?? '—'}
                </span>
                <span className="text-sm text-text-secondary text-right whitespace-nowrap">
                  {formatDateTime(transfer.created_at)}
                </span>
              </button>
            ))}

            <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      <TransferDetailDrawer
        transferId={selectedId}
        onClose={() => setSelectedId(null)}
      />

      <CreateTransferModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => {
          setShowCreate(false)
          setSelectedId(id)
        }}
      />
    </div>
  )
}
