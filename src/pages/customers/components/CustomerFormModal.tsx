/**
 * CustomerFormModal — Create or edit a customer.
 *
 * Used from:
 *   1. CustomersPage (create new / edit existing)
 *   2. CustomerSelector inside POS (inline creation)
 *
 * All mutations go through SECURITY DEFINER RPCs:
 *   - Create: rpc.createCustomer (Phase 6 security fix — replaces direct INSERT)
 *   - Edit:   rpc.updateCustomer
 *
 * Does NOT update balance_owed_cfa, is_active, or deactivated_at.
 * No country field (not in DB schema).
 */

import { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { FORM_GUIDANCE } from '@/lib/bilingual/formGuidance'
import { Button, FormActionGuide, LoadingButton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { cn } from '@/lib/cn'
import { parseError } from '@/lib/errors'
import { useCreateCustomer, useUpdateCustomer } from '@/hooks/useCustomers'
import type { Customer } from '@/types/database'
import { COMMON } from '@/lib/bilingual/common'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { BiButtonStack, BiModalTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { t, bilingualPlain, type BilingualPair } from '@/lib/bilingual/types'

interface CustomerFormModalProps {
  open: boolean
  onClose: () => void
  /** If provided, the modal is in "edit" mode; otherwise "create" mode. */
  customer?: Customer | null
  onSuccess?: (customer: { id: string; name: string; phone: string | null }) => void
}

interface FormState {
  name: string
  phone: string
  address: string
}

interface FormErrors {
  name?: string
  general?: string
}

export function CustomerFormModal({ open, onClose, customer, onSuccess }: CustomerFormModalProps) {
  const isEdit = !!customer

  const [form, setForm] = useState<FormState>({ name: '', phone: '', address: '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const [guideSteps, setGuideSteps] = useState<BilingualPair[]>([])
  const nameRef = useRef<HTMLInputElement>(null)

  const { mutateAsync: createCustomer, isPending: isCreating } = useCreateCustomer()
  const { mutateAsync: updateCustomer, isPending: isUpdating } = useUpdateCustomer()
  const isPending = isCreating || isUpdating

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (customer) {
        setForm({
          name:    customer.name,
          phone:   customer.phone ?? '',
          address: customer.address ?? '',
        })
      } else {
        setForm({ name: '', phone: '', address: '' })
      }
      setErrors({})
      setGuideSteps([])
    }
  }, [open, customer])

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => nameRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  const validate = (): boolean => {
    const e: FormErrors = {}
    if (!form.name.trim()) {
      e.name = bilingualPlain(CUSTOMERS.nameRequiredError)
    } else if (form.name.trim().length > 255) {
      e.name = bilingualPlain(CUSTOMERS.nameMaxError)
    }
    setErrors(e)
    if (e.name) {
      setGuideSteps([FORM_GUIDANCE.customerName])
    } else {
      setGuideSteps([])
    }
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setGuideSteps([])

    try {
      if (isEdit && customer) {
        const result = await updateCustomer({
          p_customer_id: customer.id,
          p_name:        form.name.trim(),
          p_phone:       form.phone.trim() || null,
          p_address:     form.address.trim() || null,
        })
        onSuccess?.({ id: result.id, name: result.name, phone: result.phone })
      } else {
        const result = await createCustomer({
          p_name:    form.name.trim(),
          p_phone:   form.phone.trim() || null,
          p_address: form.address.trim() || null,
        })
        onSuccess?.({ id: result.id, name: result.name, phone: result.phone })
      }
      onClose()
    } catch (err) {
      const vhmErr = parseError(err)
      if (vhmErr.code === 'INVALID_INPUT') {
        const field = vhmErr.details?.field as string | undefined
        if (field === 'name') {
          setErrors({ name: vhmErr.message })
        } else {
          setErrors({ general: vhmErr.message })
        }
      } else {
        setErrors({ general: vhmErr.message })
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<BiModalTitle {...(isEdit ? CUSTOMERS.editCustomer : CUSTOMERS.newCustomerButton)} />}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormActionGuide steps={guideSteps} />
        <div>
          <label className="block mb-1.5 uppercase tracking-wide">
            <BiTableHeader {...CUSTOMERS.fullNameRequired} />
          </label>
          <input
            ref={nameRef}
            type="text"
            value={form.name}
            onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErrors((er) => ({ ...er, name: undefined })) }}
            placeholder={bilingualPlain(CUSTOMERS.fullNamePlaceholder)}
            maxLength={255}
            className={cn(
              'w-full h-9 px-3 rounded-md border text-sm bg-surface text-text-primary',
              'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
              errors.name ? 'border-danger' : 'border-border',
            )}
          />
          {errors.name && (
            <p className="text-xs text-danger-foreground mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="block mb-1.5 uppercase tracking-wide">
            <BiTableHeader {...CUSTOMERS.phoneOptional} />
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder={bilingualPlain(CUSTOMERS.phonePlaceholder)}
            className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div>
          <label className="block mb-1.5 uppercase tracking-wide">
            <BiTableHeader {...CUSTOMERS.addressOptional} />
          </label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder={bilingualPlain(CUSTOMERS.addressPlaceholder)}
            className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        {errors.general && (
          <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
            <p className="text-sm text-danger-foreground">{errors.general}</p>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            <BiButtonStack {...COMMON.cancel} />
          </Button>
          <LoadingButton type="submit" loading={isPending}>
            {isEdit ? <BiButtonStack {...CUSTOMERS.saveChanges} /> : <BiButtonStack {...CUSTOMERS.createCustomerBtn} />}
          </LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
