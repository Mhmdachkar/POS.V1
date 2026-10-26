/**
 * VoidModal — Void a completed sale with confirmation.
 */

import { useState, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal, Textarea, LoadingButton, Button } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { formatCFA } from '@/lib/formatters'
import { COMMON } from '@/lib/bilingual/common'
import { SALES } from '@/lib/bilingual/sales'
import { BiButtonStack, BiModalTitle, BiPageDescription } from '@/lib/bilingual/ui'
import { toastErrorFromCode, toastSuccessBi } from '@/lib/bilingual/toast'
import { t, bilingualPlain } from '@/lib/bilingual/types'
import { rpc } from '@/lib/rpc'
import type { SaleDetailData } from '@/hooks/useSales'

interface VoidModalProps {
  open: boolean
  onClose: () => void
  sale: SaleDetailData
  onSuccess: () => void
}

export function VoidModal({ open, onClose, sale, onSuccess }: VoidModalProps) {
  const [reason, setReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const inFlight = useRef(false)

  const handleVoid = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setIsLoading(true)
    try {
      const result = await rpc.voidSale({
        p_sale_id: sale.id,
        p_reason: reason.trim() || null,
      })

      if (result.error) {
        toastErrorFromCode(result.error.code)
        return
      }

      toastSuccessBi(SALES.voided(sale.receipt_number))
      onSuccess()
      onClose()
    } finally {
      setIsLoading(false)
      inFlight.current = false
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setReason('')
      setConfirmed(false)
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={<BiModalTitle {...SALES.voidModalTitle} />}
      description={<BiPageDescription {...SALES.voidModalDesc} />}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-md bg-danger-bg border border-danger/20">
          <AlertTriangle className="h-5 w-5 text-danger-foreground flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-danger-foreground">
              <BilingualText {...SALES.voidConfirmReceipt(sale.receipt_number)} variant="body" layout="inline" />
            </p>
            <ul className="text-xs text-danger-foreground space-y-0.5 list-disc list-inside">
              <li>
                <BilingualText {...SALES.voidEffectStatus} variant="caption" layout="inline" />
              </li>
              <li>
                <BilingualText {...SALES.voidEffectInventory(sale.items.length)} variant="caption" layout="inline" />
              </li>
              {sale.payments.some((p) => p.payment_type === 'sale_payment' && !p.is_reversed) && (
                <li>
                  <BilingualText {...SALES.voidEffectPayment} variant="caption" layout="inline" />
                </li>
              )}
              {sale.balance_added_cfa > 0 && (
                <li>
                  <BilingualText
                    {...SALES.voidEffectBalance(formatCFA(sale.balance_added_cfa))}
                    variant="caption"
                    layout="inline"
                  />
                </li>
              )}
              <li>
                <BilingualText {...SALES.voidEffectAudit} variant="caption" layout="inline" />
              </li>
            </ul>
          </div>
        </div>

        <div className="rounded-md bg-surface-muted border border-border p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <BilingualText {...COMMON.total} variant="caption" layout="inline" />
            <span className="font-semibold text-text-primary">{formatCFA(sale.total_cfa)}</span>
          </div>
          {sale.customer_name && (
            <div className="flex justify-between">
              <BilingualText {...COMMON.customer} variant="caption" layout="inline" />
              <span className="text-text-primary">{sale.customer_name}</span>
            </div>
          )}
        </div>

        <Textarea
          label={bilingualPlain(SALES.voidReasonOptional)}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={bilingualPlain(SALES.voidReasonPlaceholder)}
          rows={2}
          disabled={isLoading}
        />

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={isLoading}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
          />
          <span className="text-sm text-text-secondary leading-snug">
            <BilingualText {...SALES.voidConfirmCheck} variant="caption" layout="inline" />
          </span>
        </label>

        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
            <BiButtonStack {...COMMON.cancel} />
          </Button>
          <LoadingButton
            variant="danger"
            loading={isLoading}
            disabled={!confirmed}
            onClick={handleVoid}
          >
            <BiButtonStack {...SALES.voidSale} />
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
