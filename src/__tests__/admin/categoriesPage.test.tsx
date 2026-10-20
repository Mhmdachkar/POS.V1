import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CategoriesPage } from '@/pages/admin/CategoriesPage'
import { ADMIN } from '@/lib/bilingual/admin'
import { buildCategoryTree, findCategoryPath } from '@/hooks/useAdminCategories'

const rows = [
  { id: 'root', parent_id: null, name: 'Drinks', is_active: true, created_at: '2026-09-01T00:00:00Z' },
  { id: 'child', parent_id: 'root', name: 'Soda', is_active: false, created_at: '2026-09-01T00:00:00Z' },
]

vi.mock('@/hooks/useAdminCategories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAdminCategories')>()
  return {
    ...actual,
    useAdminCategoryTree: vi.fn(() => ({
      data: actual.buildCategoryTree(rows),
      isLoading: false,
      isError: false,
    })),
    useAdminCategoryList: vi.fn(() => ({ data: rows, isLoading: false })),
    useCreateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useUpdateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useDeactivateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useReactivateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useCategoryProducts: vi.fn((id: string | null) => ({
      data:
        id === 'root'
          ? [
              {
                id: 'prod-cola',
                name: 'Cola Can',
                photo_url: 'https://cdn.example.com/cola.jpg',
                is_active: true,
                current_stock_pieces: 12,
                depot_id: 'depot-a',
                depot_name: 'Depot Dakar',
              },
            ]
          : [],
      isLoading: false,
    })),
  }
})

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('CategoriesPage accordion', () => {
  it('shows full-width top-level categories and hides contents until opened', () => {
    wrap(<CategoriesPage />)
    expect(screen.getByRole('button', { name: /Drinks/ })).toBeInTheDocument()
    expect(screen.queryByText('Soda')).not.toBeInTheDocument()
    expect(screen.queryByText('Cola Can')).not.toBeInTheDocument()
    expect(screen.queryByText('Select a category.')).not.toBeInTheDocument()
  })

  it('expands subcategories and products under the clicked category', async () => {
    const user = userEvent.setup()
    wrap(<CategoriesPage />)
    await user.click(screen.getByRole('button', { name: /Drinks/ }))
    expect(screen.getByText('Soda')).toBeInTheDocument()
    expect(screen.getByText('Cola Can')).toBeInTheDocument()
    expect(screen.getByText('Depot Dakar')).toBeInTheDocument()
    expect(screen.queryByText('Add child')).not.toBeInTheDocument()
  })

  it('creates a top-level category without asking for a parent', async () => {
    const user = userEvent.setup()
    wrap(<CategoriesPage />)
    await user.click(screen.getByRole('button', { name: ADMIN.newCategory.fr }))
    expect(screen.getByRole('heading', { name: /nouvelle catégorie|new category/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('Parent')).not.toBeInTheDocument()
    expect(screen.queryByText('Root category')).not.toBeInTheDocument()
  })

  it('places a new subcategory under the opened category', async () => {
    const user = userEvent.setup()
    wrap(<CategoriesPage />)
    await user.click(screen.getAllByRole('button', { name: 'Add subcategory' })[0])
    expect(screen.getByRole('heading', { name: /nouvelle sous-catégorie|new subcategory/i })).toBeInTheDocument()
    expect(screen.getAllByText(/Sous Drinks|Under Drinks/i).length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Parent')).not.toBeInTheDocument()
  })
})

describe('category tree helpers', () => {
  it('keeps children attached to their parent and finds a path', () => {
    const tree = buildCategoryTree(rows)
    expect(tree).toHaveLength(1)
    expect(tree[0].children.map((c) => c.name)).toEqual(['Soda'])
    expect(findCategoryPath(tree, 'child')?.map((n) => n.name)).toEqual(['Drinks', 'Soda'])
  })
})
