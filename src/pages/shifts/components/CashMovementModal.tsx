/**
 * CashMovementModal — audited cash in/out on an open shift.
 * Does not change sales, returns, or customer balances.
 */

import { useEffect, useState } from 'react'
import { toastSuccessBi } from '@/lib/bilingual/toast'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { COMMON } from '@/lib/bilingual/common'
import { Button, Input, LoadingButton, Modal } from '@/components/ui'
import { parseError } from '@/lib/errors'
import { parseNonNegativeCfa, useRecordCashMovement } from '@/hooks/useShifts'
import { t } from '@/lib/bilingual/types'

interface CashMovementModalProps {
  open: boolean
  onClose: () => void
  shiftId: string
}

export function CashMovementModal({ open, onClose, shiftId }: CashMovementModalProps) {
  const { mutateAsync, isPending } = useRecordCashMovement()
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDirection('in')
    setAmountStr('')
    setNote('')
    setFormError(null)
  }, [open, shiftId])

  const amount = parseNonNegativeCfa(amountStr)
  const amountOk = amount != null && amount > 0
  const noteOk = note.trim().length > 0
  const canSubmit = amountOk && noteOk && !isPending

  const handleSubmit = async () => {
    if (!canSubmit || amount == null) return
    setFormError(null)
    try {
      await mutateAsync({
        p_shift_id: shiftId,
        p_direction: direction,
        p_amount_cfa: amount,
        p_note: note.trim(),
      })
      toastSuccessBi(direction === 'in' ? SHIFT_COPY.cashInToast : SHIFT_COPY.cashOutToast)
      onClose()
    } catch (err) {
      setFormError(parseError(err).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!isPending) onClose()
      }}
      title={t(SHIFT_COPY.cashMovement)}
      description={t(SHIFT_COPY.cashMovementHint)}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDirection('in')}
            className={
              direction === 'in'
                ? 'flex-1 h-11 rounded-md bg-primary text-primary-foreground text-sm font-medium'
                : 'flex-1 h-11 rounded-md border border-border bg-surface text-sm font-medium'
            }
          >
            {t(SHIFT_COPY.cashIn)}
          </button>
          <button
            type="button"
            onClick={() => setDirection('out')}
            className={
              direction === 'out'
                ? 'flex-1 h-11 rounded-md bg-primary text-primary-foreground text-sm font-medium'
                : 'flex-1 h-11 rounded-md border border-border bg-surface text-sm font-medium'
            }
          >
            {t(SHIFT_COPY.cashOut)}
          </button>
        </div>

        <Input
          label={t(SHIFT_COPY.cashMovementAmount)}
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => {
            setAmountStr(e.target.value)
            setFormError(null)
          }}
          error={
            amountStr.trim() !== '' && !amountOk ? t(SHIFT_COPY.actualCashError) : undefined
          }
        />

        <Input
          label={t(SHIFT_COPY.cashMovementNote)}
          value={note}
          onChange={(e) => {
            setNote(e.target.value)
            setFormError(null)
          }}
        />

        {formError && <p className="text-sm text-danger-foreground">{formError}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {t(COMMON.cancel)}
          </Button>
          <LoadingButton loading={isPending} disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {t(SHIFT_COPY.recordCashMovement)}
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
