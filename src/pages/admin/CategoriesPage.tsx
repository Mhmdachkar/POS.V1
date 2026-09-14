import { useState } from 'react'
import { Plus, Tag } from 'lucide-react'
import { ActiveBadge, Button, ConfirmDialog, EmptyState, LoadingButton, Skeleton } from '@/components/ui'
import { parseError } from '@/lib/errors'
import {
  flattenTree,
  useAdminCategoryTree,
  useDeactivateCategory,
  useReactivateCategory,
} from '@/hooks/useAdminCategories'
import type { Category } from '@/types/database'
import { CategoryFormModal } from './components/CategoryFormModal'

export function CategoriesPage() {
  const { data: tree, isLoading, isError } = useAdminCategoryTree()
  const rows = flattenTree(tree ?? [])
  const [createOpen, setCreateOpen] = useState(false)
  const [edit, setEdit] = useState<Category | null>(null)
  const [parentForCreate, setParentForCreate] = useState<string | null>(null)
  const [deactivateId, setDeactivateId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const { mutateAsync: deactivate, isPending: deactivating } = useDeactivateCategory()
  const { mutateAsync: reactivate, isPending: reactivating } = useReactivateCategory()

  async function handleDeactivate() {
    if (!deactivateId) return
    setActionError('')
    try {
      await deactivate(deactivateId)
      setDeactivateId(null)
    } catch (err) {
      setActionError(parseError(err).message)
      setDeactivateId(null)
    }
  }

  async function handleReactivate(id: string) {
    setActionError('')
    try {
      await reactivate(id)
    } catch (err) {
      setActionError(parseError(err).message)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-text-primary">Categories</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Shared tree. Reactivate restores this category only — children and products stay as they are.
            </p>
          </div>
          <Button className="gap-1.5" onClick={() => { setParentForCreate(null); setCreateOpen(true) }}>
            <Plus className="h-4 w-4" /> New Category
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {actionError && (
          <div className="mb-4 rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
            <p className="text-sm text-danger">{actionError}</p>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : isError ? (
          <EmptyState icon={<Tag className="h-8 w-8" />} title="Failed to load categories" />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Tag className="h-8 w-8" />} title="No categories yet" />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden bg-surface">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0"
                style={{ paddingLeft: `${16 + row.depth * 20}px` }}
              >
                <span className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">{row.name}</span>
                <ActiveBadge isActive={row.is_active} />
                <Button size="sm" variant="ghost" onClick={() => { setParentForCreate(row.id); setCreateOpen(true) }}>
                  Add child
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(row)}>Rename</Button>
                {row.is_active ? (
                  <Button size="sm" variant="ghost" className="text-warning-foreground" onClick={() => setDeactivateId(row.id)}>
                    Deactivate
                  </Button>
                ) : (
                  <LoadingButton size="sm" variant="ghost" className="text-success-foreground" loading={reactivating} onClick={() => handleReactivate(row.id)}>
                    Reactivate
                  </LoadingButton>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <CategoryFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultParentId={parentForCreate}
      />
      <CategoryFormModal
        open={!!edit}
        onClose={() => setEdit(null)}
        category={edit}
      />
      <ConfirmDialog
        open={!!deactivateId}
        onClose={() => setDeactivateId(null)}
        onConfirm={handleDeactivate}
        title="Deactivate category?"
        message="Blocked if this category has active children or active products. Products are not cascade-deactivated."
        confirmLabel="Deactivate"
        isLoading={deactivating}
      />
    </div>
  )
}
