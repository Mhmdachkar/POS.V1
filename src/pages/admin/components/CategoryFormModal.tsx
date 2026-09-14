import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button, LoadingButton } from '@/components/ui'
import { parseError } from '@/lib/errors'
import { useAdminCategoryList, useCreateCategory, useUpdateCategory } from '@/hooks/useAdminCategories'
import type { Category } from '@/types/database'

interface CategoryFormModalProps {
  open: boolean
  onClose: () => void
  category?: Category | null
  defaultParentId?: string | null
}

export function CategoryFormModal({ open, onClose, category, defaultParentId }: CategoryFormModalProps) {
  const isEdit = !!category
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const [general, setGeneral] = useState('')
  const { data: allCategories } = useAdminCategoryList()
  const { mutateAsync: createCategory, isPending: creating } = useCreateCategory()
  const { mutateAsync: updateCategory, isPending: updating } = useUpdateCategory()
  const isPending = creating || updating

  useEffect(() => {
    if (!open) return
    setGeneral('')
    setName(category?.name ?? '')
    setParentId(category?.parent_id ?? defaultParentId ?? '')
  }, [open, category, defaultParentId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGeneral('')
    try {
      if (isEdit && category) {
        await updateCategory({ p_category_id: category.id, p_name: name.trim() })
      } else {
        await createCategory({ p_name: name.trim(), p_parent_id: parentId || null })
      }
      onClose()
    } catch (err) {
      setGeneral(parseError(err).message)
    }
  }

  const parentOptions = (allCategories ?? []).filter((c) => c.is_active && c.id !== category?.id)

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Rename Category' : 'New Category'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface" />
        </div>
        {!isEdit && (
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Parent</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface"
            >
              <option value="">Root category</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        {isEdit && (
          <p className="text-xs text-text-muted">Categories cannot be moved to a different parent.</p>
        )}
        {general && (
          <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
            <p className="text-sm text-danger">{general}</p>
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
          <LoadingButton type="submit" loading={isPending}>{isEdit ? 'Save' : 'Create'}</LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
