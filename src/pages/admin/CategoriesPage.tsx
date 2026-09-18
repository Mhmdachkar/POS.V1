import { useState } from 'react'
import { BiEmptyTitle, BiModalTitle, BiPageTitle, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { COMMON } from '@/lib/bilingual/common'
import { ADMIN } from '@/lib/bilingual/admin'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { SALES } from '@/lib/bilingual/sales'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { ChevronDown, ChevronRight, Plus, Tag } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ActiveBadge, Button, ConfirmDialog, EmptyState, LoadingButton, PageHeader, Skeleton } from '@/components/ui'
import { parseError } from '@/lib/errors'
import { formatPieces } from '@/lib/formatters'
import { resolveProductPhotoUrl } from '@/lib/productPhotos'
import {
  useAdminCategoryTree,
  useCategoryProducts,
  useDeactivateCategory,
  useReactivateCategory,
  type CategoryProductRow,
  type CategoryTreeNode,
} from '@/hooks/useAdminCategories'
import type { Category } from '@/types/database'
import { CategoryFormModal } from './components/CategoryFormModal'

export function CategoriesPage() {
  const { data: tree, isLoading, isError } = useAdminCategoryTree()
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [edit, setEdit] = useState<Category | null>(null)
  const [createParent, setCreateParent] = useState<Pick<Category, 'id' | 'name'> | null>(null)
  const [deactivateId, setDeactivateId] = useState<string | null>(null)
  const [reactivateId, setReactivateId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const { mutateAsync: deactivate, isPending: deactivating } = useDeactivateCategory()
  const { mutateAsync: reactivate, isPending: reactivating } = useReactivateCategory()

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openNewCategory() {
    setCreateParent(null)
    setCreateOpen(true)
  }

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

  async function handleReactivate() {
    if (!reactivateId) return
    setActionError('')
    try {
      await reactivate(reactivateId)
      setReactivateId(null)
    } catch (err) {
      setActionError(parseError(err).message)
      setReactivateId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title={<BiPageTitle {...ADMIN.categories} />}
        icon={<Tag className="h-5 w-5" />}
        description={
          tree?.length
            ? `${tree.length} group${tree.length === 1 ? '' : 's'}`
            : undefined
        }
        actions={
          <Button className="gap-1.5" onClick={openNewCategory}>
            <Plus className="h-4 w-4" /> New Category
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {actionError && (
          <div className="mx-4 mt-3 rounded-md border border-danger/20 bg-danger-bg px-3 py-2">
            <p className="text-sm text-danger">{actionError}</p>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-px p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : isError ? (
          <div className="p-8">
            <EmptyState icon={<Tag className="h-8 w-8" />} title={<BiEmptyTitle {...ADMIN.failedCategories} />} />
          </div>
        ) : !tree?.length ? (
          <div className="p-8">
            <EmptyState icon={<Tag className="h-8 w-8" />} title={<BiEmptyTitle {...ADMIN.noCategories} />} />
          </div>
        ) : (
          <div className="border-t border-border bg-surface">
            {tree.map((node) => (
              <CategoryBranch
                key={node.id}
                node={node}
                depth={0}
                openIds={openIds}
                onToggle={toggleOpen}
                onAddSubcategory={(n) => {
                  setCreateParent({ id: n.id, name: n.name })
                  setCreateOpen(true)
                }}
                onRename={setEdit}
                onDeactivate={setDeactivateId}
                onReactivate={setReactivateId}
                reactivating={reactivating}
              />
            ))}
          </div>
        )}
      </div>

      <CategoryFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        parent={createParent}
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
        title={<BiModalTitle {...ADMIN.deactivateCategory} />}
        message="Blocked if this category has active children or active products. Products are not cascade-deactivated."
        confirmLabel="Deactivate"
        isLoading={deactivating}
      />
      <ConfirmDialog
        open={!!reactivateId}
        onClose={() => setReactivateId(null)}
        onConfirm={handleReactivate}
        title={<BiModalTitle {...ADMIN.reactivateCategory} />}
        message={ADMIN.reactivateCategoryMessage.fr}
        confirmLabel={ADMIN.reactivate.fr}
        isLoading={reactivating}
      />
    </div>
  )
}

function CategoryBranch({
  node,
  depth,
  openIds,
  onToggle,
  onAddSubcategory,
  onRename,
  onDeactivate,
  onReactivate,
  reactivating,
}: {
  node: CategoryTreeNode
  depth: number
  openIds: Set<string>
  onToggle: (id: string) => void
  onAddSubcategory: (node: CategoryTreeNode) => void
  onRename: (node: CategoryTreeNode) => void
  onDeactivate: (id: string) => void
  onReactivate: (id: string) => void
  reactivating: boolean
}) {
  const open = openIds.has(node.id)
  const { data: products, isLoading: productsLoading } = useCategoryProducts(open ? node.id : null)

  return (
    <div className={cn(depth === 0 && 'border-b border-border')}>
      <div
        className={cn(
          'flex w-full items-center gap-2 border-b border-border/70 px-4 py-2.5 hover:bg-surface-muted',
          open && 'bg-surface-muted/60',
        )}
        style={{ paddingLeft: `${16 + depth * 20}px` }}
      >
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />
          )}
          <span className="min-w-0 truncate text-sm font-medium text-text-primary">{node.name}</span>
          {node.children.length > 0 ? (
            <span className="text-xs tabular-nums text-text-muted">{node.children.length}</span>
          ) : null}
        </button>
        <ActiveBadge isActive={node.is_active} />
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation()
            onAddSubcategory(node)
          }}
        >
          Add subcategory
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation()
            onRename(node)
          }}
        >
          Rename
        </Button>
        {node.is_active ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-warning-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onDeactivate(node.id)
            }}
          >
            Deactivate
          </Button>
        ) : (
          <LoadingButton
            size="sm"
            variant="ghost"
            className="text-success-foreground"
            loading={reactivating}
            onClick={(e) => {
              e.stopPropagation()
              onReactivate(node.id)
            }}
          >
            {ADMIN.reactivate.fr}
          </LoadingButton>
        )}
      </div>

      {open ? (
        <div className="bg-surface-muted/40">
          {node.children.map((child) => (
            <CategoryBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              openIds={openIds}
              onToggle={onToggle}
              onAddSubcategory={onAddSubcategory}
              onRename={onRename}
              onDeactivate={onDeactivate}
              onReactivate={onReactivate}
              reactivating={reactivating}
            />
          ))}
          <ProductList
            depth={depth}
            products={products ?? []}
            loading={productsLoading}
            emptyLabel={node.children.length === 0 ? ADMIN.noSubcategoriesOrProducts.fr : ADMIN.noProductsInCategory.fr}
          />
        </div>
      ) : null}
    </div>
  )
}

function ProductList({
  depth,
  products,
  loading,
  emptyLabel,
}: {
  depth: number
  products: CategoryProductRow[]
  loading: boolean
  emptyLabel: string
}) {
  const pad = `${36 + depth * 20}px`

  if (loading) {
    return (
      <div className="space-y-1 py-2" style={{ paddingLeft: pad, paddingRight: 16 }}>
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <p className="py-2 text-sm text-text-muted" style={{ paddingLeft: pad, paddingRight: 16 }}>
        {emptyLabel}
      </p>
    )
  }

  return (
    <div>
      {products.map((product) => {
        const thumb = resolveProductPhotoUrl(product.photo_url, product.name)
        return (
          <div
            key={product.id}
            className="flex items-center gap-3 border-b border-border/50 py-2"
            style={{ paddingLeft: pad, paddingRight: 16 }}
          >
            {thumb ? (
              <img src={thumb} alt="" className="h-7 w-7 rounded bg-surface object-contain p-0.5" />
            ) : (
              <span className="h-7 w-7 rounded bg-surface" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{product.name}</span>
            {product.depot_name ? (
              <span className="max-w-[8rem] truncate text-xs text-text-muted">{product.depot_name}</span>
            ) : null}
            <span className="text-xs tabular-nums text-text-secondary">
              {formatPieces(product.current_stock_pieces)}
            </span>
            <ActiveBadge isActive={product.is_active} />
          </div>
        )
      })}
    </div>
  )
}
