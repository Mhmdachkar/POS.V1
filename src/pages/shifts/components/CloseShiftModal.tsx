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
import { formatMoney } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import {
  estimateExpectedCash,
  parseNonNegativeCfa,
  useCloseShift,
  type ShiftDetailData,
} from '@/hooks/useShifts'
import { useUnshiftedSalesForShiftWindow } from '@/hooks/useSales'
import { useAuthStore } from '@/stores/authStore'
import type { CloseShiftResult } from '@/types/rpc'
import { cn } from '@/lib/cn'
import { t } from '@/lib/bilingual/types'


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
        danger ? 'text-danger-foreground font-semibold' : emphasis ? 'font-semibold text-text-primary' : 'text-text-primary',
      )}>
        {formatMoney(value)}
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
        setFormError(t(SHIFT_COPY.alreadyClosed))
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
      title={result ? t(SHIFT_COPY.shiftClosed) : t(SHIFT_COPY.closeShift)}
      description={result ? t(SHIFT_COPY.serverAuthoritative) : t(SHIFT_COPY.closeIrreversible)}
      size="sm"
    >
      {result ? (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-surface-muted p-3 space-y-1.5">
            <BreakdownRow label={t(SHIFT_COPY.openingFloat)} value={result.breakdown.opening_float_cfa} />
            <BreakdownRow label={`+ ${t(SHIFT_COPY.salesCash)}`} value={result.breakdown.sales_cash_cfa} />
            <BreakdownRow label={`+ ${t(SHIFT_COPY.customerPayments)}`} value={result.breakdown.customer_pmts_cfa} />
            <BreakdownRow label={`− ${t(SHIFT_COPY.returnCash)}`} value={result.breakdown.return_cash_cfa} />
            <div className="border-t border-border pt-1.5">
              <BreakdownRow label={t(SHIFT_COPY.expectedCash)} value={result.expected_cash_cfa} emphasis />
            </div>
            <BreakdownRow label={t(SHIFT_COPY.actualCash)} value={result.actual_cash_cfa} />
            <BreakdownRow
              label={t(SHIFT_COPY.discrepancy)}
              value={result.discrepancy_cfa}
              emphasis
              danger={result.discrepancy_cfa < 0}
            />
          </div>
          <div className="rounded-md border border-warning/20 bg-warning-bg px-3 py-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-warning-foreground">{t(SHIFT_COPY.salesWithoutShift)}</span>
              <span className="tabular-nums font-medium text-warning-foreground">
                {t(SHIFT_COPY.salesCountAmount(unshiftedCount, formatMoney(unshiftedTotal)))}
              </span>
            </div>
            <p className="mt-1 text-xs text-warning-foreground leading-snug">
              {t(SHIFT_COPY.unshiftedNotInReconciliation)}
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleDismiss}>
              {t(COMMON.done)}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {closingOthers && (
            <p className="text-sm text-warning-foreground bg-warning-bg border border-warning/20 rounded-md px-3 py-2">
              {t(SHIFT_COPY.closingOthersShift(shift.cashier_name ?? t(SHIFT_COPY.anotherCashier)))}
            </p>
          )}

          <div className="rounded-md border border-border bg-surface-muted p-3 space-y-1.5">
            <p className="text-xs font-semibold text-text-secondary uppercase">{t(SHIFT_COPY.estimated)}</p>
            <BreakdownRow label={t(SHIFT_COPY.openingFloat)} value={shift.opening_float_cfa} />
            <BreakdownRow label={`+ ${t(SHIFT_COPY.salesCash)}`} value={shift.running.sales_cash_cfa} />
            <BreakdownRow label={`+ ${t(SHIFT_COPY.customerPayments)}`} value={shift.running.customer_pmts_cfa} />
            <BreakdownRow label={`− ${t(SHIFT_COPY.returnCash)}`} value={shift.running.return_cash_cfa} />
            <BreakdownRow label={t(SHIFT_COPY.estimatedExpected)} value={estimatedExpected} emphasis />
            {estimatedDiscrepancy !== null && (
              <BreakdownRow
                label={t(SHIFT_COPY.estimatedDiscrepancy)}
                value={estimatedDiscrepancy}
                danger={estimatedDiscrepancy < 0}
              />
            )}
          </div>

          <div className="rounded-md border border-warning/20 bg-warning-bg px-3 py-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-warning-foreground">{t(SHIFT_COPY.salesWithoutShift)}</span>
              <span className="tabular-nums font-medium text-warning-foreground">
                {t(SHIFT_COPY.salesCountAmount(unshiftedCount, formatMoney(unshiftedTotal)))}
              </span>
            </div>
            <p className="mt-1 text-xs text-warning-foreground leading-snug">
              {t(SHIFT_COPY.unshiftedNotInReconciliation)} {t(SHIFT_COPY.unshiftedOpenPeriod)}
            </p>
          </div>

          <Input
            label={t(SHIFT_COPY.actualCashInDrawer)}
            inputMode="decimal"
            value={actualStr}
            onChange={(e) => { setActualStr(e.target.value); setFormError(null) }}
            error={actual === null && actualStr.trim() !== '' ? t(SHIFT_COPY.actualCashError) : undefined}
          />

          <p className="text-sm text-danger-foreground">{t(SHIFT_COPY.closeIrreversible)}</p>

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

          {formError && <p className="text-sm text-danger-foreground">{formError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleDismiss} disabled={isPending}>
              {t(COMMON.cancel)}
            </Button>
            <LoadingButton
              loading={isPending}
              disabled={!canSubmit}
              onClick={handleCloseShift}
            >
              {t(SHIFT_COPY.closeShift)}
            </LoadingButton>
          </div>
        </div>
      )}
    </Modal>
  )
}
