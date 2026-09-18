import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryPathPicker } from '@/pages/inventory/components/CategoryPathPicker'
import type { Category } from '@/types/database'

const categories: Category[] = [
  { id: 'bev', parent_id: null, name: 'Beverages', is_active: true, created_at: '2026-01-01T00:00:00Z' },
  { id: 'soft', parent_id: 'bev', name: 'Soft Drinks', is_active: true, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cola', parent_id: 'soft', name: 'Cola', is_active: true, created_at: '2026-01-01T00:00:00Z' },
  { id: 'food', parent_id: null, name: 'Food', is_active: true, created_at: '2026-01-01T00:00:00Z' },
]

const categoryLabel = /catégorie|category/i
const subcategoryLabel = /sous-catégorie|subcategory/i

describe('CategoryPathPicker', () => {
  it('reveals the next level after each choice until the leaf', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <CategoryPathPicker categories={categories} value="" onChange={onChange} />,
    )

    expect(screen.getByLabelText(categoryLabel)).toBeInTheDocument()
    expect(screen.queryByLabelText(subcategoryLabel)).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(categoryLabel), 'bev')
    expect(onChange).toHaveBeenLastCalledWith('bev')

    rerender(<CategoryPathPicker categories={categories} value="bev" onChange={onChange} />)
    expect(screen.getByLabelText(subcategoryLabel)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(subcategoryLabel), 'soft')
    expect(onChange).toHaveBeenLastCalledWith('soft')

    rerender(<CategoryPathPicker categories={categories} value="soft" onChange={onChange} />)
    expect(screen.getByLabelText(/sous-catégorie 2|subcategory 2/i)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/sous-catégorie 2|subcategory 2/i), 'cola')
    expect(onChange).toHaveBeenLastCalledWith('cola')

    rerender(<CategoryPathPicker categories={categories} value="cola" onChange={onChange} />)
    expect(screen.queryByLabelText(/sous-catégorie 3|subcategory 3/i)).not.toBeInTheDocument()
  })

  it('restores the full path when editing an existing product category', () => {
    render(
      <CategoryPathPicker categories={categories} value="cola" onChange={() => undefined} />,
    )
    expect(screen.getAllByLabelText(categoryLabel)[0]).toHaveValue('bev')
    expect(screen.getAllByLabelText(subcategoryLabel)[0]).toHaveValue('soft')
    expect(screen.getByLabelText(/sous-catégorie 2|subcategory 2/i)).toHaveValue('cola')
  })
})
