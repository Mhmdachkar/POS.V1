/**
 * ShiftsPage — open, close, and review cashier shifts.
 */

import { useEffect, useState } from 'react'
import { BiButtonStack, BiEmptyTitle, BiPageTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { COMMON } from '@/lib/bilingual/common'
import { Clock } from 'lucide-react'
import { NavPictogram } from '@/components/layout/NavPictogram'
import { OpenShiftModal } from './components/OpenShiftModal'
import { persistPosShiftSelection } from '@/lib/posShiftPersistence'
import { cn } from '@/lib/cn'
import {
  Button,
  EmptyState,
  FilterBar,
  MoneyDisplay,
  PageHeader,
  PaginationBar,
  RowChevron,
  CLICKABLE_ROW,
  ShiftStatusBadge,
  Skeleton,
  type FilterBarChip,
} from '@/components/ui'
import { SHIFT_STATUS } from '@/lib/bilingual/status'
import { formatDate, formatTime } from '@/lib/formatters'
import {
  SHIFT_PAGE_SIZE,
  canAccessShifts,
  clampShiftPage,
  useShiftsList,
  type ShiftListItem,
} from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import type { ShiftStatus } from '@/types/database'
import { ShiftDetailDrawer } from './components/ShiftDetailDrawer'
import { t } from '@/lib/bilingual/types'


function statusChips(): FilterBarChip[] {
  return [
    { value: 'all', label: t(COMMON.all) },
    { value: 'open', label: t(SHIFT_STATUS.open) },
    { value: 'closed', label: t(SHIFT_STATUS.closed) },
  ]
}

function TableSkeleton({ showDepot }: { showDepot: boolean }) {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 bg-surface border-b border-border">
          <Skeleton className="h-5 w-16 rounded-full" />
          {showDepot && <Skeleton className="h-4 w-28" />}
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-28 ml-auto" />
        </div>
      ))}
    </div>
  )
}

export function ShiftsPage() {
  const [statusFilter, setStatusFilter] = useState<ShiftStatus | null>(null)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showOpen, setShowOpen] = useState(false)

  const staff = useAuthStore((s) => s.staff)
  const currentDepotId = useDepotStore((s) => s.currentDepotId)

  const isAdmin = staff?.role === 'admin'
  const showDepot = isAdmin && !currentDepotId
  const depotId = staff?.role === 'cashier' ? staff.depot_id : currentDepotId
  const canOpen = canAccessShifts(staff?.role)

  useEffect(() => {
    setPage(0)
  }, [currentDepotId])

  const { data, isLoading, isError } = useShiftsList({
    depotId,
    status: statusFilter,
    page,
    pageSize: SHIFT_PAGE_SIZE,
  })

  const shifts = data?.data ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / SHIFT_PAGE_SIZE)

  useEffect(() => {
    if (isLoading) return
    const next = clampShiftPage(page, totalPages)
    if (next !== page) setPage(next)
  }, [isLoading, page, totalPages])

  const handleChipChange = (value: string) => {
    setStatusFilter(value === 'all' ? null : (value as ShiftStatus))
    setPage(0)
  }

  const showCashier = isLoading || shifts.some((s) => Boolean(s.cashier_name))
  const gridCols = showDepot
    ? showCashier
      ? 'grid-cols-[5.5rem_minmax(5rem,0.9fr)_minmax(7rem,1.1fr)_4.5rem_5.75rem_6.5rem_1.25rem]'
      : 'grid-cols-[5.5rem_minmax(5rem,0.9fr)_4.5rem_5.75rem_6.5rem_1.25rem]'
    : showCashier
      ? 'grid-cols-[5.5rem_minmax(7rem,1fr)_4.5rem_5.75rem_6.5rem_1.25rem]'
      : 'grid-cols-[5.5rem_4.5rem_5.75rem_6.5rem_1.25rem]'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...SHIFT_COPY.pageTitle} />}
          icon={<NavPictogram path="/shifts" size="header" />}
          className="border-b-0"
          actions={
            canOpen ? (
              <Button onClick={() => setShowOpen(true)}>
                <BiButtonStack {...SHIFT_COPY.openShift} />
              </Button>
            ) : undefined
          }
        />
        <div className="px-3 sm:px-6 pb-3 sm:pb-4">
          <FilterBar
            chips={statusChips()}
            activeChip={statusFilter ?? 'all'}
            onChipChange={handleChipChange}
            count={totalCount}
          />
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
        {isLoading ? (
          <TableSkeleton showDepot={showDepot} />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title={<BiEmptyTitle {...SHIFT_COPY.failedToLoad} />}
              description={t(COMMON.checkConnection)}
            />
          </div>
        ) : shifts.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title={<BiEmptyTitle {...SHIFT_COPY.noShifts} />}
              description={
                statusFilter
                  ? t(SHIFT_COPY.noShiftsMatch)
                  : t(SHIFT_COPY.noShiftsHint)
              }
            />
            {canOpen && !statusFilter && (
              <div className="mt-4 flex justify-center">
                <Button onClick={() => setShowOpen(true)}>
                  <BiButtonStack {...SHIFT_COPY.openShift} />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border">
              <div className={cn('grid gap-4 px-4 py-2', gridCols)}>
                <BiTableHeader {...COMMON.status} />
                {showDepot && <BiTableHeader {...COMMON.depot} />}
                {showCashier && <BiTableHeader {...COMMON.cashier} />}
                <BiTableHeader {...COMMON.opened} />
                <span className="text-right">
                  <BiTableHeader {...COMMON.float} />
                </span>
                <span className="text-right">
                  <BiTableHeader {...COMMON.discrepancy} />
                </span>
                <span aria-hidden="true" />
              </div>
            </div>

            {shifts.map((shift: ShiftListItem) => (
              <button
                key={shift.id}
                type="button"
                onClick={() => setSelectedId(shift.id)}
                className={cn(
                  'w-full text-left grid gap-4 px-4 py-3 min-h-[44px] items-center',
                  gridCols,
                  'border-b border-border',
                  CLICKABLE_ROW,
                  selectedId === shift.id && 'bg-primary-subtle',
                )}
                aria-label={`${t(COMMON.view)} — ${shift.cashier_name ?? t(COMMON.cashier)}`}
              >
                <span className="whitespace-nowrap">
                  <ShiftStatusBadge status={shift.status} />
                </span>
                {showDepot && (
                  <span className="text-sm text-text-primary truncate">{shift.depot_name}</span>
                )}
                {showCashier && (
                  <span className="text-sm text-text-primary truncate font-medium">
                    {shift.cashier_name ?? '—'}
                  </span>
                )}
                <span className="flex flex-col leading-tight">
                  <span className="text-sm text-text-primary tabular-nums">
                    {formatTime(shift.opened_at)}
                  </span>
                  <span className="text-xs text-text-secondary whitespace-nowrap">
                    {formatDate(shift.opened_at)}
                  </span>
                </span>
                <span className="text-right">
                  <MoneyDisplay amount={shift.opening_float_cfa} size="small" />
                </span>
                <span className="text-right">
                  {shift.status === 'closed' ? (
                    <MoneyDisplay
                      amount={shift.discrepancy_cfa}
                      size="small"
                      tone={(shift.discrepancy_cfa ?? 0) !== 0 ? 'debt' : 'default'}
                    />
                  ) : (
                    <span className="text-sm text-text-secondary">—</span>
                  )}
                </span>
                <RowChevron />
              </button>
            ))}

            <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      <ShiftDetailDrawer
        shiftId={selectedId}
        onClose={() => setSelectedId(null)}
      />
      <OpenShiftModal
        open={showOpen}
        onClose={() => setShowOpen(false)}
        onOpened={(shiftId) => persistPosShiftSelection(shiftId)}
      />
    </div>
  )
}
