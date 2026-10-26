import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button, LoadingButton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { parseError } from '@/lib/errors'
import { useCreateStaff, useUpdateStaff } from '@/hooks/useStaff'
import { useDepotOptions } from '@/hooks/useInventory'
import type { Staff } from '@/types/database'
import type { AdminStaffRole } from '@/types/rpc'
import { ADMIN } from '@/lib/bilingual/admin'
import { COMMON } from '@/lib/bilingual/common'
import { BiButtonStack, BiModalTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { t, bilingualPlain } from '@/lib/bilingual/types'

interface StaffFormModalProps {
  open: boolean
  onClose: () => void
  staff?: Staff | null
}

interface FormState {
  username: string
  full_name: string
  role: AdminStaffRole
  depot_id: string
  password: string
}

function roleOptionLabel(pair: { fr: string; en: string }) {
  return t(pair)
}

export function StaffFormModal({ open, onClose, staff }: StaffFormModalProps) {
  const isEdit = !!staff
  const [form, setForm] = useState<FormState>({
    username: '',
    full_name: '',
    role: 'cashier',
    depot_id: '',
    password: '',
  })
  const [general, setGeneral] = useState('')

  const { data: depots } = useDepotOptions()
  const { mutateAsync: createStaff, isPending: creating } = useCreateStaff()
  const { mutateAsync: updateStaff, isPending: updating } = useUpdateStaff()
  const isPending = creating || updating
  const activeDepots = (depots ?? []).filter((d) => d.is_active)

  useEffect(() => {
    if (!open) return
    setGeneral('')
    if (staff) {
      setForm({
        username: staff.username,
        full_name: staff.full_name,
        role: staff.role,
        depot_id: staff.depot_id ?? '',
        password: '',
      })
    } else {
      setForm({
        username: '',
        full_name: '',
        role: 'cashier',
        depot_id: '',
        password: '',
      })
    }
  }, [open, staff])

  const needsDepot = form.role !== 'admin'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGeneral('')
    try {
      if (isEdit && staff) {
        await updateStaff({
          staff_id: staff.id,
          full_name: form.full_name.trim(),
          role: form.role,
          depot_id: form.role === 'admin' ? null : form.depot_id || null,
        })
      } else {
        await createStaff({
          username: form.username.trim(),
          full_name: form.full_name.trim(),
          role: form.role,
          depot_id: form.role === 'admin' ? null : form.depot_id || null,
          password: form.password,
        })
      }
      onClose()
    } catch (err) {
      setGeneral(parseError(err).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<BiModalTitle {...(isEdit ? ADMIN.editStaff : ADMIN.newStaff)} />}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <div>
            <label className="block mb-1.5 uppercase tracking-wide">
              <BiTableHeader {...ADMIN.colUsername} />
            </label>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface"
              required
              autoComplete="off"
            />
          </div>
        )}

        <div>
          <label className="block mb-1.5 uppercase tracking-wide">
            <BiTableHeader {...ADMIN.fullName} />
          </label>
          <input
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface"
            required
          />
        </div>

        <div>
          <label htmlFor="staff-role" className="block mb-1.5 uppercase tracking-wide">
            <BiTableHeader {...ADMIN.role} />
          </label>
          <select
            id="staff-role"
            value={form.role}
            onChange={(e) => {
              const role = e.target.value as AdminStaffRole
              setForm((f) => ({ ...f, role, depot_id: role === 'admin' ? '' : f.depot_id }))
            }}
            className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface"
          >
            <option value="admin">{roleOptionLabel(ADMIN.roleAdmin)}</option>
            <option value="cashier">{roleOptionLabel(ADMIN.roleCashier)}</option>
            <option value="depot_staff">{roleOptionLabel(ADMIN.roleDepotStaff)}</option>
          </select>
        </div>

        {needsDepot && (
          <div>
            <label htmlFor="staff-depot" className="block mb-1.5 uppercase tracking-wide">
              <BiTableHeader {...COMMON.depot} />
            </label>
            <select
              id="staff-depot"
              value={form.depot_id}
              onChange={(e) => setForm((f) => ({ ...f, depot_id: e.target.value }))}
              className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface"
              required
            >
              <option value="">{bilingualPlain(ADMIN.selectDepot)}</option>
              {activeDepots.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
              ))}
            </select>
          </div>
        )}

        {!isEdit && (
          <div>
            <label className="block mb-1.5 uppercase tracking-wide">
              <BiTableHeader {...ADMIN.temporaryPassword} />
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        )}

        {general && (
          <div className={cn('rounded-md bg-danger-bg border border-danger/20 px-3 py-2')}>
            <p className="text-sm text-danger-foreground">{general}</p>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            <BiButtonStack {...COMMON.cancel} />
          </Button>
          <LoadingButton type="submit" loading={isPending}>
            {isEdit ? <BiButtonStack {...ADMIN.saveChanges} /> : <BiButtonStack {...ADMIN.createStaffBtn} />}
          </LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
