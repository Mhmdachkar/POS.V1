/**
 * ShiftDetailDrawer — identity + cash totals for one shift.
 *
 * Open shifts show a live estimated running total and Close when authorized.
 * Closed shifts show frozen expected / actual / discrepancy.
 */

import { useState } from 'react'
import { Button, Drawer, ShiftStatusBadge, Skeleton } from '@/components/ui'
import { formatCFA, formatDateTime } from '@/lib/formatters'
import { cn } from '@/lib/cn'
import {
  canCloseShift,
  canSelectShiftForPos,
  estimateExpectedCash,
  useShiftDetail,
} from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'
import { CloseShiftModal } from './CloseShiftModal'

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2 mt-4 first:mt-0">
      {title}
    </p>
  )
}

function DetailRow({
  label,
  value,
  mono,
  danger,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  danger?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary flex-shrink-0">{label}</span>
      <span className={cn(
        'text-sm text-right text-text-primary',
        mono && 'font-mono',
        danger && 'text-danger font-semibold',
      )}>
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
  const posShiftId = usePOSStore((s) => s.shiftId)
  const setShiftId = usePOSStore((s) => s.setShiftId)
  const { data: shift, isLoading, isError } = useShiftDetail(shiftId)

  const canClose = canCloseShift(staff, shift)
  const canSelect = canSelectShiftForPos(staff, shift)
  const isCurrent = !!shift && posShiftId === shift.id
  const estimated = shift
    ? estimateExpectedCash(shift.opening_float_cfa, shift.running)
    : 0

  return (
    <>
      <Drawer
        open={!!shiftId}
        onClose={onClose}
        title="Shift Detail"
        description={shift ? formatDateTime(shift.opened_at) : undefined}
        width="lg"
      >
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError || !shift ? (
          <p className="text-sm text-danger">Failed to load shift details.</p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <ShiftStatusBadge status={shift.status} />
                {isCurrent && (
                  <span className="text-xs font-medium text-primary">Current</span>
                )}
              </div>
              <div className="flex gap-1.5">
                {canSelect && !isCurrent && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShiftId(shift.id)}
                  >
                    Select for POS
                  </Button>
                )}
                {canClose && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowClose(true)}
                  >
                    Close Shift
                  </Button>
                )}
              </div>
            </div>

            <SectionHeader title="Identity" />
            <DetailRow label="ID" value={shift.id} mono />
            <DetailRow label="Depot" value={shift.depot_name} />
            <DetailRow label="Cashier" value={shift.cashier_name ?? '—'} />
            <DetailRow label="Opened" value={formatDateTime(shift.opened_at)} />

            <SectionHeader title={shift.status === 'open' ? 'Current running total' : 'Cash'} />
            <DetailRow label="Opening Float" value={formatCFA(shift.opening_float_cfa)} />
            <DetailRow label="Sales Cash" value={formatCFA(shift.running.sales_cash_cfa)} />
            <DetailRow label="Customer Payments" value={formatCFA(shift.running.customer_pmts_cfa)} />
            <DetailRow label="Cash Refunded" value={formatCFA(shift.running.return_cash_cfa)} />
            {shift.status === 'open' ? (
              <DetailRow label="Estimated Expected" value={formatCFA(estimated)} />
            ) : (
              <>
                <DetailRow label="Expected Cash" value={formatCFA(shift.expected_cash_cfa)} />
                <DetailRow label="Actual Cash" value={formatCFA(shift.actual_cash_cfa)} />
                <DetailRow
                  label="Discrepancy"
                  value={formatCFA(shift.discrepancy_cfa)}
                  danger={(shift.discrepancy_cfa ?? 0) < 0}
                />
                <DetailRow label="Closed by" value={shift.closed_by_name ?? '—'} />
                <DetailRow label="Closed at" value={formatDateTime(shift.closed_at)} />
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
