/**
 * Phase 13C — Product discovery: ProductCard, UnitPickerPopover, CategoryRail, ProductGrid.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductCard } from '@/components/pos/ProductCard'
import { UnitPickerPopover } from '@/components/pos/UnitPickerPopover'
import { CategoryRail } from '@/components/pos/CategoryRail'
import { ProductGrid } from '@/components/pos/ProductGrid'
import { useProductSearch } from '@/hooks/useProducts'
import { usePOSStore } from '@/stores/posStore'
import type { ProductWithUnits } from '@/types'
import type { ProductUnit } from '@/types/database'
import { COMMON } from '@/lib/bilingual/common'
import { POS } from '@/lib/bilingual/pos'
import { bilingualAriaLabel, getByBilingualRole } from '../helpers/bilingualQueries'

vi.mock('@/hooks/useProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useProducts')>()
  return {
    ...actual,
    useProductSearch: vi.fn(),
  }
})

function makeUnit(overrides: Partial<ProductUnit> = {}): ProductUnit {
  return {
    id: 'unit-0',
    product_id: 'prod-water',
    unit_level: 0,
    unit_name: 'Piece',
    conversion_to_base: 1,
    cost_price_cfa: 200,
    selling_price_cfa: 350,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<ProductWithUnits> = {}): ProductWithUnits {
  return {
    id: 'prod-water',
    depot_id: 'depot-a',
    category_id: 'cat-bev',
    name: 'Water',
    photo_url: '/products/mineral-water.jpg',
    current_stock_pieces: 50,
    track_low_stock: false,
    low_stock_threshold: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    units: [makeUnit()],
    ...overrides,
  }
}

function packUnit(): ProductUnit {
  return makeUnit({
    id: 'unit-1',
    unit_level: 1,
    unit_name: 'Pack',
    conversion_to_base: 6,
    cost_price_cfa: 1000,
    selling_price_cfa: 1800,
  })
}

beforeEach(() => {
  usePOSStore.getState().startNewSale()
  vi.mocked(useProductSearch).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  } as never)
})

describe('ProductCard', () => {
  it('adds the first unit with qty 1 on single-unit click', async () => {
    const user = userEvent.setup()
    const onAddItem = vi.fn()
    const product = makeProduct()
    render(<ProductCard product={product} onAddItem={onAddItem} />)

    await user.click(screen.getByRole('button', { name: 'Water' }))
    expect(onAddItem).toHaveBeenCalledTimes(1)
    expect(onAddItem).toHaveBeenCalledWith(product, product.units[0], 1)
  })

  it('opens the unit picker for multi-unit products', async () => {
    const user = userEvent.setup()
    const onAddItem = vi.fn()
    const product = makeProduct({ units: [makeUnit(), packUnit()] })
    render(<ProductCard product={product} onAddItem={onAddItem} />)

    await user.click(screen.getByRole('button', { name: 'Water' }))
    expect(onAddItem).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', { name: bilingualAriaLabel(POS.selectUnitAria('Water')) }),
    ).toBeInTheDocument()
  })

  it('does not add an out-of-stock product', async () => {
    const user = userEvent.setup()
    const onAddItem = vi.fn()
    render(
      <ProductCard
        product={makeProduct({ current_stock_pieces: 0 })}
        onAddItem={onAddItem}
      />,
    )

    expect(screen.getByRole('button', { name: 'Water' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Water' }))
    expect(onAddItem).not.toHaveBeenCalled()
    expect(screen.getByText(POS.outOfStock.fr)).toBeInTheDocument()
  })

  it('does not add when cart already at available stock', async () => {
    const user = userEvent.setup()
    const onAddItem = vi.fn()
    usePOSStore.getState().addItem({
      product_id: 'prod-water',
      product_name: 'Water',
      product_photo_url: '',
      unit_level: 0,
      unit_name: 'Piece',
      quantity_in_unit: 10,
      unit_price_cfa: 350,
      cost_price_cfa: 200,
      conversion_to_base: 1,
    })
    render(
      <ProductCard
        product={makeProduct({ current_stock_pieces: 10 })}
        onAddItem={onAddItem}
      />,
    )
    expect(screen.getByText(POS.atMax.fr)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Water' }))
    expect(onAddItem).not.toHaveBeenCalled()
  })

  it('still allows selling when low-stock threshold equals stock', async () => {
    const user = userEvent.setup()
    const onAddItem = vi.fn()
    render(
      <ProductCard
        product={makeProduct({
          current_stock_pieces: 10,
          track_low_stock: true,
          low_stock_threshold: 10,
        })}
        onAddItem={onAddItem}
      />,
    )
    expect(screen.getByText(POS.lowBadge.fr)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Water' }))
    expect(onAddItem).toHaveBeenCalledTimes(1)
  })

  it('shows ×N for a single cart line', () => {
    usePOSStore.getState().addItem({
      product_id: 'prod-water',
      product_name: 'Water',
      product_photo_url: '',
      unit_level: 0,
      unit_name: 'Piece',
      quantity_in_unit: 3,
      unit_price_cfa: 350,
      cost_price_cfa: 200,
      conversion_to_base: 1,
    })
    render(<ProductCard product={makeProduct()} onAddItem={vi.fn()} />)
    expect(screen.getByText('×3')).toBeInTheDocument()
    expect(screen.queryByText('In cart')).not.toBeInTheDocument()
  })

  it('shows In cart for mixed units and never sums quantities', () => {
    usePOSStore.getState().addItem({
      product_id: 'prod-water',
      product_name: 'Water',
      product_photo_url: '',
      unit_level: 0,
      unit_name: 'Piece',
      quantity_in_unit: 3,
      unit_price_cfa: 350,
      cost_price_cfa: 200,
      conversion_to_base: 1,
    })
    usePOSStore.getState().addItem({
      product_id: 'prod-water',
      product_name: 'Water',
      product_photo_url: '',
      unit_level: 1,
      unit_name: 'Pack',
      quantity_in_unit: 2,
      unit_price_cfa: 1800,
      cost_price_cfa: 1000,
      conversion_to_base: 6,
    })
    render(
      <ProductCard
        product={makeProduct({ units: [makeUnit(), packUnit()] })}
        onAddItem={vi.fn()}
      />,
    )
    expect(screen.getByText(POS.inCartBadge.fr)).toBeInTheDocument()
    expect(screen.queryByText('×5')).not.toBeInTheDocument()
    expect(screen.queryByText('×3')).not.toBeInTheDocument()
  })
})

describe('UnitPickerPopover', () => {
  it('shows unit names and prices and passes the selected unit', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const units = [makeUnit(), packUnit()]
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    render(
      <UnitPickerPopover
        open
        productName="Water"
        units={units}
        anchorEl={anchor}
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    )

    expect(
      screen.getByRole('dialog', { name: bilingualAriaLabel(POS.selectUnitAria('Water')) }),
    ).toBeInTheDocument()
    expect(screen.getByText('Piece')).toBeInTheDocument()
    expect(screen.getByText('Pack')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Piece/ })).toHaveTextContent('CFA 350')
    expect(screen.getByRole('button', { name: /Pack/ }).textContent).toContain('1')
    expect(screen.getByRole('button', { name: /Pack/ }).textContent).toContain('800')

    await user.click(screen.getByRole('button', { name: /Pack/ }))
    expect(onSelect).toHaveBeenCalledWith(units[1])
  })
})

describe('CategoryRail', () => {
  const categories = [
    { id: 'cat-bev', name: 'Beverages' },
    { id: 'cat-food', name: 'Food' },
  ]

  it('renders All first and selected by default', () => {
    render(<CategoryRail activeId={null} onSelect={vi.fn()} categories={categories} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveTextContent(COMMON.allCategoriesTab.fr)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('emits the category id when a pill is selected', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<CategoryRail activeId={null} onSelect={onSelect} categories={categories} />)
    await user.click(screen.getByRole('tab', { name: 'Beverages' }))
    expect(onSelect).toHaveBeenCalledWith('cat-bev')
  })

  it('emits null when All is selected', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<CategoryRail activeId="cat-bev" onSelect={onSelect} categories={categories} />)
    await user.click(screen.getByRole('tab', { name: /All|Tous/i }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})

describe('ProductGrid', () => {
  const gridProps = {
    depotId: 'depot-a',
    query: '',
    categoryId: null as string | null,
    onAddItem: vi.fn(),
    onClearCategory: vi.fn(),
  }

  it('renders products with valid photos only', () => {
    vi.mocked(useProductSearch).mockReturnValue({
      data: [
        makeProduct(),
        makeProduct({ id: 'prod-soda', name: 'Soda', photo_url: 'https://cdn.example.com/soda.jpg' }),
        makeProduct({ id: 'prod-bad', name: 'No Photo', photo_url: 'https://placehold.co/1' }),
      ],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as never)
    render(<ProductGrid {...gridProps} />)
    expect(screen.getByRole('button', { name: 'Water' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Soda' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'No Photo' })).not.toBeInTheDocument()
  })

  it('shows loading skeletons', () => {
    vi.mocked(useProductSearch).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: true,
      refetch: vi.fn(),
    } as never)
    render(<ProductGrid {...gridProps} />)
    expect(screen.getByTestId('product-grid-loading')).toBeInTheDocument()
  })

  it('does not replace cached products with a skeleton while refetching', () => {
    vi.mocked(useProductSearch).mockReturnValue({
      data: [makeProduct()],
      isLoading: false,
      isError: false,
      isFetching: true,
      refetch: vi.fn(),
    } as never)
    render(<ProductGrid {...gridProps} />)
    expect(screen.queryByTestId('product-grid-loading')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Water' })).toBeInTheDocument()
  })

  it('keeps cached products visible when a refresh errors', async () => {
    const refetch = vi.fn()
    vi.mocked(useProductSearch).mockReturnValue({
      data: [makeProduct()],
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    } as never)
    render(<ProductGrid {...gridProps} />)
    expect(screen.getByRole('button', { name: 'Water' })).toBeInTheDocument()
    expect(screen.getByTestId('catalog-refresh-error')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /Réessayer|Retry/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows empty state', () => {
    render(<ProductGrid {...gridProps} />)
    expect(screen.getByText(POS.noActiveProducts.fr)).toBeInTheDocument()
  })

  it('offers Show all when a category has no products', async () => {
    const user = userEvent.setup()
    const onClearCategory = vi.fn()
    render(
      <ProductGrid
        {...gridProps}
        categoryId="cat-bev"
        categoryName="Beverages"
        onClearCategory={onClearCategory}
      />,
    )
    expect(screen.getByText(POS.noProductsInCategory('Beverages').fr)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Tout afficher|Show all/i }))
    expect(onClearCategory).toHaveBeenCalledTimes(1)
  })

  it('shows empty state when every product lacks a valid photo', () => {
    vi.mocked(useProductSearch).mockReturnValue({
      data: [makeProduct({ photo_url: 'https://placehold.co/x' })],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as never)
    render(<ProductGrid {...gridProps} />)
    expect(screen.getByText(POS.noProductsWithPhotos.fr)).toBeInTheDocument()
  })

  it('shows the 40-result informational note', () => {
    const products = Array.from({ length: 40 }, (_, i) =>
      makeProduct({ id: `prod-${i}`, name: `Product ${i}`, photo_url: `/products/p-${i}.jpg` }),
    )
    vi.mocked(useProductSearch).mockReturnValue({
      data: products,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as never)
    render(<ProductGrid {...gridProps} />)
    expect(
      screen.getByText(POS.showing40Results.fr),
    ).toBeInTheDocument()
  })
})
