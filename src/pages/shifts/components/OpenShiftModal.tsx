/**
 * OpenShiftModal — open a cashier shift with opening float.
 */

import { useEffect, useState } from 'react'
import { Button, Input, LoadingButton, Modal } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { COMMON } from '@/lib/bilingual/common'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { BiButtonStack, BiModalTitle, BiPageDescription } from '@/lib/bilingual/ui'
import { toastSuccessBi } from '@/lib/bilingual/toast'
import { t, bilingualPlain } from '@/lib/bilingual/types'
import { parseError } from '@/lib/errors'
import { useDepotOptions } from '@/hooks/useInventory'
import { parseNonNegativeCfa, useOpenShift } from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'

interface OpenShiftModalProps {
  open: boolean
  onClose: () => void
  onOpened?: (shiftId: string) => void
}

export function OpenShiftModal({ open, onClose, onOpened }: OpenShiftModalProps) {
  const staff = useAuthStore((s) => s.staff)
  const { data: depots } = useDepotOptions()
  const { mutateAsync: openShift, isPending } = useOpenShift()

  const isCashier = staff?.role === 'cashier'
  const lockedDepotId = isCashier ? staff?.depot_id ?? '' : ''

  const [depotId, setDepotId] = useState(lockedDepotId)
  const [floatStr, setFloatStr] = useState('0')
  const [formError, setFormError] = useState<string | null>(null)

  const activeDepots = (depots ?? []).filter((d) => d.is_active !== false)
  const lockedDepotName =
    activeDepots.find((d) => d.id === lockedDepotId)?.name
    ?? staff?.depot_id
    ?? '—'

  useEffect(() => {
    if (!open) return
    setDepotId(lockedDepotId)
    setFloatStr('0')
    setFormError(null)
  }, [open, lockedDepotId])

  const floatValue = parseNonNegativeCfa(floatStr)
  const canSubmit = floatValue !== null && (isCashier || !!depotId) && !isPending

  const handleSubmit = async () => {
    if (floatValue === null) {
      setFormError(bilingualPlain(SHIFT_COPY.openingFloatError))
      return
    }
    if (!isCashier && !depotId) {
      setFormError(bilingualPlain(SHIFT_COPY.selectDepotError))
      return
    }

    setFormError(null)
    try {
      const result = await openShift({
        p_depot_id: isCashier ? lockedDepotId || undefined : depotId,
        p_opening_float_cfa: floatValue,
      })
      toastSuccessBi(SHIFT_COPY.shiftOpened)
      onOpened?.(result.shift_id)
      onClose()
    } catch (err) {
      setFormError(parseError(err).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!isPending) onClose() }}
      title={<BiModalTitle {...SHIFT_COPY.openShiftTitle} />}
      description={<BiPageDescription {...SHIFT_COPY.openShiftDesc} />}
      size="sm"
    >
      <div className="space-y-4">
        {isCashier ? (
          <div>
            <p className="text-sm font-medium text-text-primary mb-1">
              <BilingualText {...COMMON.depot} variant="body" layout="inline" />
            </p>
            <p className="text-sm text-text-secondary">{lockedDepotName}</p>
          </div>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">
              <BilingualText {...COMMON.depot} variant="body" layout="inline" />
            </span>
            <select
              value={depotId}
              onChange={(e) => { setDepotId(e.target.value); setFormError(null) }}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
            >
              <option value="">{bilingualPlain(SHIFT_COPY.selectDepotOption)}</option>
              {activeDepots.map((depot) => (
                <option key={depot.id} value={depot.id}>{depot.name}</option>
              ))}
            </select>
          </label>
        )}

        <Input
          label={bilingualPlain(SHIFT_COPY.cashInDrawer)}
          inputMode="decimal"
          value={floatStr}
          onChange={(e) => { setFloatStr(e.target.value); setFormError(null) }}
          error={floatValue === null && floatStr.trim() !== '' ? bilingualPlain(SHIFT_COPY.floatNonNegative) : undefined}
        />

        {formError && <p className="text-sm text-danger-foreground">{formError}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            <BiButtonStack {...COMMON.cancel} />
          </Button>
          <LoadingButton
            loading={isPending}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            <BiButtonStack {...SHIFT_COPY.openShift} />
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
