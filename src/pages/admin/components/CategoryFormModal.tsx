import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button, LoadingButton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { parseError } from '@/lib/errors'
import { useCreateCategory, useUpdateCategory } from '@/hooks/useAdminCategories'
import type { Category } from '@/types/database'
import { ADMIN } from '@/lib/bilingual/admin'
import { COMMON } from '@/lib/bilingual/common'
import { BiButtonStack, BiModalTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { t } from '@/lib/bilingual/types'


interface CategoryFormModalProps {
  open: boolean
  onClose: () => void
  category?: Category | null
  parent?: Pick<Category, 'id' | 'name'> | null
}

export function CategoryFormModal({ open, onClose, category, parent = null }: CategoryFormModalProps) {
  const isEdit = !!category
  const [name, setName] = useState('')
  const [general, setGeneral] = useState('')
  const { mutateAsync: createCategory, isPending: creating } = useCreateCategory()
  const { mutateAsync: updateCategory, isPending: updating } = useUpdateCategory()
  const isPending = creating || updating
  const isSubcategory = !isEdit && !!parent
  const titlePair = isEdit
    ? ADMIN.renameCategory
    : isSubcategory
      ? ADMIN.newSubcategory
      : ADMIN.newCategory

  useEffect(() => {
    if (!open) return
    setGeneral('')
    setName(category?.name ?? '')
  }, [open, category])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGeneral('')
    try {
      if (isEdit && category) {
        await updateCategory({ p_category_id: category.id, p_name: name.trim() })
      } else {
        await createCategory({ p_name: name.trim(), p_parent_id: parent?.id ?? null })
      }
      onClose()
    } catch (err) {
      setGeneral(parseError(err).message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={<BiModalTitle {...titlePair} />} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {isSubcategory && parent ? (
          <p className="text-sm text-text-secondary">
            <BilingualText {...ADMIN.underCategory(parent.name)} variant="body" />
          </p>
        ) : null}
        <div>
          <label htmlFor="category-name" className="block mb-1.5 uppercase tracking-wide">
            <BiTableHeader {...ADMIN.colName} />
          </label>
          <input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface"
          />
        </div>
        {general && (
          <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
            <p className="text-sm text-danger">{general}</p>
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            <BiButtonStack {...COMMON.cancel} />
          </Button>
          <LoadingButton type="submit" loading={isPending}>
            {isEdit ? <BiButtonStack {...COMMON.save} /> : <BiButtonStack {...COMMON.add} />}
          </LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
