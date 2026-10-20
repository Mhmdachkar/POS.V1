/**
 * CancelTransferModal — pending-only cancel. No stock or ledger effect.
 * Optional reason stored in cancel_reason, never in note.
 */

import { useState } from 'react'
import { BiEmptyTitle, BiModalTitle, BiPageTitle, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { COMMON } from '@/lib/bilingual/common'
import { ADMIN } from '@/lib/bilingual/admin'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { SALES } from '@/lib/bilingual/sales'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { t, bilingualPlain } from '@/lib/bilingual/types'
import { toastSuccessBi, toastErrorFromCode } from '@/lib/bilingual/toast'
import { AlertTriangle } from 'lucide-react'
import { Button, LoadingButton, Modal, Textarea } from '@/components/ui'
import { getErrorMessage } from '@/lib/errors'
import { rpc } from '@/lib/rpc'
import {
  invalidateAfterCancelTransfer,
  type TransferDetailData,
} from '@/hooks/useTransfers'
import { useQueryClient } from '@tanstack/react-query'

interface CancelTransferModalProps {
  open: boolean
  onClose: () => void
  transfer: TransferDetailData
}

export function CancelTransferModal({
  open,
  onClose,
  transfer,
}: CancelTransferModalProps) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const queryClient = useQueryClient()

  const handleCancel = async () => {
    setIsLoading(true)
    try {
      const result = await rpc.cancelTransfer({
        p_transfer_id: transfer.id,
        p_reason: reason.trim() || null,
      })
      if (result.error) {
        toastErrorFromCode(result.error.code)
        return
      }
      invalidateAfterCancelTransfer(queryClient, transfer.id)
      toastSuccessBi(TRANSFERS.cancelled)
      onClose()
    } finally {
      setIsLoading(false)
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
      title={<BiModalTitle {...TRANSFERS.cancelTransfer} />}
      description={t(TRANSFERS.cancelPendingNote)}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-md bg-danger-bg border border-danger/20">
          <AlertTriangle className="h-5 w-5 text-danger flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-danger-foreground">
              Cancel this pending transfer?
            </p>
            <ul className="text-xs text-danger-foreground space-y-0.5 list-disc list-inside">
              <li>Status becomes Cancelled</li>
              <li>{t(TRANSFERS.cancelEffectStock)}</li>
              <li>This draft cannot be reused — create a new transfer if needed</li>
            </ul>
          </div>
        </div>

        <Textarea
          label={t(TRANSFERS.reasonOptional)}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={bilingualPlain(TRANSFERS.cancelReasonPlaceholder)}
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
            I understand this draft cannot be reused
          </span>
        </label>

        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
            Back
          </Button>
          <LoadingButton
            variant="danger"
            loading={isLoading}
            disabled={!confirmed}
            onClick={handleCancel}
          >
            {t(TRANSFERS.cancelTransfer)}
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
