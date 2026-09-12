import { Tag } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * CategoriesPage — Phase 11 implementation target.
 *
 * Will contain:
 * - Category tree (hierarchical, unlimited nesting)
 * - Create category (name unique case-insensitively per parent — DB enforced)
 * - Edit category name
 * - Deactivate category
 *
 * Categories are shared across all depots.
 * Root categories must have globally unique names.
 * Child categories must have names unique within their parent.
 */
export function CategoriesPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<Tag className="h-8 w-8" />}
        title="Categories — Coming in Phase 11"
        description="Shared category tree management will be implemented in Phase 11."
      />
    </div>
  )
}
