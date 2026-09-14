/**
 * CloseShiftModal — confirm, then close_shift(), then show server totals.
 *
 * Confirmation (actual cash + irreversible checkbox) happens BEFORE the RPC.
 * Estimated preview is not authority. Server CloseShiftResult is the result screen.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Input, LoadingButton, Modal } from '@/components/ui'
import { formatCFA } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import {
  estimateExpectedCash,
  parseNonNegativeCfa,
  useCloseShift,
  type ShiftDetailData,
} from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'
import type { CloseShiftResult } from '@/types/rpc'
import { cn } from '@/lib/cn'

interface CloseShiftModalProps {
  open: boolean
  onClose: () => void
  shift: ShiftDetailData
}

function BreakdownRow({
  label,
  value,
  emphasis,
  danger,
}: {
  label: string
  value: number
  emphasis?: boolean
  danger?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className={cn('text-text-secondary', emphasis && 'font-semibold text-text-primary')}>
        {label}
      </span>
      <span className={cn(
        'tabular-nums',
        danger ? 'text-danger font-semibold' : emphasis ? 'font-semibold text-text-primary' : 'text-text-primary',
      )}>
        {formatCFA(value)}
      </span>
    </div>
  )
}

export function CloseShiftModal({ open, onClose, shift }: CloseShiftModalProps) {
  const staff = useAuthStore((s) => s.staff)
  const posShiftId = usePOSStore((s) => s.shiftId)
  const setShiftId = usePOSStore((s) => s.setShiftId)
  const { mutateAsync: closeShift, isPending } = useCloseShift()

  const [actualStr, setActualStr] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [result, setResult] = useState<CloseShiftResult | null>(null)

  useEffect(() => {
    if (!open) return
    setActualStr('')
    setConfirmed(false)
    setFormError(null)
    setResult(null)
  }, [open, shift.id])

  const actual = parseNonNegativeCfa(actualStr)
  const estimatedExpected = estimateExpectedCash(shift.opening_float_cfa, shift.running)
  const estimatedDiscrepancy = actual === null ? null : actual - estimatedExpected
  const canSubmit = actual !== null && confirmed && !isPending && !result
  const closingOthers = staff?.id && staff.id !== shift.cashier_id

  const handleCloseShift = async () => {
    if (actual === null || !confirmed) return
    setFormError(null)
    try {
      const data = await closeShift({
        p_shift_id: shift.id,
        p_actual_cash_cfa: actual,
      })
      if (posShiftId === shift.id) setShiftId(null)
      setResult(data)
      toast.success('Shift closed.')
    } catch (err) {
      const parsed = parseError(err)
      if (parsed.code === 'SHIFT_NOT_OPEN') {
        if (posShiftId === shift.id) setShiftId(null)
        setFormError('This shift is already closed.')
      } else {
        setFormError(parsed.message)
      }
    }
  }

  const handleDismiss = () => {
    if (isPending) return
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleDismiss}
      title={result ? 'Shift Closed' : 'Close Shift'}
      description={result ? 'Server-authoritative totals.' : 'This action is irreversible.'}
      size="sm"
    >
      {result ? (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-surface-muted p-3 space-y-1.5">
            <BreakdownRow label="Opening Float" value={result.breakdown.opening_float_cfa} />
            <BreakdownRow label="+ Sales Cash" value={result.breakdown.sales_cash_cfa} />
            <BreakdownRow label="+ Customer Payments" value={result.breakdown.customer_pmts_cfa} />
            <BreakdownRow label="− Cash Refunds" value={result.breakdown.return_cash_cfa} />
            <div className="border-t border-border pt-1.5">
              <BreakdownRow label="Expected Cash" value={result.expected_cash_cfa} emphasis />
            </div>
            <BreakdownRow label="Actual Cash" value={result.actual_cash_cfa} />
            <BreakdownRow
              label="Discrepancy"
              value={result.discrepancy_cfa}
              emphasis
              danger={result.discrepancy_cfa < 0}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleDismiss}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {closingOthers && (
            <p className="text-sm text-warning-foreground bg-warning-bg border border-warning/20 rounded-md px-3 py-2">
              You are closing a shift opened by {shift.cashier_name ?? 'another cashier'}.
            </p>
          )}

          <div className="rounded-md border border-border bg-surface-muted p-3 space-y-1.5">
            <p className="text-xs font-semibold text-text-secondary uppercase">Estimated</p>
            <BreakdownRow label="Opening Float" value={shift.opening_float_cfa} />
            <BreakdownRow label="+ Sales Cash" value={shift.running.sales_cash_cfa} />
            <BreakdownRow label="+ Customer Payments" value={shift.running.customer_pmts_cfa} />
            <BreakdownRow label="− Cash Refunds" value={shift.running.return_cash_cfa} />
            <BreakdownRow label="Estimated Expected" value={estimatedExpected} emphasis />
            {estimatedDiscrepancy !== null && (
              <BreakdownRow
                label="Estimated Discrepancy"
                value={estimatedDiscrepancy}
                danger={estimatedDiscrepancy < 0}
              />
            )}
          </div>

          <Input
            label="Actual Cash in Drawer (CFA)"
            inputMode="decimal"
            value={actualStr}
            onChange={(e) => { setActualStr(e.target.value); setFormError(null) }}
            error={actual === null && actualStr.trim() !== '' ? 'Must be zero or greater.' : undefined}
          />

          <p className="text-sm text-danger">This action is irreversible.</p>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={isPending}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
            />
            <span className="text-sm text-text-secondary leading-snug">
              I understand this shift will be closed and cannot be reopened.
            </span>
          </label>

          {formError && <p className="text-sm text-danger">{formError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleDismiss} disabled={isPending}>
              Cancel
            </Button>
            <LoadingButton
              loading={isPending}
              disabled={!canSubmit}
              onClick={handleCloseShift}
            >
              Close Shift
            </LoadingButton>
          </div>
        </div>
      )}
    </Modal>
  )
}
