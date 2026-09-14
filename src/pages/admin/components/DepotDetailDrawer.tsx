import { useState } from 'react'
import { Building2, Edit } from 'lucide-react'
import { ActiveBadge, Button, ConfirmDialog, Drawer, LoadingButton, Skeleton } from '@/components/ui'
import { parseError } from '@/lib/errors'
import { useAdminDepot, useDeactivateDepot, useReactivateDepot } from '@/hooks/useAdminDepots'
import { DepotFormModal } from './DepotFormModal'

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary font-medium text-right">{value}</span>
    </div>
  )
}

export function DepotDetailDrawer({ depotId, onClose }: { depotId: string | null; onClose: () => void }) {
  const [showEdit, setShowEdit] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [actionError, setActionError] = useState('')
  const { data: depot, isLoading } = useAdminDepot(depotId)
  const { mutateAsync: deactivate, isPending: deactivating } = useDeactivateDepot()
  const { mutateAsync: reactivate, isPending: reactivating } = useReactivateDepot()

  async function handleDeactivate() {
    if (!depot) return
    setActionError('')
    try {
      await deactivate(depot.id)
      setConfirm(false)
    } catch (err) {
      setActionError(parseError(err).message)
      setConfirm(false)
    }
  }

  async function handleReactivate() {
    if (!depot) return
    setActionError('')
    try {
      await reactivate(depot.id)
    } catch (err) {
      setActionError(parseError(err).message)
    }
  }

  return (
    <>
      <Drawer open={!!depotId} onClose={onClose} title={depot?.name ?? 'Depot'} width="md">
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
        ) : !depot ? (
          <p className="text-sm text-text-muted">Depot not found.</p>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-4 text-text-secondary">
              <Building2 className="h-4 w-4" />
              <span className="text-sm">Code {depot.code}</span>
            </div>
            <DetailRow label="Name" value={<span className="flex items-center justify-end gap-2">{depot.name}<ActiveBadge isActive={depot.is_active} /></span>} />
            <DetailRow label="Location" value={depot.location} />
            <DetailRow label="Code" value={depot.code} />
            {actionError && (
              <div className="mt-4 rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
                <p className="text-sm text-danger">{actionError}</p>
              </div>
            )}
            <div className="mt-6 pt-4 border-t border-border space-y-2">
              <Button variant="secondary" className="w-full gap-2" onClick={() => setShowEdit(true)}>
                <Edit className="h-4 w-4" /> Edit Depot
              </Button>
              {depot.is_active ? (
                <LoadingButton variant="ghost" className="w-full text-warning-foreground" onClick={() => setConfirm(true)} loading={deactivating}>
                  Deactivate Depot
                </LoadingButton>
              ) : (
                <LoadingButton variant="ghost" className="w-full text-success-foreground" onClick={handleReactivate} loading={reactivating}>
                  Reactivate Depot
                </LoadingButton>
              )}
            </div>
          </div>
        )}
      </Drawer>
      <DepotFormModal open={showEdit} onClose={() => setShowEdit(false)} depot={depot} />
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={handleDeactivate}
        title="Deactivate depot?"
        message="Blocked if active staff, open shifts, or pending transfers remain. Stock is kept. Staff are not deactivated."
        confirmLabel="Deactivate"
        isLoading={deactivating}
      />
    </>
  )
}
