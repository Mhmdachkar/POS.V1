/**
 * VoidModal — Void a completed sale with confirmation.
 *
 * Shows what will happen on void:
 *   - Sale becomes voided
 *   - Inventory is restored
 *   - Sale_payment record is reversed (if exists)
 *   - Customer pooled balance is adjusted by the server
 *
 * Requires a reason input and explicit confirmation.
 * Uses rpc.voidSale() — no direct DB mutations.
 */

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Modal, Textarea, LoadingButton, Button } from '@/components/ui'
import { formatCFA } from '@/lib/formatters'
import { rpc } from '@/lib/rpc'
import { getErrorMessage } from '@/lib/errors'
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

  const handleVoid = async () => {
    setIsLoading(true)
    try {
      const result = await rpc.voidSale({
        p_sale_id: sale.id,
        p_reason: reason.trim() || null,
      })

      if (result.error) {
        toast.error(getErrorMessage(result.error.code))
        return
      }

      toast.success(`Sale ${sale.receipt_number} has been voided.`)
      onSuccess()
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
      title="Void Sale"
      description="This action cannot be undone."
      size="sm"
    >
      <div className="space-y-4">
        {/* Warning */}
        <div className="flex items-start gap-3 p-3 rounded-md bg-danger-bg border border-danger/20">
          <AlertTriangle className="h-5 w-5 text-danger flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-danger-foreground">
              Void {sale.receipt_number}?
            </p>
            <ul className="text-xs text-danger-foreground space-y-0.5 list-disc list-inside">
              <li>Sale status → Voided</li>
              <li>Inventory restored ({sale.items.length} product{sale.items.length !== 1 ? 's' : ''})</li>
              {sale.payments.some((p) => p.payment_type === 'sale_payment' && !p.is_reversed) && (
                <li>Sale payment reversed</li>
              )}
              {sale.balance_added_cfa > 0 && (
                <li>Customer balance reduced by {formatCFA(sale.balance_added_cfa)}</li>
              )}
              <li>Audit history preserved</li>
            </ul>
          </div>
        </div>

        {/* Sale summary */}
        <div className="rounded-md bg-surface-muted border border-border p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Total</span>
            <span className="font-semibold text-text-primary">{formatCFA(sale.total_cfa)}</span>
          </div>
          {sale.customer_name && (
            <div className="flex justify-between">
              <span className="text-text-secondary">Customer</span>
              <span className="text-text-primary">{sale.customer_name}</span>
            </div>
          )}
        </div>

        {/* Reason */}
        <Textarea
          label="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for voiding this sale…"
          rows={2}
          disabled={isLoading}
        />

        {/* Confirm checkbox */}
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

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <LoadingButton
            variant="danger"
            loading={isLoading}
            disabled={!confirmed}
            onClick={handleVoid}
          >
            Void Sale
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
