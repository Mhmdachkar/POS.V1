/**
 * AdjustmentModal — consumer of adjust_inventory RPC.
 *
 * Sends: p_product_id, p_adjustment_type, p_quantity_pieces (signed), p_reason.
 * DAMAGE / LOSS / EXPIRY: positive UI magnitude → negative RPC quantity.
 * COUNT_CORRECTION / OTHER: signed value as entered. OTHER requires reason.
 * Frontend estimate is informational. ADJUSTMENT_NEGATIVE_RESULT is server-authoritative.
 * Depot is resolved inside the RPC from the product row.
 */

import { useEffect } from 'react'
import { toastSuccessBi } from '@/lib/bilingual/toast'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal } from '@/components/ui/Modal'
import { Button, LoadingButton } from '@/components/ui'
import { formatPieces } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import {
  adjustmentFormSchema,
  toAdjustRpcParams,
  toAdjustmentRpcQuantity,
  useAdjustInventory,
} from '@/hooks/useInventory'
import type { ProductWithUnits } from '@/types'
import type { InventoryAdjustmentType } from '@/types/rpc'
import type { z } from 'zod'
import { t } from '@/lib/bilingual/types'


type AdjustmentForm = z.infer<typeof adjustmentFormSchema>

function adjustmentTypes(): Array<{ value: InventoryAdjustmentType; label: string }> {
  return [
    { value: 'DAMAGE', label: 'Damage' },
    { value: 'LOSS', label: 'Loss' },
    { value: 'EXPIRY', label: 'Expiry' },
    { value: 'COUNT_CORRECTION', label: t(INVENTORY.countCorrection) },
    { value: 'OTHER', label: 'Other' },
  ]
}

const REDUCTION_TYPES: InventoryAdjustmentType[] = ['DAMAGE', 'LOSS', 'EXPIRY']

interface AdjustmentModalProps {
  open: boolean
  onClose: () => void
  product: ProductWithUnits
}

export function AdjustmentModal({ open, onClose, product }: AdjustmentModalProps) {
  const { mutateAsync: adjust, isPending } = useAdjustInventory()

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<AdjustmentForm>({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues: {
      adjustment_type: 'DAMAGE',
      quantity: undefined,
      reason: '',
    },
  })

  useEffect(() => {
    if (open) {
      reset({
        adjustment_type: 'DAMAGE',
        quantity: undefined,
        reason: '',
      })
    }
  }, [open, reset])

  const type = watch('adjustment_type')
  const qty = Number(watch('quantity'))
  const isReduction = REDUCTION_TYPES.includes(type)
  const signedQty = Number.isNaN(qty) || qty === 0
    ? null
    : toAdjustmentRpcQuantity(type, qty)
  const estimate =
    signedQty == null ? null : product.current_stock_pieces + signedQty

  const onSubmit = async (data: AdjustmentForm) => {
    try {
      const params = toAdjustRpcParams(
        product.id,
        data.adjustment_type,
        data.quantity,
        data.reason,
      )
      await adjust(params)
      toastSuccessBi(INVENTORY.stockUpdated)
      onClose()
    } catch (err) {
      setError('root', { message: parseError(err).message })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Adjust — ${product.name}`} size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            Adjustment type <span className="text-danger">*</span>
          </label>
          <select
            {...register('adjustment_type')}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {adjustmentTypes().map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            Quantity (pieces) <span className="text-danger">*</span>
          </label>
          <input
            type="number"
            step="any"
            {...register('quantity')}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <p className="text-xs text-text-muted mt-1">
            {isReduction
              ? 'Enter a positive amount to remove. Sent to the server as a negative quantity.'
              : t(INVENTORY.signedAdjustmentHint)}
          </p>
          {errors.quantity && (
            <p className="text-xs text-danger mt-1">{errors.quantity.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            Reason{' '}
            {type === 'OTHER' ? (
              <span className="text-danger">*</span>
            ) : (
              <span className="text-text-muted font-normal">(optional)</span>
            )}
          </label>
          <textarea
            rows={2}
            {...register('reason')}
            className="w-full rounded-md border border-border bg-surface text-sm text-text-primary px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
          {errors.reason && (
            <p className="text-xs text-danger mt-1">{errors.reason.message}</p>
          )}
        </div>

        <div className="rounded-lg bg-surface-muted border border-border p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-text-secondary">{t(INVENTORY.currentStock)}</span>
            <span className="font-medium tabular-nums">{formatPieces(product.current_stock_pieces)}</span>
          </div>
          {estimate != null && (
            <div className="flex justify-between">
              <span className="text-text-secondary">{t(INVENTORY.estimatedResult)}</span>
              <span className="font-medium tabular-nums">~ {formatPieces(estimate)}</span>
            </div>
          )}
          <p className="text-xs text-text-muted">
            Estimate is informational. Server stock is authoritative.
          </p>
          {estimate === 0 && (
            <p className="text-xs text-warning-foreground">This will empty the stock.</p>
          )}
        </div>

        {errors.root?.message && (
          <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
            <p className="text-sm text-danger">{errors.root.message}</p>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <LoadingButton type="submit" loading={isPending}>
            Apply Adjustment
          </LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
