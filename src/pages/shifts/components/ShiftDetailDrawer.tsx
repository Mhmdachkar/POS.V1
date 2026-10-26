/**
 * ShiftDetailDrawer — cash control + identity for one shift.
 *
 * Open shifts show a live estimated running total and Close when authorized.
 * Closed shifts show frozen expected / actual / discrepancy.
 *
 * Hierarchy: cash summary → expected/actual → discrepancy → context → actions.
 * No edit / handover / settlement entity — those are not in the shift model.
 */

import { useState, type ReactNode } from 'react'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { COMMON } from '@/lib/bilingual/common'
import { BiButtonStack, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { DoorClosed } from 'lucide-react'
import { Button, Drawer, MoneyDisplay, ShiftStatusBadge, Skeleton } from '@/components/ui'
import { formatCFA, formatDateTime } from '@/lib/formatters'
import { cn } from '@/lib/cn'
import {
  canCloseShift,
  estimateExpectedCash,
  useShiftDetail,
} from '@/hooks/useShifts'
import { useUnshiftedSalesForShiftWindow } from '@/hooks/useSales'
import {
  formatShiftTimeRange,
  UNSHIFTED_OPEN_PERIOD_NOTE,
  UNSHIFTED_SHIFT_WINDOW_NOTE,
} from '@/lib/shiftAttribution'
import { useAuthStore } from '@/stores/authStore'
import { CloseShiftModal } from './CloseShiftModal'
import { t } from '@/lib/bilingual/types'


function SectionHeader({ title }: { title: ReactNode }) {
  return (
    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2 mt-4 first:mt-0">
      {title}
    </p>
  )
}

function CashRow({
  label,
  value,
  strong,
}: {
  label: string
  value: React.ReactNode
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span
        className={cn(
          'text-sm flex-shrink-0',
          strong ? 'font-semibold text-text-secondary uppercase tracking-wide' : 'text-text-secondary',
        )}
      >
        {label}
      </span>
      <span className={cn('text-right', strong && 'font-semibold')}>{value}</span>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary flex-shrink-0">{label}</span>
      <span className={cn('text-sm text-right text-text-primary font-medium', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  )
}

interface ShiftDetailDrawerProps {
  shiftId: string | null
  onClose: () => void
}

export function ShiftDetailDrawer({ shiftId, onClose }: ShiftDetailDrawerProps) {
  const [showClose, setShowClose] = useState(false)
  const staff = useAuthStore((s) => s.staff)
  const { data: shift, isLoading, isError } = useShiftDetail(shiftId)
  const { data: unshifted } = useUnshiftedSalesForShiftWindow(
    shift
      ? { cashierId: shift.cashier_id, openedAt: shift.opened_at, closedAt: shift.closed_at }
      : null,
  )
  const unshiftedCount = unshifted?.count ?? 0
  const unshiftedTotal = unshifted?.total_cfa ?? 0

  const canClose = canCloseShift(staff, shift)
  const estimated = shift
    ? estimateExpectedCash(shift.opening_float_cfa, shift.running)
    : 0
  const isOpen = shift?.status === 'open'
  const discrepancy = shift?.discrepancy_cfa ?? null
  const hasDiscrepancy = !isOpen && discrepancy != null && discrepancy !== 0

  const drawerTitle = isLoading
    ? 'Shift Detail'
    : shift
      ? (shift.cashier_name ?? `Shift ${shift.id.slice(0, 8)}`)
      : 'Shift Detail'

  return (
    <>
      <Drawer
        open={!!shiftId}
        onClose={onClose}
        title={drawerTitle}
        description={shift ? shift.depot_name : undefined}
        width="lg"
      >
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError || !shift ? (
          <p className="text-sm text-danger-foreground">{t(SHIFT_COPY.failedDetail)}</p>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-4 -mt-1">
              <ShiftStatusBadge status={shift.status} />
            </div>

            <div className="rounded-md border border-border px-3 py-2 mb-4 space-y-1">
              <DetailRow label={t(SHIFT_COPY.shiftLabel)} value={formatShiftTimeRange(shift.opened_at, shift.closed_at)} />
              <DetailRow label={t(COMMON.cashier)} value={shift.cashier_name ?? '—'} />
            </div>

            <SectionHeader title={<BiSectionTitle {...SHIFT_COPY.cashSummary} />} />
            <div className="space-y-0">
              <CashRow
                label={t(SHIFT_COPY.openingFloat)}
                value={<MoneyDisplay amount={shift.opening_float_cfa} size="small" />}
              />
              <CashRow
                label={t(SHIFT_COPY.salesCash)}
                value={<MoneyDisplay amount={shift.running.sales_cash_cfa} size="small" />}
              />
              <CashRow
                label={t(SHIFT_COPY.customerPayments)}
                value={<MoneyDisplay amount={shift.running.customer_pmts_cfa} size="small" />}
              />
              <CashRow
                label={t(SHIFT_COPY.returnCash)}
                value={
                  <MoneyDisplay
                    amount={
                      shift.running.return_cash_cfa === 0
                        ? 0
                        : -Math.abs(shift.running.return_cash_cfa)
                    }
                    size="small"
                  />
                }
              />
            </div>

            <div className="mt-3 rounded-md bg-surface-muted px-3 py-2 space-y-1">
              <CashRow
                label={t(SHIFT_COPY.expectedCash)}
                strong
                value={
                  <MoneyDisplay
                    amount={isOpen ? estimated : shift.expected_cash_cfa}
                    size="medium"
                  />
                }
              />
              <CashRow
                label={t(SHIFT_COPY.actualCash)}
                strong
                value={
                  isOpen ? (
                    <span className="text-sm text-text-secondary">—</span>
                  ) : (
                    <MoneyDisplay amount={shift.actual_cash_cfa} size="medium" />
                  )
                }
              />
            </div>

            {!isOpen && discrepancy != null && (
              <div
                className={cn(
                  'mt-2 rounded-md px-3 py-2.5 flex items-center justify-between gap-4',
                  hasDiscrepancy ? 'bg-danger-bg' : 'bg-surface-muted',
                )}
              >
                <span
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wide',
                    hasDiscrepancy ? 'text-danger-foreground' : 'text-text-secondary',
                  )}
                >
                  {t(SHIFT_COPY.discrepancy)}
                </span>
                <MoneyDisplay
                  amount={discrepancy}
                  size="medium"
                  danger={discrepancy !== 0}
                />
              </div>
            )}

            <div
              className="mt-3 rounded-md border border-warning/20 bg-warning-bg px-3 py-2"
              data-testid="unshifted-shift-sales"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-warning-foreground">
                  {t(SHIFT_COPY.salesWithoutShift)}
                </span>
                <span className="text-sm font-medium tabular-nums text-warning-foreground">
                  {unshiftedCount} vente{unshiftedCount === 1 ? '' : 's'} · {formatCFA(unshiftedTotal)}
                </span>
              </div>
              <p className="mt-1 text-xs text-warning-foreground leading-snug">
                {UNSHIFTED_SHIFT_WINDOW_NOTE}
                {isOpen ? ` ${UNSHIFTED_OPEN_PERIOD_NOTE}` : ''}
              </p>
            </div>

            <SectionHeader title={<BiSectionTitle {...SHIFT_COPY.shiftDetails} />} />
            <DetailRow label={t(COMMON.depot)} value={shift.depot_name} />
            <DetailRow label={t(COMMON.cashier)} value={shift.cashier_name ?? '—'} />
            <DetailRow label={t(SHIFT_COPY.opened)} value={formatDateTime(shift.opened_at)} />
            <DetailRow
              label={t(SHIFT_COPY.closed)}
              value={isOpen ? '—' : formatDateTime(shift.closed_at)}
            />
            {!isOpen && (
              <DetailRow label={t(SHIFT_COPY.closedBy)} value={shift.closed_by_name ?? '—'} />
            )}
            <DetailRow label={t(SHIFT_COPY.shiftId)} value={shift.id} mono />

            {canClose && (
              <>
                <SectionHeader title={<BiSectionTitle {...COMMON.actions} />} />
                <div className="space-y-2">
                  <Button
                    variant="primary"
                    className="w-full gap-2"
                    onClick={() => setShowClose(true)}
                  >
                    <DoorClosed className="h-4 w-4" />
                    <BiButtonStack {...SHIFT_COPY.closeShift} />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Drawer>

      {shift && (
        <CloseShiftModal
          open={showClose}
          onClose={() => setShowClose(false)}
          shift={shift}
        />
      )}
    </>
  )
}
