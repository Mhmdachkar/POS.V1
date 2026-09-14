import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button, LoadingButton } from '@/components/ui'
import { parseError } from '@/lib/errors'
import { useCreateDepot, useUpdateDepot } from '@/hooks/useAdminDepots'
import type { Depot } from '@/types/database'

interface DepotFormModalProps {
  open: boolean
  onClose: () => void
  depot?: Depot | null
}

export function DepotFormModal({ open, onClose, depot }: DepotFormModalProps) {
  const isEdit = !!depot
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [code, setCode] = useState('')
  const [general, setGeneral] = useState('')
  const { mutateAsync: createDepot, isPending: creating } = useCreateDepot()
  const { mutateAsync: updateDepot, isPending: updating } = useUpdateDepot()
  const isPending = creating || updating

  useEffect(() => {
    if (!open) return
    setGeneral('')
    setName(depot?.name ?? '')
    setLocation(depot?.location ?? '')
    setCode(depot?.code ?? '')
  }, [open, depot])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGeneral('')
    try {
      if (isEdit && depot) {
        await updateDepot({ p_depot_id: depot.id, p_name: name.trim(), p_location: location.trim() })
      } else {
        await createDepot({ p_name: name.trim(), p_location: location.trim(), p_code: code.trim() })
      }
      onClose()
    } catch (err) {
      setGeneral(parseError(err).message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Depot' : 'New Depot'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} required className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required={!isEdit}
            disabled={isEdit}
            className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface disabled:opacity-60"
          />
          {isEdit && <p className="text-xs text-text-muted mt-1">Depot code cannot be changed.</p>}
        </div>
        {general && (
          <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
            <p className="text-sm text-danger">{general}</p>
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
          <LoadingButton type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Depot'}</LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
