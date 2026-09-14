/**
 * OpenShiftModal — open a cashier shift with opening float.
 *
 * Cashier: depot locked to staff.depot_id (server also ignores client depot).
 * Admin: must pick an active depot.
 * Success explicitly binds posStore.shiftId to the created shift.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Input, LoadingButton, Modal } from '@/components/ui'
import { parseError } from '@/lib/errors'
import { useDepotOptions } from '@/hooks/useInventory'
import { parseNonNegativeCfa, useOpenShift } from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'

interface OpenShiftModalProps {
  open: boolean
  onClose: () => void
  onOpened?: (shiftId: string) => void
}

export function OpenShiftModal({ open, onClose, onOpened }: OpenShiftModalProps) {
  const staff = useAuthStore((s) => s.staff)
  const setShiftId = usePOSStore((s) => s.setShiftId)
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
      setFormError('Opening float must be zero or greater.')
      return
    }
    if (!isCashier && !depotId) {
      setFormError('Select a depot.')
      return
    }

    setFormError(null)
    try {
      const result = await openShift({
        p_depot_id: isCashier ? lockedDepotId || undefined : depotId,
        p_opening_float_cfa: floatValue,
      })
      setShiftId(result.shift_id)
      toast.success('Shift opened.')
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
      title="Open Shift"
      description="Record opening cash in the drawer."
      size="sm"
    >
      <div className="space-y-4">
        {isCashier ? (
          <div>
            <p className="text-sm font-medium text-text-primary mb-1">Depot</p>
            <p className="text-sm text-text-secondary">{lockedDepotName}</p>
          </div>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">Depot</span>
            <select
              value={depotId}
              onChange={(e) => { setDepotId(e.target.value); setFormError(null) }}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
            >
              <option value="">Select depot</option>
              {activeDepots.map((depot) => (
                <option key={depot.id} value={depot.id}>{depot.name}</option>
              ))}
            </select>
          </label>
        )}

        <Input
          label="Cash in Drawer (CFA)"
          inputMode="decimal"
          value={floatStr}
          onChange={(e) => { setFloatStr(e.target.value); setFormError(null) }}
          error={floatValue === null && floatStr.trim() !== '' ? 'Must be zero or greater.' : undefined}
        />

        {formError && <p className="text-sm text-danger">{formError}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <LoadingButton
            loading={isPending}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            Open Shift
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
