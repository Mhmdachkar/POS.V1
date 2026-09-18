/**
 * CloseShiftModal — confirm, then close_shift(), then show server totals.
 *
 * Confirmation (actual cash + irreversible checkbox) happens BEFORE the RPC.
 * Estimated preview is not authority. Server CloseShiftResult is the result screen.
 */

import { useEffect, useState } from 'react'
import { toastSuccessBi } from '@/lib/bilingual/toast'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { COMMON } from '@/lib/bilingual/common'
import { Button, Input, LoadingButton, Modal } from '@/components/ui'
import { formatCFA } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import {
  estimateExpectedCash,
  parseNonNegativeCfa,
  useCloseShift,
  type ShiftDetailData,
} from '@/hooks/useShifts'
import { useUnshiftedSalesForShiftWindow } from '@/hooks/useSales'
import {
  UNSHIFTED_NOT_IN_RECONCILIATION_NOTE,
  UNSHIFTED_OPEN_PERIOD_NOTE,
} from '@/lib/shiftAttribution'
import { useAuthStore } from '@/stores/authStore'
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
  const { mutateAsync: closeShift, isPending } = useCloseShift()
  const { data: unshifted } = useUnshiftedSalesForShiftWindow({
    cashierId: shift.cashier_id,
    openedAt: shift.opened_at,
    closedAt: shift.closed_at,
  })
  const unshiftedCount = unshifted?.count ?? 0
  const unshiftedTotal = unshifted?.total_cfa ?? 0

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
      setResult(data)
      toastSuccessBi(SHIFT_COPY.shiftClosedToast)
    } catch (err) {
      const parsed = parseError(err)
      if (parsed.code === 'SHIFT_NOT_OPEN') {
        setFormError(SHIFT_COPY.alreadyClosed.fr)
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
      title={result ? SHIFT_COPY.shiftClosed.fr : SHIFT_COPY.closeShift.fr}
      description={result ? SHIFT_COPY.serverAuthoritative.fr : SHIFT_COPY.closeIrreversible.fr}
      size="sm"
    >
      {result ? (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-surface-muted p-3 space-y-1.5">
            <BreakdownRow label={SHIFT_COPY.openingFloat.fr} value={result.breakdown.opening_float_cfa} />
            <BreakdownRow label={`+ ${SHIFT_COPY.salesCash.fr}`} value={result.breakdown.sales_cash_cfa} />
            <BreakdownRow label={`+ ${SHIFT_COPY.customerPayments.fr}`} value={result.breakdown.customer_pmts_cfa} />
            <BreakdownRow label={`− ${SHIFT_COPY.returnCash.fr}`} value={result.breakdown.return_cash_cfa} />
            <div className="border-t border-border pt-1.5">
              <BreakdownRow label={SHIFT_COPY.expectedCash.fr} value={result.expected_cash_cfa} emphasis />
            </div>
            <BreakdownRow label={SHIFT_COPY.actualCash.fr} value={result.actual_cash_cfa} />
            <BreakdownRow
              label={SHIFT_COPY.discrepancy.fr}
              value={result.discrepancy_cfa}
              emphasis
              danger={result.discrepancy_cfa < 0}
            />
          </div>
          <div className="rounded-md border border-warning/20 bg-warning-bg px-3 py-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-warning-foreground">{SHIFT_COPY.salesWithoutShift.fr}</span>
              <span className="tabular-nums font-medium text-warning-foreground">
                {unshiftedCount} vente{unshiftedCount === 1 ? '' : 's'} · {formatCFA(unshiftedTotal)}
              </span>
            </div>
            <p className="mt-1 text-xs text-warning-foreground leading-snug">
              {UNSHIFTED_NOT_IN_RECONCILIATION_NOTE}
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleDismiss}>Terminé</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {closingOthers && (
            <p className="text-sm text-warning-foreground bg-warning-bg border border-warning/20 rounded-md px-3 py-2">
              Vous fermez un service ouvert par {shift.cashier_name ?? 'un autre caissier'}.
            </p>
          )}

          <div className="rounded-md border border-border bg-surface-muted p-3 space-y-1.5">
            <p className="text-xs font-semibold text-text-secondary uppercase">Estimé</p>
            <BreakdownRow label={SHIFT_COPY.openingFloat.fr} value={shift.opening_float_cfa} />
            <BreakdownRow label={`+ ${SHIFT_COPY.salesCash.fr}`} value={shift.running.sales_cash_cfa} />
            <BreakdownRow label={`+ ${SHIFT_COPY.customerPayments.fr}`} value={shift.running.customer_pmts_cfa} />
            <BreakdownRow label={`− ${SHIFT_COPY.returnCash.fr}`} value={shift.running.return_cash_cfa} />
            <BreakdownRow label={SHIFT_COPY.estimatedExpected.fr} value={estimatedExpected} emphasis />
            {estimatedDiscrepancy !== null && (
              <BreakdownRow
                label={SHIFT_COPY.estimatedDiscrepancy.fr}
                value={estimatedDiscrepancy}
                danger={estimatedDiscrepancy < 0}
              />
            )}
          </div>

          <div className="rounded-md border border-warning/20 bg-warning-bg px-3 py-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-warning-foreground">{SHIFT_COPY.salesWithoutShift.fr}</span>
              <span className="tabular-nums font-medium text-warning-foreground">
                {unshiftedCount} vente{unshiftedCount === 1 ? '' : 's'} · {formatCFA(unshiftedTotal)}
              </span>
            </div>
            <p className="mt-1 text-xs text-warning-foreground leading-snug">
              {UNSHIFTED_NOT_IN_RECONCILIATION_NOTE} {UNSHIFTED_OPEN_PERIOD_NOTE}
            </p>
          </div>

          <Input
            label={SHIFT_COPY.actualCashInDrawer.fr}
            inputMode="decimal"
            value={actualStr}
            onChange={(e) => { setActualStr(e.target.value); setFormError(null) }}
            error={actual === null && actualStr.trim() !== '' ? SHIFT_COPY.actualCashError.fr : undefined}
          />

          <p className="text-sm text-danger">{SHIFT_COPY.closeIrreversible.fr}</p>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={isPending}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
            />
            <span className="text-sm text-text-secondary leading-snug">
              Je comprends que ce service sera fermé et ne pourra pas être rouvert.
            </span>
          </label>

          {formError && <p className="text-sm text-danger">{formError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleDismiss} disabled={isPending}>
              {COMMON.cancel.fr}
            </Button>
            <LoadingButton
              loading={isPending}
              disabled={!canSubmit}
              onClick={handleCloseShift}
            >
              {SHIFT_COPY.closeShift.fr}
            </LoadingButton>
          </div>
        </div>
      )}
    </Modal>
  )
}
