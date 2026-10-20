import { useState } from 'react'
import { Edit, UserCheck, UserX } from 'lucide-react'
import { ActiveBadge, Button, ConfirmDialog, Drawer, LoadingButton, Skeleton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { formatDateTime } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import { roleLabel, useDeactivateStaff, useReactivateStaff, useStaff } from '@/hooks/useStaff'
import { useDepotOptions } from '@/hooks/useInventory'
import { useAuthStore } from '@/stores/authStore'
import { StaffFormModal } from './StaffFormModal'
import { ADMIN } from '@/lib/bilingual/admin'
import { COMMON } from '@/lib/bilingual/common'
import { BiButtonStack, BiTableHeader } from '@/lib/bilingual/ui'
import { t, bilingualAriaLabel } from '@/lib/bilingual/types'

function DetailRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary flex-shrink-0">{label}</span>
      <span className="text-sm text-text-primary text-right font-medium">{value}</span>
    </div>
  )
}

interface StaffDetailDrawerProps {
  staffId: string | null
  onClose: () => void
}

export function StaffDetailDrawer({ staffId, onClose }: StaffDetailDrawerProps) {
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [actionError, setActionError] = useState('')

  const me = useAuthStore((s) => s.staff)
  const { data: staff, isLoading } = useStaff(staffId)
  const { data: depots } = useDepotOptions()
  const { mutateAsync: deactivate, isPending: deactivating } = useDeactivateStaff()
  const { mutateAsync: reactivate, isPending: reactivating } = useReactivateStaff()

  const isSelf = !!staff && staff.id === me?.id
  const depotName = staff?.depot_id
    ? depots?.find((d) => d.id === staff.depot_id)?.name ?? '—'
    : '—'

  async function handleDeactivate() {
    if (!staff) return
    setActionError('')
    try {
      await deactivate(staff.id)
      setConfirmDeactivate(false)
    } catch (err) {
      setActionError(parseError(err).message)
      setConfirmDeactivate(false)
    }
  }

  async function handleReactivate() {
    if (!staff) return
    setActionError('')
    try {
      await reactivate(staff.id)
    } catch (err) {
      setActionError(parseError(err).message)
    }
  }

  return (
    <>
      <Drawer
        open={!!staffId}
        onClose={onClose}
        title={isLoading ? <BiTableHeader {...ADMIN.staff} /> : (staff?.full_name ?? <BiTableHeader {...ADMIN.staff} />)}
        width="md"
      >
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : !staff ? (
          <p className="text-sm text-text-muted">
            <BilingualText {...ADMIN.staffNotFound} variant="body" />
          </p>
        ) : (
          <div>
            <div className="space-y-0">
              <DetailRow
                label={<BiTableHeader {...ADMIN.colName} />}
                value={<span className="flex items-center justify-end gap-2">{staff.full_name}<ActiveBadge isActive={staff.is_active} /></span>}
              />
              <DetailRow label={<BiTableHeader {...ADMIN.colUsername} />} value={staff.username} />
              <DetailRow label={<BiTableHeader {...ADMIN.role} />} value={roleLabel(staff.role)} />
              <DetailRow
                label={<BiTableHeader {...COMMON.depot} />}
                value={staff.role === 'admin' ? <BilingualText {...ADMIN.allDepotsStaff} variant="caption" /> : depotName}
              />
              <DetailRow label={<BiTableHeader {...COMMON.created} />} value={formatDateTime(staff.created_at)} />
              {staff.deactivated_at && (
                <DetailRow label={<BiTableHeader {...ADMIN.deactivatedAt} />} value={formatDateTime(staff.deactivated_at)} />
              )}
            </div>

            {actionError && (
              <div className="mt-4 rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
                <p className="text-sm text-danger">{actionError}</p>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-border space-y-2">
              <Button variant="secondary" className="w-full gap-2" onClick={() => setShowEdit(true)}>
                <Edit className="h-4 w-4" />
                <BiButtonStack {...ADMIN.editStaffBtn} />
              </Button>
              {staff.is_active ? (
                <LoadingButton
                  variant="ghost"
                  className="w-full gap-2 text-warning-foreground hover:bg-warning-bg"
                  onClick={() => setConfirmDeactivate(true)}
                  loading={deactivating}
                  disabled={isSelf}
                  title={isSelf ? bilingualAriaLabel(ADMIN.cannotDeactivateSelf) : undefined}
                >
                  <UserX className="h-4 w-4" />
                  <BiButtonStack {...ADMIN.deactivateStaff} />
                </LoadingButton>
              ) : (
                <LoadingButton
                  variant="ghost"
                  className="w-full gap-2 text-success-foreground hover:bg-success-bg"
                  onClick={handleReactivate}
                  loading={reactivating}
                >
                  <UserCheck className="h-4 w-4" />
                  <BiButtonStack {...ADMIN.reactivateStaff} />
                </LoadingButton>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <StaffFormModal open={showEdit} onClose={() => setShowEdit(false)} staff={staff} />
      <ConfirmDialog
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={handleDeactivate}
        title={<BiTableHeader {...ADMIN.deactivateStaffTitle} />}
        message={<BilingualText {...ADMIN.deactivateStaffMessage} variant="body" />}
        confirmLabel={<BiButtonStack {...ADMIN.deactivateLabel} />}
        isLoading={deactivating}
      />
    </>
  )
}
