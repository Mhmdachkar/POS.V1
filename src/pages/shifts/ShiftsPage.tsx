/**
 * ShiftsPage — list, filter, open, select current POS shift, and close.
 *
 * Never auto-selects a shift. Cashier sees own depot (RLS). Admin can filter depot.
 */

import { useEffect, useState } from 'react'
import { Clock, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button, EmptyState, ShiftStatusBadge, Skeleton } from '@/components/ui'
import { formatCFA, formatDateTime } from '@/lib/formatters'
import {
  SHIFT_PAGE_SIZE,
  canSelectShiftForPos,
  clampShiftPage,
  useShiftsList,
  type ShiftListItem,
} from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { usePOSStore } from '@/stores/posStore'
import type { ShiftStatus } from '@/types/database'
import { ShiftDetailDrawer } from './components/ShiftDetailDrawer'
import { OpenShiftModal } from './components/OpenShiftModal'

const STATUS_OPTIONS: Array<{ value: ShiftStatus | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
]

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
  const posShiftId = usePOSStore((s) => s.shiftId)
  const setShiftId = usePOSStore((s) => s.setShiftId)

  const isAdmin = staff?.role === 'admin'
  const showDepot = isAdmin && !currentDepotId
  const depotId = staff?.role === 'cashier' ? staff.depot_id : currentDepotId

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

  const handleStatusChange = (status: ShiftStatus | null) => {
    setStatusFilter(status)
    setPage(0)
  }

  const handleSelectForPos = (shift: ShiftListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canSelectShiftForPos(staff, shift)) return
    setShiftId(shift.id)
  }

  const gridCols = showDepot
    ? 'grid-cols-[auto_1fr_1fr_auto_auto_auto_auto]'
    : 'grid-cols-[auto_1fr_auto_auto_auto_auto]'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-text-primary">Shifts</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {totalCount > 0
                ? `${totalCount} shift${totalCount !== 1 ? 's' : ''}`
                : 'Open and close cashier shifts'}
            </p>
          </div>

          {(staff?.role === 'admin' || staff?.role === 'cashier') && (
            <Button type="button" onClick={() => setShowOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Open Shift
            </Button>
          )}
        </div>

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

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <TableSkeleton showDepot={showDepot} />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title="Failed to load shifts"
              description="Check your connection and try again."
            />
          </div>
        ) : shifts.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title="No shifts found"
              description={
                statusFilter
                  ? 'No shifts match your current filters.'
                  : 'Open a shift to start attributing sales.'
              }
            />
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border">
              <div className={cn('grid gap-4 px-4 py-2', gridCols)}>
                <span className="text-xs font-semibold text-text-secondary uppercase">Status</span>
                {showDepot && (
                  <span className="text-xs font-semibold text-text-secondary uppercase">Depot</span>
                )}
                <span className="text-xs font-semibold text-text-secondary uppercase">Cashier</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Opened</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">Float</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">Discrepancy</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">Actions</span>
              </div>
            </div>

            {shifts.map((shift) => {
              const isCurrent = posShiftId === shift.id
              const selectable = canSelectShiftForPos(staff, shift)
              return (
                <button
                  key={shift.id}
                  type="button"
                  onClick={() => setSelectedId(shift.id)}
                  className={cn(
                    'w-full text-left grid gap-4 px-4 py-3',
                    gridCols,
                    'border-b border-border hover:bg-surface-muted transition-colors',
                    'focus:outline-none focus:bg-primary-subtle',
                    selectedId === shift.id && 'bg-primary-subtle',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <ShiftStatusBadge status={shift.status} />
                    {isCurrent && (
                      <span className="text-[10px] font-semibold uppercase text-primary">Current</span>
                    )}
                  </span>
                  {showDepot && (
                    <span className="text-sm text-text-primary truncate">{shift.depot_name}</span>
                  )}
                  <span className="text-sm text-text-primary truncate">{shift.cashier_name ?? '—'}</span>
                  <span className="text-sm text-text-secondary whitespace-nowrap">
                    {formatDateTime(shift.opened_at)}
                  </span>
                  <span className="text-sm tabular-nums text-right text-text-secondary">
                    {formatCFA(shift.opening_float_cfa)}
                  </span>
                  <span className={cn(
                    'text-sm tabular-nums text-right',
                    shift.status === 'closed' && (shift.discrepancy_cfa ?? 0) < 0
                      ? 'text-danger'
                      : 'text-text-secondary',
                  )}>
                    {shift.status === 'closed' ? formatCFA(shift.discrepancy_cfa) : '—'}
                  </span>
                  <span className="text-right">
                    {selectable && !isCurrent && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={(e) => handleSelectForPos(shift, e)}
                      >
                        Select for POS
                      </span>
                    )}
                  </span>
                </button>
              )
            })}

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

      <ShiftDetailDrawer
        shiftId={selectedId}
        onClose={() => setSelectedId(null)}
      />

      <OpenShiftModal
        open={showOpen}
        onClose={() => setShowOpen(false)}
        onOpened={(id) => {
          setShowOpen(false)
          setSelectedId(id)
        }}
      />
    </div>
  )
}
