/**
 * ShiftsPage — Read-only historical view of shifts.
 *
 * CEO Notes: Active shift workflow removed.
 * New operations do not use shifts (shift_id = NULL for new sales).
 * This page is now purely a historical record viewer.
 * Historical shift data is preserved and viewable.
 */

import { useEffect, useState } from 'react'
import { BiEmptyTitle, BiPageTitle } from '@/lib/bilingual/ui'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { COMMON } from '@/lib/bilingual/common'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Badge,
  EmptyState,
  FilterBar,
  MoneyDisplay,
  PageHeader,
  ShiftStatusBadge,
  Skeleton,
  type FilterBarChip,
} from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { formatDate, formatTime } from '@/lib/formatters'
import {
  SHIFT_PAGE_SIZE,
  clampShiftPage,
  useShiftsList,
  type ShiftListItem,
} from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import type { ShiftStatus } from '@/types/database'
import { ShiftDetailDrawer } from './components/ShiftDetailDrawer'

const STATUS_CHIPS: FilterBarChip[] = [
  { value: 'all', label: 'Tout / All' },
  { value: 'open', label: 'Ouvert / Open' },
  { value: 'closed', label: 'Fermé / Closed' },
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

  const staff = useAuthStore((s) => s.staff)
  const currentDepotId = useDepotStore((s) => s.currentDepotId)

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

  const handleChipChange = (value: string) => {
    setStatusFilter(value === 'all' ? null : (value as ShiftStatus))
    setPage(0)
  }

  // Status | [Depot] | Caissier | Ouvert | Float | Écart | Actions
  const gridCols = showDepot
    ? 'grid-cols-[5.5rem_minmax(5rem,0.9fr)_minmax(7rem,1.1fr)_4.5rem_5.75rem_6.5rem_5rem]'
    : 'grid-cols-[5.5rem_minmax(7rem,1fr)_4.5rem_5.75rem_6.5rem_5rem]'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...SHIFT_COPY.pageTitle} />}
          className="border-b-0"
        />
        <div className="px-3 sm:px-6 pb-3 sm:pb-4">
          <FilterBar
            chips={STATUS_CHIPS}
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
              description={COMMON.checkConnection.fr}
            />
          </div>
        ) : shifts.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title={<BiEmptyTitle {...SHIFT_COPY.noShifts} />}
              description={
                statusFilter
                  ? 'Aucun service ne correspond aux filtres.'
                  : 'Aucun service historique.'
              }
            />
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border">
              <div className={cn('grid gap-4 px-4 py-2', gridCols)}>
                <span className="text-xs font-semibold text-text-secondary uppercase">
                  <BilingualText fr="Statut" en="Status" variant="caption" layout="inline" />
                </span>
                {showDepot && (
                  <span className="text-xs font-semibold text-text-secondary uppercase">
                    <BilingualText fr="Dépôt" en="Depot" variant="caption" layout="inline" />
                  </span>
                )}
                <span className="text-xs font-semibold text-text-secondary uppercase">
                  <BilingualText fr="Caissier" en="Cashier" variant="caption" layout="inline" />
                </span>
                <span className="text-xs font-semibold text-text-secondary uppercase">
                  <BilingualText fr="Ouvert" en="Opened" variant="caption" layout="inline" />
                </span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">
                  <BilingualText fr="Flotte" en="Float" variant="caption" layout="inline" />
                </span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">
                  <BilingualText fr="Écart" en="Discrepancy" variant="caption" layout="inline" />
                </span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">
                  <BilingualText fr="Actions" en="Actions" variant="caption" layout="inline" />
                </span>
              </div>
            </div>

            {shifts.map((shift: ShiftListItem) => (
              <div
                key={shift.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(shift.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedId(shift.id)
                  }
                }}
                className={cn(
                  'w-full text-left grid gap-4 px-4 py-3 items-center',
                  gridCols,
                  'border-b border-border hover:bg-surface-muted transition-colors cursor-pointer',
                  'focus:outline-none focus:bg-primary-subtle',
                  selectedId === shift.id && 'bg-primary-subtle',
                )}
                aria-label={`Voir les détails du service — ${shift.cashier_name ?? 'caissier'}`}
              >
                <span>
                  <ShiftStatusBadge status={shift.status} />
                </span>
                {showDepot && (
                  <span className="text-sm text-text-primary truncate">{shift.depot_name}</span>
                )}
                <span className="text-sm text-text-primary truncate font-medium">
                  {shift.cashier_name ?? '—'}
                </span>
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
                      danger={(shift.discrepancy_cfa ?? 0) !== 0}
                    />
                  ) : (
                    <span className="text-sm text-text-secondary">—</span>
                  )}
                </span>
                <span
                  className="text-right"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-sm"
                    onClick={() => setSelectedId(shift.id)}
                  >
                    <BilingualText fr="Voir" en="View" variant="caption" layout="inline" />
                  </button>
                </span>
              </div>
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-sm text-text-secondary">
                  Page {page + 1} / {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 h-8 text-sm rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Précédent
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 h-8 text-sm rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Suivant →
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
    </div>
  )
}
