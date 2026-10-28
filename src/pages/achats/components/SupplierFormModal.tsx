import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button, LoadingButton } from '@/components/ui'
import { ACHATS } from '@/lib/bilingual/achats'
import { COMMON } from '@/lib/bilingual/common'
import { BiButtonStack, BiModalTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { t } from '@/lib/bilingual/types'
import { parseError } from '@/lib/errors'
import { useCreateSupplier, useUpdateSupplier, type SupplierRow } from '@/hooks/useAchats'

interface Props {
  open: boolean
  onClose: () => void
  supplier?: SupplierRow | null
}

export function SupplierFormModal({ open, onClose, supplier }: Props) {
  const isEdit = !!supplier
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const create = useCreateSupplier()
  const update = useUpdateSupplier()
  const pending = create.isPending || update.isPending

  useEffect(() => {
    if (!open) return
    setName(supplier?.name ?? '')
    setPhone(supplier?.phone ?? '')
    setAddress(supplier?.address ?? '')
    setError('')
    const tmr = setTimeout(() => nameRef.current?.focus(), 50)
    return () => clearTimeout(tmr)
  }, [open, supplier])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError(t(ACHATS.nameRequired))
      return
    }
    try {
      if (isEdit && supplier) {
        await update.mutateAsync({
          p_supplier_id: supplier.id,
          p_name: name.trim(),
          p_phone: phone.trim() || null,
          p_address: address.trim() || null,
        })
      } else {
        await create.mutateAsync({
          p_name: name.trim(),
          p_phone: phone.trim() || null,
          p_address: address.trim() || null,
        })
      }
      onClose()
    } catch (err) {
      setError(parseError(err).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<BiModalTitle {...(isEdit ? ACHATS.editSupplier : ACHATS.newSupplier)} />}
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-secondary">
            <BiTableHeader {...ACHATS.name} /> *
          </span>
          <input
            ref={nameRef}
            className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-secondary">
            <BiTableHeader {...ACHATS.phone} />
          </span>
          <input
            className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-secondary">
            <BiTableHeader {...ACHATS.address} />
          </span>
          <textarea
            className="w-full min-h-[72px] px-3 py-2 rounded-md border border-border bg-surface text-sm"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-danger-foreground">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            <BiButtonStack {...COMMON.cancel} />
          </Button>
          <LoadingButton type="submit" loading={pending}>
            <BiButtonStack {...COMMON.save} />
          </LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
