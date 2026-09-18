import { useMemo } from 'react'
import {
  buildCategoryTree,
  findCategoryPath,
  type CategoryTreeNode,
} from '@/hooks/useAdminCategories'
import type { Category } from '@/types/database'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { BiTableHeader } from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { bilingualPlain } from '@/lib/bilingual/types'
import type { BilingualPair } from '@/lib/bilingual/types'

export interface CategoryPathPickerProps {
  categories: Category[]
  value: string
  onChange: (categoryId: string) => void
  disabled?: boolean
}

function nodeAtPath(roots: CategoryTreeNode[], pathIds: string[]): CategoryTreeNode | null {
  let nodes = roots
  let current: CategoryTreeNode | null = null
  for (const id of pathIds) {
    current = nodes.find((n) => n.id === id) ?? null
    if (!current) return null
    nodes = current.children
  }
  return current
}

function optionsAtLevel(roots: CategoryTreeNode[], pathIds: string[], level: number): CategoryTreeNode[] {
  if (level === 0) return roots
  const parent = nodeAtPath(roots, pathIds.slice(0, level))
  return parent?.children ?? []
}

function levelLabel(level: number): BilingualPair {
  if (level === 0) return INVENTORY.categoryLevel
  if (level === 1) return INVENTORY.subcategoryLevel
  return INVENTORY.subcategoryLevelN(level)
}

/**
 * Step-through category picker: choose a group, then a subcategory, then deeper
 * levels until the product lands on the intended category.
 */
export function CategoryPathPicker({
  categories,
  value,
  onChange,
  disabled = false,
}: CategoryPathPickerProps) {
  const tree = useMemo(() => buildCategoryTree(categories), [categories])
  const pathIds = useMemo(() => {
    if (!value) return [] as string[]
    const path = findCategoryPath(tree, value)
    return path ? path.map((n) => n.id) : []
  }, [tree, value])

  const levels: Array<{ level: number; options: CategoryTreeNode[]; selectedId: string }> = []
  for (let level = 0; ; level += 1) {
    const options = optionsAtLevel(tree, pathIds, level)
    if (level > 0 && options.length === 0) break
    const selectedId = pathIds[level] ?? ''
    levels.push({ level, options, selectedId })
    if (!selectedId) break
    const selected = options.find((o) => o.id === selectedId)
    if (!selected || selected.children.length === 0) break
    // Keep looping so the next empty subcategory select appears.
  }

  function handleLevelChange(level: number, nextId: string) {
    if (!nextId) {
      const truncated = pathIds.slice(0, level)
      onChange(truncated[truncated.length - 1] ?? '')
      return
    }
    const nextPath = [...pathIds.slice(0, level), nextId]
    onChange(nextPath[nextPath.length - 1] ?? '')
  }

  if (tree.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        <BilingualText {...INVENTORY.noCategoriesHint} variant="caption" />
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {levels.map(({ level, options, selectedId }) => (
        <div key={level}>
          <label
            htmlFor={`category-path-${level}`}
            className="mb-1.5 block uppercase tracking-wide"
          >
            <BiTableHeader {...levelLabel(level)} />
          </label>
          <select
            id={`category-path-${level}`}
            value={selectedId}
            disabled={disabled || options.length === 0}
            required={level === 0}
            onChange={(e) => handleLevelChange(level, e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
          >
            <option value="">
              {level === 0
                ? bilingualPlain(INVENTORY.selectCategory)
                : bilingualPlain(INVENTORY.selectSubcategoryOptional)}
            </option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
