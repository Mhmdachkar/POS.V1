/**
 * CompleteTransferModal — confirm irreversible stock movement.
 * Calls complete_transfer only. Frozen quantity_pieces are server-authoritative.
 */

import { useState, useRef } from 'react'
import { BiEmptyTitle, BiModalTitle, BiPageTitle, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { COMMON } from '@/lib/bilingual/common'
import { ADMIN } from '@/lib/bilingual/admin'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { SALES } from '@/lib/bilingual/sales'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { toastSuccessBi, toastErrorFromCode } from '@/lib/bilingual/toast'
import { AlertTriangle } from 'lucide-react'
import { Button, LoadingButton, Modal } from '@/components/ui'
import { formatPieces } from '@/lib/formatters'
import { getErrorMessage } from '@/lib/errors'
import { rpc } from '@/lib/rpc'
import {
  invalidateAfterCompleteTransfer,
  type TransferDetailData,
} from '@/hooks/useTransfers'
import { useQueryClient } from '@tanstack/react-query'

interface CompleteTransferModalProps {
  open: boolean
  onClose: () => void
  transfer: TransferDetailData
}

export function CompleteTransferModal({
  open,
  onClose,
  transfer,
}: CompleteTransferModalProps) {
  const [confirmed, setConfirmed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inFlight = useRef(false)
  const queryClient = useQueryClient()

  const handleComplete = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setIsLoading(true)
    try {
      const result = await rpc.completeTransfer({ p_transfer_id: transfer.id })
      if (result.error) {
        toastErrorFromCode(result.error.code)
        return
      }
      invalidateAfterCompleteTransfer(
        queryClient,
        transfer.id,
        transfer.items.flatMap((item) => [item.from_product_id, item.to_product_id]),
      )
      toastSuccessBi(TRANSFERS.completed)
      onClose()
    } finally {
      setIsLoading(false)
      inFlight.current = false
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setConfirmed(false)
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={<BiModalTitle {...TRANSFERS.completeTransfer} />}
      description={TRANSFERS.completeIrreversible.fr}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-md bg-warning-bg border border-warning/20">
          <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-text-primary">
              Move stock from {transfer.from_depot_name} to {transfer.to_depot_name}?
            </p>
            <ul className="text-xs text-text-secondary space-y-0.5 list-disc list-inside">
              <li>{TRANSFERS.completeEffectSource.fr}</li>
              <li>{TRANSFERS.completeEffectDest.fr}</li>
              <li>{TRANSFERS.completeEffectFinal.fr}</li>
            </ul>
          </div>
        </div>

        <div className="rounded-md bg-surface-muted border border-border p-3 space-y-1 text-sm">
          {transfer.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-3">
              <span className="text-text-secondary truncate">{item.from_product_name}</span>
              <span className="tabular-nums text-text-primary">
                {formatPieces(item.quantity_pieces)}
              </span>
            </div>
          ))}
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={isLoading}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
          />
          <span className="text-sm text-text-secondary leading-snug">
            I understand this cannot be undone
          </span>
        </label>

        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
            Back
          </Button>
          <LoadingButton
            variant="primary"
            loading={isLoading}
            disabled={!confirmed}
            onClick={handleComplete}
          >
            Complete Transfer
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
