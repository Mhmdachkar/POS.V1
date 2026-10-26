/**
 * RestockModal — consumer of restock_product RPC.
 *
 * Sends: p_product_id, p_unit_level, p_quantity_in_unit, p_note.
 * Never sends unit_id or quantity_pieces. Server computes pieces.
 * Depot is resolved inside the RPC from the product row.
 */

import { useEffect, useState } from 'react'
import { toastSuccessBi } from '@/lib/bilingual/toast'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FORM_GUIDANCE } from '@/lib/bilingual/formGuidance'
import { Modal } from '@/components/ui/Modal'
import { Button, FormActionGuide, LoadingButton } from '@/components/ui'
import { guidanceStepsFromFieldErrors } from '@/lib/formSubmitGuidance'
import { formatPieces } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import {
  restockFormSchema,
  toRestockRpcParams,
  useRestockProduct,
} from '@/hooks/useInventory'
import type { ProductWithUnits } from '@/types'
import type { z } from 'zod'
import { t, type BilingualPair } from '@/lib/bilingual/types'

const RESTOCK_FIELD_GUIDANCE = {
  unit_level: FORM_GUIDANCE.restockUnitQty,
  quantity_in_unit: FORM_GUIDANCE.restockUnitQty,
} as const


type RestockForm = z.infer<typeof restockFormSchema>

interface RestockModalProps {
  open: boolean
  onClose: () => void
  product: ProductWithUnits
}

export function RestockModal({ open, onClose, product }: RestockModalProps) {
  const { mutateAsync: restock, isPending } = useRestockProduct()
  const [guideSteps, setGuideSteps] = useState<BilingualPair[]>([])

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<RestockForm>({
    resolver: zodResolver(restockFormSchema),
    defaultValues: {
      unit_level: product.units[0]?.unit_level ?? 0,
      quantity_in_unit: undefined,
      note: '',
    },
  })

  useEffect(() => {
    if (open) {
      setGuideSteps([])
      reset({
        unit_level: product.units[0]?.unit_level ?? 0,
        quantity_in_unit: undefined,
        note: '',
      })
    }
  }, [open, product, reset])

  const unitLevel = Number(watch('unit_level'))
  const qty = Number(watch('quantity_in_unit'))
  const selectedUnit = product.units.find((u) => u.unit_level === unitLevel)
  const previewPieces =
    selectedUnit && qty > 0 ? qty * selectedUnit.conversion_to_base : null

  const onSubmit = async (data: RestockForm) => {
    setGuideSteps([])
    try {
      const params = toRestockRpcParams(product.id, {
        unit_level: data.unit_level,
        quantity_in_unit: data.quantity_in_unit,
        note: data.note,
      })
      await restock(params)
      toastSuccessBi(INVENTORY.stockUpdated)
      onClose()
    } catch (err) {
      setError('root', { message: parseError(err).message })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Restock — ${product.name}`} size="md">
      <form
        onSubmit={handleSubmit(onSubmit, (fieldErrors) => {
          setGuideSteps(guidanceStepsFromFieldErrors(fieldErrors, RESTOCK_FIELD_GUIDANCE))
        })}
        className="space-y-4"
      >
        <FormActionGuide steps={guideSteps} />
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            Unit <span className="text-danger-foreground">*</span>
          </label>
          <select
            {...register('unit_level')}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {product.units.map((unit) => (
              <option key={unit.id} value={unit.unit_level}>
                {unit.unit_name} (×{unit.conversion_to_base})
              </option>
            ))}
          </select>
          {errors.unit_level && (
            <p className="text-xs text-danger-foreground mt-1">{errors.unit_level.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            Quantity <span className="text-danger-foreground">*</span>
          </label>
          <input
            type="number"
            step="any"
            min="0"
            {...register('quantity_in_unit')}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {errors.quantity_in_unit && (
            <p className="text-xs text-danger-foreground mt-1">{errors.quantity_in_unit.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            Note <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <textarea
            rows={2}
            {...register('note')}
            className="w-full rounded-md border border-border bg-surface text-sm text-text-primary px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
        </div>

        {previewPieces != null && (
          <p className="text-xs text-text-secondary">
            Will add approx. {formatPieces(previewPieces)}. Exact value computed server-side.
          </p>
        )}

        {errors.root?.message && (
          <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
            <p className="text-sm text-danger-foreground">{errors.root.message}</p>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <LoadingButton type="submit" loading={isPending}>
            Restock
          </LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
