/**
 * RecordPaymentModal — Record a standalone customer payment.
 *
 * Calls record_payment() RPC which:
 *   - Validates amount > 0 and amount <= balance_owed_cfa
 *   - Inserts a payment record (payment_type='customer_payment', sale_id=NULL)
 *   - Atomically decrements customer.balance_owed_cfa
 *   - Writes audit log
 *
 * Lifecycle policy:
 *   - Works on BOTH active and inactive customers.
 *   - An inactive customer with an existing outstanding balance may still
 *     receive a payment. Reactivation is NOT required to record a debt payment.
 *
 * Payment model:
 *   - Cash only (no payment method selection)
 *   - Pooled balance — not allocated to a specific sale
 *   - new_balance_owed_cfa from server response is authoritative
 */

import { useState, useRef, useEffect } from 'react'
import { BiEmptyTitle, BiModalTitle, BiPageTitle, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { COMMON } from '@/lib/bilingual/common'
import { ADMIN } from '@/lib/bilingual/admin'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { SALES } from '@/lib/bilingual/sales'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { Modal } from '@/components/ui/Modal'
import { Button, LoadingButton } from '@/components/ui'
import { Badge } from '@/components/ui/Badge'
import { formatCFA } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import { authorizedOpenShifts, clearStalePosShift, useOpenShifts } from '@/hooks/useShifts'
import { processingShiftId, resolveLoadedPosShiftContext } from '@/lib/posShiftContext'
import { useAuthStore } from '@/stores/authStore'
import { useRecordPayment } from '@/hooks/useCustomers'
import type { Customer } from '@/types/database'
import { t } from '@/lib/bilingual/types'


interface RecordPaymentModalProps {
  open: boolean
  onClose: () => void
  customer: Customer
  /** Optional shift ID to link this payment to the current shift for reconciliation. */
  shiftId?: string | null
  onSuccess?: (newBalance: number) => void
}

export function RecordPaymentModal({
  open,
  onClose,
  customer,
  shiftId,
  onSuccess,
}: RecordPaymentModalProps) {
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [amountError, setAmountError] = useState('')
  const [generalError, setGeneralError] = useState('')
  const [successResult, setSuccessResult] = useState<{
    amount_cfa: number
    new_balance_owed_cfa: number
  } | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)

  const { mutateAsync: recordPayment, isPending } = useRecordPayment()
  const staff = useAuthStore((s) => s.staff)
  const { data: openShifts, isLoading: openShiftsLoading } = useOpenShifts()
  const shiftCtx = resolveLoadedPosShiftContext(
    shiftId,
    null,
    authorizedOpenShifts(staff, openShifts),
    openShiftsLoading,
  )
  const effectiveShiftId = processingShiftId(shiftId, shiftCtx)

  useEffect(() => {
    if (open) {
      setAmountStr('')
      setNote('')
      setAmountError('')
      setGeneralError('')
      setSuccessResult(null)
      const timer = setTimeout(() => amountRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only digits and a single decimal point
    const val = e.target.value.replace(/[^0-9.]/g, '')
    setAmountStr(val)
    setAmountError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inFlight.current || isPending) return

    const amount = parseFloat(amountStr)

    // Client-side validation (server also validates; these are UX guards only)
    if (!amountStr || isNaN(amount) || amount <= 0) {
      setAmountError(t(CUSTOMERS.paymentAmountError))
      return
    }
    if (amount > customer.balance_owed_cfa) {
      setAmountError(
        `Amount exceeds balance owed (${formatCFA(customer.balance_owed_cfa)}).`,
      )
      return
    }

    setAmountError('')
    setGeneralError('')

    inFlight.current = true
    try {
      const result = await recordPayment({
        p_customer_id: customer.id,
        p_amount_cfa:  amount,
        p_shift_id:    effectiveShiftId,
        p_note:        note.trim() || null,
      })

      setSuccessResult({
        amount_cfa:           result.amount_cfa,
        new_balance_owed_cfa: result.new_balance_owed_cfa,
      })
      onSuccess?.(result.new_balance_owed_cfa)
    } catch (err) {
      const vhmErr = parseError(err)
      clearStalePosShift(vhmErr.code)
      if (vhmErr.code === 'PAYMENT_EXCEEDS_BALANCE') {
        setAmountError(vhmErr.message)
      } else {
        setGeneralError(vhmErr.message)
      }
    } finally {
      inFlight.current = false
    }
  }

  const handleDone = () => {
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<BiModalTitle {...CUSTOMERS.recordPaymentTitle} />}
      size="sm"
    >
      {successResult ? (
        /* ── Success state ── */
        <div className="space-y-5">
          <div className="rounded-xl bg-success-bg border border-success/20 p-4 text-center space-y-1">
            <p className="text-sm text-success-foreground font-medium">Payment Recorded</p>
            <p className="text-2xl font-bold text-success-foreground tabular-nums">
              {formatCFA(successResult.amount_cfa)}
            </p>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-text-secondary">
              <span>Customer</span>
              <span className="font-medium text-text-primary">{customer.name}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>{t(CUSTOMERS.newBalanceOwed)}</span>
              <span className={`font-semibold tabular-nums ${successResult.new_balance_owed_cfa > 0 ? 'text-warning-foreground' : 'text-success-foreground'}`}>
                {formatCFA(successResult.new_balance_owed_cfa)}
              </span>
            </div>
          </div>
          <p className="text-xs text-text-muted text-center">
            Balance confirmed by server. Pooled payment — not allocated to a specific sale.
          </p>
          <Button className="w-full" onClick={handleDone}>
            Done
          </Button>
        </div>
      ) : (
        /* ── Entry form ── */
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer info */}
          <div className="rounded-lg bg-surface-muted border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text-primary truncate">{customer.name}</p>
              {!customer.is_active && (
                <Badge variant="neutral">Inactive</Badge>
              )}
            </div>
            {customer.phone && (
              <p className="text-xs text-text-muted">{customer.phone}</p>
            )}
            <div className="flex items-baseline justify-between pt-1 border-t border-border">
              <span className="text-xs text-text-secondary">{t(CUSTOMERS.balanceOwedLabel)}</span>
              <span className="text-base font-bold text-danger tabular-nums">
                {formatCFA(customer.balance_owed_cfa)}
              </span>
            </div>
          </div>

          {/* Inactive customer note */}
          {!customer.is_active && (
            <div className="rounded-md bg-warning-bg border border-warning/20 px-3 py-2">
              <p className="text-xs text-warning-foreground">
                This customer is inactive. Payments against their existing balance are still allowed.
              </p>
            </div>
          )}

          {!shiftCtx.hasValidShift && (
            <div className="rounded-md bg-warning-bg border border-warning/20 px-3 py-2">
              <p className="text-xs text-warning-foreground">
                No valid shift selected. This payment can still be recorded and will not be attributed to a shift close.
              </p>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
              Amount to pay (CFA) <span className="text-danger">*</span>
            </label>
            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              value={amountStr}
              onChange={handleAmountChange}
              placeholder="0"
              className={`w-full h-10 px-3 rounded-md border text-sm bg-surface text-text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${amountError ? 'border-danger' : 'border-border'}`}
            />
            {amountError && (
              <p className="text-xs text-danger mt-1">{amountError}</p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
              Note <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Partial payment, cash"
              className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* General error */}
          {generalError && (
            <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
              <p className="text-sm text-danger">{generalError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-1">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <LoadingButton type="submit" loading={isPending}>
              Record Payment
            </LoadingButton>
          </div>
        </form>
      )}
    </Modal>
  )
}
