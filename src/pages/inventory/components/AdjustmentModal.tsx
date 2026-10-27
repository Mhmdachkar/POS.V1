/**
 * AdjustmentModal — consumer of adjust_inventory RPC.
 *
 * Quantity is entered in the selected unit (piece / package / carton);
 * converted to signed pieces for the server.
 */

import { useEffect, useState } from 'react'
import { toastSuccessBi } from '@/lib/bilingual/toast'
import { FORM_GUIDANCE } from '@/lib/bilingual/formGuidance'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal } from '@/components/ui/Modal'
import { Button, FormActionGuide, LoadingButton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { formatPieces } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import { guidanceStepsFromFieldErrors } from '@/lib/formSubmitGuidance'
import {
  adjustmentFormSchema,
  toAdjustRpcParams,
  toAdjustmentRpcQuantity,
  useAdjustInventory,
} from '@/hooks/useInventory'
import type { ProductWithUnits } from '@/types'
import type { InventoryAdjustmentType } from '@/types/rpc'
import type { z } from 'zod'
import { COMMON } from '@/lib/bilingual/common'
import { t, type BilingualPair } from '@/lib/bilingual/types'


type AdjustmentForm = z.infer<typeof adjustmentFormSchema>

function adjustmentTypes(): Array<{ value: InventoryAdjustmentType; label: string }> {
  return [
    { value: 'DAMAGE', label: t(INVENTORY.adjustmentTypeDamage) },
    { value: 'LOSS', label: t(INVENTORY.adjustmentTypeLoss) },
    { value: 'EXPIRY', label: t(INVENTORY.adjustmentTypeExpiry) },
    { value: 'COUNT_CORRECTION', label: t(INVENTORY.countCorrection) },
    { value: 'OTHER', label: t(INVENTORY.adjustmentTypeOther) },
  ]
}

const REDUCTION_TYPES: InventoryAdjustmentType[] = ['DAMAGE', 'LOSS', 'EXPIRY']

const ADJUSTMENT_FIELD_GUIDANCE = {
  unit_level: FORM_GUIDANCE.adjustmentUnit,
  quantity_in_unit: FORM_GUIDANCE.adjustmentUnit,
  reason: FORM_GUIDANCE.adjustmentReasonOther,
} as const

interface AdjustmentModalProps {
  open: boolean
  onClose: () => void
  product: ProductWithUnits
}

export function AdjustmentModal({ open, onClose, product }: AdjustmentModalProps) {
  const { mutateAsync: adjust, isPending } = useAdjustInventory()
  const [guideSteps, setGuideSteps] = useState<BilingualPair[]>([])

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
      unit_level: product.units[0]?.unit_level ?? 0,
      quantity_in_unit: undefined,
      reason: '',
    },
  })

  useEffect(() => {
    if (open) {
      setGuideSteps([])
      reset({
        adjustment_type: 'DAMAGE',
        unit_level: product.units[0]?.unit_level ?? 0,
        quantity_in_unit: undefined,
        reason: '',
      })
    }
  }, [open, product, reset])

  const type = watch('adjustment_type')
  const unitLevel = Number(watch('unit_level'))
  const qty = Number(watch('quantity_in_unit'))
  const selectedUnit = product.units.find((u) => u.unit_level === unitLevel)
  const conversion = selectedUnit?.conversion_to_base ?? 1
  const isReduction = REDUCTION_TYPES.includes(type)
  const signedPieces =
    selectedUnit && !Number.isNaN(qty) && qty !== 0
      ? toAdjustmentRpcQuantity(type, qty * conversion)
      : null
  const estimate =
    signedPieces == null ? null : product.current_stock_pieces + signedPieces

  const onSubmit = async (data: AdjustmentForm) => {
    setGuideSteps([])
    try {
      const unit = product.units.find((u) => u.unit_level === data.unit_level)
      const params = toAdjustRpcParams(
        product.id,
        data.adjustment_type,
        data.quantity_in_unit,
        unit?.conversion_to_base ?? 1,
        data.reason,
      )
      await adjust(params)
      toastSuccessBi(INVENTORY.stockUpdated)
      onClose()
    } catch (err) {
      setError('root', { message: parseError(err).message })
    }
  }

  const onInvalid = (fieldErrors: typeof errors) => {
    const steps = guidanceStepsFromFieldErrors(fieldErrors, ADJUSTMENT_FIELD_GUIDANCE)
    const adjType = watch('adjustment_type')
    if (REDUCTION_TYPES.includes(adjType)) {
      steps.unshift(FORM_GUIDANCE.adjustmentQtyReduction)
    } else if (adjType === 'COUNT_CORRECTION') {
      steps.unshift(FORM_GUIDANCE.adjustmentQtySigned)
    }
    setGuideSteps(steps)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(INVENTORY.adjustProductTitle(product.name))}
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
        <FormActionGuide steps={guideSteps} />

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            {t(INVENTORY.adjustmentTypeLabel)} <span className="text-danger-foreground">*</span>
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
            <BilingualText {...INVENTORY.adjustmentUnitLabel} variant="caption" layout="inline" />
            <span className="text-danger-foreground ml-0.5">*</span>
          </label>
          <select
            {...register('unit_level')}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {product.units.map((unit) => (
              <option key={unit.id} value={unit.unit_level}>
                {unit.unit_name} (×{unit.conversion_to_base}{' '}
                {product.units[0]?.unit_name ?? 'pieces'})
              </option>
            ))}
          </select>
          {errors.unit_level && (
            <p className="text-xs text-danger-foreground mt-1">{errors.unit_level.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            <BilingualText {...INVENTORY.adjustmentQuantityInUnit} variant="caption" layout="inline" />
            <span className="text-danger-foreground ml-0.5">*</span>
          </label>
          <input
            type="number"
            step="any"
            {...register('quantity_in_unit')}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <p className="text-xs text-text-muted mt-1">
            {isReduction ? (
              <BilingualText {...FORM_GUIDANCE.adjustmentQtyReduction} variant="caption" layout="inline" />
            ) : type === 'COUNT_CORRECTION' ? (
              <BilingualText {...FORM_GUIDANCE.adjustmentQtySigned} variant="caption" layout="inline" />
            ) : (
              <BilingualText {...INVENTORY.signedAdjustmentHint} variant="caption" layout="inline" />
            )}
          </p>
          {errors.quantity_in_unit && (
            <p className="text-xs text-danger-foreground mt-1">{errors.quantity_in_unit.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            {t(COMMON.reason)}{' '}
            {type === 'OTHER' ? (
              <span className="text-danger-foreground">*</span>
            ) : (
              <span className="text-text-muted font-normal">{t(INVENTORY.restockNoteOptional)}</span>
            )}
          </label>
          <textarea
            rows={2}
            {...register('reason')}
            className="w-full rounded-md border border-border bg-surface text-sm text-text-primary px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
          {errors.reason && (
            <p className="text-xs text-danger-foreground mt-1">{errors.reason.message}</p>
          )}
        </div>

        <div className="rounded-lg bg-surface-muted border border-border p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-text-secondary">{t(INVENTORY.currentStock)}</span>
            <span className="font-medium tabular-nums">{formatPieces(product.current_stock_pieces)}</span>
          </div>
          {signedPieces != null && (
            <div className="flex justify-between">
              <span className="text-text-secondary">{t(INVENTORY.adjustmentInPieces)}</span>
              <span className="font-medium tabular-nums">{formatPieces(signedPieces)}</span>
            </div>
          )}
          {estimate != null && (
            <div className="flex justify-between">
              <span className="text-text-secondary">{t(INVENTORY.estimatedResult)}</span>
              <span className="font-medium tabular-nums">~ {formatPieces(estimate)}</span>
            </div>
          )}
          <p className="text-xs text-text-muted">
            <BilingualText {...INVENTORY.estimateDisclaimer} variant="caption" layout="inline" />
          </p>
          {estimate === 0 && (
            <p className="text-xs text-warning-foreground">
              <BilingualText {...INVENTORY.stockWillEmpty} variant="caption" layout="inline" />
            </p>
          )}
        </div>

        {errors.root?.message && (
          <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
            <p className="text-sm text-danger-foreground">{errors.root.message}</p>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            {t(COMMON.cancel)}
          </Button>
          <LoadingButton type="submit" loading={isPending}>
            {t(INVENTORY.applyAdjustment)}
          </LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
