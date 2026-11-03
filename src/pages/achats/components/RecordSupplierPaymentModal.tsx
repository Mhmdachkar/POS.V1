import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button, LoadingButton, MoneyDisplay } from '@/components/ui'
import { ACHATS } from '@/lib/bilingual/achats'
import { COMMON } from '@/lib/bilingual/common'
import { BiButtonStack, BiModalTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { t } from '@/lib/bilingual/types'
import { parseError } from '@/lib/errors'
import { useRecordSupplierPayment, type SupplierRow } from '@/hooks/useAchats'
import { useDepotStore } from '@/stores/depotStore'
import { cn } from '@/lib/cn'
import { rpc } from '@/lib/rpc'
import { supplierPaymentAmountIssue } from '@/lib/supplierPaymentAmount'
import { toastErrorBi, toastErrorFromCode, toastSuccessBi } from '@/lib/bilingual/toast'
import { acknowledgePrintQueue } from '@/lib/printAgentWake'

interface Props {
  open: boolean
  onClose: () => void
  supplier: SupplierRow | null
}

const METHODS = [
  { value: 'cash' as const, label: ACHATS.cash },
  { value: 'mobile' as const, label: ACHATS.mobile },
  { value: 'bank' as const, label: ACHATS.bank },
]

interface SavedPayment {
  id: string
  receiptNumber: string
  amountCfa: number
}

export function RecordSupplierPaymentModal({ open, onClose, supplier }: Props) {
  const [amountStr, setAmountStr] = useState('')
  const [method, setMethod] = useState<'cash' | 'mobile' | 'bank'>('cash')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<SavedPayment | null>(null)
  const [printing, setPrinting] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  const record = useRecordSupplierPayment()
  const depotId = useDepotStore((s) => s.currentDepotId)

  useEffect(() => {
    if (!open) return
    setAmountStr('')
    setMethod('cash')
    setNote('')
    setError('')
    setSaved(null)
    setPrinting(false)
    const tmr = setTimeout(() => amountRef.current?.focus(), 50)
    return () => clearTimeout(tmr)
  }, [open, supplier?.id])

  const amountIssue = supplier
    ? supplierPaymentAmountIssue(amountStr, supplier.balance_owed_cfa)
    : 'empty'
  const inlineError =
    amountIssue === 'exceeds'
      ? t(ACHATS.paymentExceedsBalance)
      : amountIssue === 'invalid'
        ? t(ACHATS.amount)
        : error
  const canSubmit = amountIssue === null && !saved

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplier || !canSubmit || record.isPending) return
    const amount = Number(amountStr.trim().replace(/\s/g, '').replace(',', '.'))
    try {
      const result = await record.mutateAsync({
        p_supplier_id: supplier.id,
        p_amount_cfa: amount,
        p_method: method,
        p_note: note.trim() || null,
        p_depot_id: depotId,
      })
      const data = result as {
        id?: string
        receipt_number?: string
        amount_cfa?: number
      }
      const receiptNumber = data.receipt_number?.trim() ?? ''
      const paymentId = data.id ?? ''
      if (receiptNumber) {
        toastSuccessBi(ACHATS.paymentSavedWithRgf(receiptNumber))
      } else {
        toastSuccessBi(ACHATS.paymentOk)
      }
      if (paymentId && receiptNumber) {
        setSaved({
          id: paymentId,
          receiptNumber,
          amountCfa: Number(data.amount_cfa ?? amount),
        })
      } else {
        onClose()
      }
    } catch (err) {
      const parsed = parseError(err)
      if (parsed.code === 'INVALID_AMOUNT' && parsed.details?.reason === 'exceeds_supplier_balance') {
        setError(t(ACHATS.paymentExceedsBalance))
        return
      }
      setError(parsed.message)
    }
  }

  async function handlePrintRgf() {
    if (!saved) return
    setPrinting(true)
    try {
      const result = await rpc.enqueueSupplierPaymentPrint(saved.id)
      if (result.error) {
        toastErrorFromCode(result.error.code, result.error.details)
        return
      }
      const feedback = await acknowledgePrintQueue()
      if (feedback === 'queued') toastSuccessBi(ACHATS.printQueued)
      else toastErrorBi(ACHATS.printAgentOffline)
    } finally {
      setPrinting(false)
    }
  }

  function handleDone() {
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={<BiModalTitle {...ACHATS.recordPayment} />}>
      {supplier && saved ? (
        <div className="space-y-4">
          <div className="rounded-md bg-surface-muted px-3 py-3 text-sm space-y-2">
            <p className="font-medium text-text-primary">{supplier.name}</p>
            <p className="text-text-secondary">
              {t(ACHATS.number)} {saved.receiptNumber}
            </p>
            <MoneyDisplay amount={saved.amountCfa} className="text-base font-semibold" />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={handleDone}>
              <BiButtonStack {...COMMON.close} />
            </Button>
            <LoadingButton
              type="button"
              variant="secondary"
              loading={printing}
              disabled={printing}
              onClick={() => void handlePrintRgf()}
            >
              <BiButtonStack {...ACHATS.printRgf} />
            </LoadingButton>
          </div>
        </div>
      ) : supplier ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-md bg-surface-muted px-3 py-2 text-sm">
            <p className="font-medium text-text-primary">{supplier.name}</p>
            <p className="text-text-secondary mt-1 flex items-center gap-2">
              <span>{t(ACHATS.balance)}</span>
              <MoneyDisplay amount={supplier.balance_owed_cfa} />
            </p>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-text-secondary">
              <BiTableHeader {...ACHATS.amount} /> *
            </span>
            <input
              ref={amountRef}
              inputMode="decimal"
              className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm tabular-nums"
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value)
                setError('')
              }}
              aria-invalid={amountIssue === 'exceeds' || amountIssue === 'invalid'}
            />
          </label>
          <div className="space-y-1">
            <span className="text-sm font-medium text-text-secondary">
              <BiTableHeader {...ACHATS.method} /> *
            </span>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={cn(
                    'px-3 py-2 rounded-md text-sm border transition-colors',
                    method === m.value
                      ? 'border-primary bg-primary-subtle text-text-primary'
                      : 'border-border text-text-secondary hover:bg-surface-muted',
                  )}
                  onClick={() => setMethod(m.value)}
                >
                  {t(m.label)}
                </button>
              ))}
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-text-secondary">
              <BiTableHeader {...ACHATS.note} />
            </span>
            <input
              className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {inlineError && (
            <p className="text-sm text-danger-foreground" role="alert">
              {inlineError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              <BiButtonStack {...COMMON.cancel} />
            </Button>
            <LoadingButton type="submit" loading={record.isPending} disabled={!canSubmit}>
              <BiButtonStack {...ACHATS.recordPayment} />
            </LoadingButton>
          </div>
        </form>
      ) : null}
    </Modal>
  )
}
