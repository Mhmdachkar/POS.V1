/**
 * Phase 13C — Cart panel, cart item, and unit-change UI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartPanel } from '@/components/pos/CartPanel'
import { CartItem } from '@/components/pos/CartItem'
import { useProductDetail } from '@/hooks/useProducts'
import { usePOSStore } from '@/stores/posStore'
import type { CartItem as CartItemType, ProductWithUnits } from '@/types'
import type { ProductUnit } from '@/types/database'
import { POS } from '@/lib/bilingual/pos'
import { bilingualAriaLabel, getByBilingualRole } from '../helpers/bilingualQueries'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

function removeButtons(product = 'Water') {
  return screen.getAllByRole('button', { name: bilingualAriaLabel(POS.removeFromCartAria(product)) })
}

vi.mock('@/hooks/useProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useProducts')>()
  return {
    ...actual,
    useProductDetail: vi.fn(),
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

function waterProduct(): ProductWithUnits {
  return {
    id: 'prod-water',
    depot_id: 'depot-a',
    category_id: 'cat-bev',
    name: 'Water',
    photo_url: '',
    current_stock_pieces: 50,
    track_low_stock: false,
    low_stock_threshold: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    units: [
      makeUnit(),
      makeUnit({
        id: 'unit-1',
        unit_level: 1,
        unit_name: 'Pack',
        conversion_to_base: 6,
        cost_price_cfa: 1000,
        selling_price_cfa: 1800,
      }),
    ],
  }
}

function cartLine(overrides: Partial<CartItemType> = {}): CartItemType {
  return {
    product_id: 'prod-water',
    product_name: 'Water',
    product_photo_url: '',
    unit_level: 0,
    unit_name: 'Piece',
    quantity_in_unit: 2,
    unit_price_cfa: 350,
    cost_price_cfa: 200,
    conversion_to_base: 1,
    line_total_cfa: 700,
    ...overrides,
  }
}

function addLine(overrides: Partial<Omit<CartItemType, 'line_total_cfa'>> = {}) {
  usePOSStore.getState().addItem({
    product_id: 'prod-water',
    product_name: 'Water',
    product_photo_url: '',
    unit_level: 0,
    unit_name: 'Piece',
    quantity_in_unit: 1,
    unit_price_cfa: 350,
    cost_price_cfa: 200,
    conversion_to_base: 1,
    ...overrides,
  })
}

const originalActions = {
  addItem: usePOSStore.getState().addItem,
  removeItem: usePOSStore.getState().removeItem,
  updateQuantity: usePOSStore.getState().updateQuantity,
  changeUnit: usePOSStore.getState().changeUnit,
  clearCart: usePOSStore.getState().clearCart,
}

beforeEach(() => {
  usePOSStore.setState(originalActions)
  usePOSStore.getState().startNewSale()
  vi.mocked(useProductDetail).mockReturnValue({
    data: waterProduct(),
    isLoading: false,
  } as never)
})

describe('CartItem', () => {
  it('increments quantity through updateQuantity', async () => {
    const user = userEvent.setup()
    addLine({ quantity_in_unit: 2 })
    const item = usePOSStore.getState().items[0]
    render(<CartItem item={item} />)

    await user.click(getByBilingualRole('button', POS.increaseQtyAria('Water')))
    expect(usePOSStore.getState().items[0].quantity_in_unit).toBe(3)
  })

  it('decrements quantity through updateQuantity', async () => {
    const user = userEvent.setup()
    addLine({ quantity_in_unit: 2 })
    const item = usePOSStore.getState().items[0]
    render(<CartItem item={item} />)

    await user.click(getByBilingualRole('button', POS.decreaseQtyAria('Water')))
    expect(usePOSStore.getState().items[0].quantity_in_unit).toBe(1)
  })

  it('removes the line', async () => {
    const user = userEvent.setup()
    addLine()
    const item = usePOSStore.getState().items[0]
    render(<CartItem item={item} />)

    await user.click(removeButtons()[0])
    expect(usePOSStore.getState().items).toHaveLength(0)
  })

  it('calls changeUnit only when the unit select changes', async () => {
    const user = userEvent.setup()
    addLine({ quantity_in_unit: 3 })
    const changeUnit = vi.fn()
    const addItem = vi.fn()
    const removeItem = vi.fn()
    usePOSStore.setState({ changeUnit, addItem, removeItem })

    render(<CartItem item={cartLine({ quantity_in_unit: 3, line_total_cfa: 1050 })} />)

    await user.selectOptions(
      screen.getByLabelText(bilingualAriaLabel(POS.changeUnitAria('Water'))),
      '1',
    )
    expect(changeUnit).toHaveBeenCalledTimes(1)
    expect(changeUnit).toHaveBeenCalledWith('prod-water', 0, {
      unit_level: 1,
      unit_name: 'Pack',
      unit_price_cfa: 1800,
      cost_price_cfa: 1000,
      conversion_to_base: 6,
    })
    expect(addItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })
})

describe('CartPanel', () => {
  it('shows the empty state', () => {
    render(<CartPanel />)
    expect(screen.getByText(POS.emptyCartTitle.fr)).toBeInTheDocument()
    expect(screen.getByText(POS.emptyCartHint.fr)).toBeInTheDocument()
  })

  it('flexes the empty cart body so checkout can anchor at the bottom', () => {
    const { container } = render(<CartPanel className="flex-1 min-h-0 overflow-hidden" />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveClass('flex', 'flex-col', 'min-h-0', 'flex-1')

    const itemsRegion = screen.getByTestId('cart-items')
    expect(itemsRegion).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto')
    expect(screen.getByText(POS.emptyCartTitle.fr)).toBeInTheDocument()
  })

  it('shows the header line count', () => {
    addLine()
    addLine({ product_id: 'prod-soda', product_name: 'Soda', unit_level: 0 })
    render(<CartPanel />)
    expect(screen.getByText(POS.cartLines(2).fr)).toBeInTheDocument()
  })

  it('clears immediately when there is one line', async () => {
    const user = userEvent.setup()
    addLine()
    render(<CartPanel />)
    await user.click(screen.getByRole('button', { name: new RegExp(POS.clearCart.fr, 'i') }))
    expect(usePOSStore.getState().items).toHaveLength(0)
    expect(
      screen.queryByRole('heading', { name: bilingualAriaLabel(POS.clearCartConfirmTitle) }),
    ).not.toBeInTheDocument()
  })

  it('asks for confirmation when clearing 2+ lines', async () => {
    const user = userEvent.setup()
    addLine()
    addLine({ product_id: 'prod-soda', product_name: 'Soda', unit_level: 0 })
    render(<CartPanel />)

    await user.click(screen.getByRole('button', { name: new RegExp(POS.clearCart.fr, 'i') }))
    expect(screen.getAllByText(/Vider le panier \?|Clear cart\?/i).length).toBeGreaterThan(0)
    expect(usePOSStore.getState().items).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /Clear cart|Vider le panier/i }))
    expect(usePOSStore.getState().items).toHaveLength(0)
  })

  it('flexes the cart body for one line so checkout can stay bottom-anchored', () => {
    addLine({ quantity_in_unit: 6 })
    const { container } = render(<CartPanel className="flex-1 min-h-0 overflow-hidden" />)

    expect(screen.getByText('Water')).toBeInTheDocument()
    expect(screen.getByText(POS.cartLines(1).fr)).toBeInTheDocument()
    expect(screen.queryByText(POS.subtotal.fr)).not.toBeInTheDocument()

    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveClass('flex-1', 'min-h-0')

    const itemsRegion = screen.getByTestId('cart-items')
    expect(itemsRegion).toHaveClass('flex-1', 'overflow-y-auto', 'min-h-0')
  })

  it('keeps multiple lines scrollable inside a flex cart body', () => {
    addLine({ product_name: 'Rice', product_id: 'prod-rice', quantity_in_unit: 6 })
    addLine({ product_name: 'Water', product_id: 'prod-water', quantity_in_unit: 2 })
    addLine({ product_name: 'Cola', product_id: 'prod-cola', quantity_in_unit: 3 })
    addLine({ product_name: 'Eggs', product_id: 'prod-eggs', quantity_in_unit: 1 })
    addLine({ product_name: 'Bread', product_id: 'prod-bread', quantity_in_unit: 2 })
    const { container } = render(<CartPanel className="flex-1 min-h-0 overflow-hidden" />)

    expect(screen.getByText(POS.cartLines(5).fr)).toBeInTheDocument()
    expect(screen.getByText('Rice')).toBeInTheDocument()
    expect(screen.getByText('Bread')).toBeInTheDocument()

    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveClass('flex-1')
    const itemsRegion = screen.getByTestId('cart-items')
    expect(itemsRegion).toHaveClass('flex-1', 'overflow-y-auto', 'min-h-0')
  })

  it('renders multiple cart lines with checkout subtotal still present', () => {
    addLine({ product_name: 'Rice', product_id: 'prod-rice', quantity_in_unit: 6 })
    addLine({ product_name: 'Water', product_id: 'prod-water', quantity_in_unit: 2 })
    addLine({ product_name: 'Cola', product_id: 'prod-cola', quantity_in_unit: 3 })
    render(<CartPanel />)

    expect(screen.getByText(POS.cartLines(3).fr)).toBeInTheDocument()
    expect(screen.getByText('Rice')).toBeInTheDocument()
    expect(screen.getByText('Water')).toBeInTheDocument()
    expect(screen.getByText('Cola')).toBeInTheDocument()
    expect(screen.queryByText(POS.subtotal.fr)).not.toBeInTheDocument()
  })

  it('does not grow the cart row when quantity increases', () => {
    addLine({ quantity_in_unit: 1 })
    const { rerender } = render(<CartItem item={usePOSStore.getState().items[0]} />)
    const rowAtOne = screen.getByText('Water').closest('[class*="min-h-[52px]"]') as HTMLElement
    expect(rowAtOne).toBeTruthy()
    expect(rowAtOne).toHaveClass('sm:min-h-[52px]')
    expect(rowAtOne.className).not.toMatch(/\bflex-1\b/)

    usePOSStore.getState().updateQuantity('prod-water', 0, 6)
    rerender(<CartItem item={usePOSStore.getState().items[0]} />)
    const rowAtSix = screen.getByText('Water').closest('[class*="min-h-[52px]"]') as HTMLElement
    expect(rowAtSix.className).toBe(rowAtOne.className)
    expect(screen.getByDisplayValue('6')).toBeInTheDocument()
  })

  it('uses 36px quantity and remove targets', () => {
    addLine()
    render(<CartItem item={usePOSStore.getState().items[0]} />)
    expect(getByBilingualRole('button', POS.increaseQtyAria('Water'))).toHaveClass('sm:h-9', 'sm:w-9')
    expect(getByBilingualRole('button', POS.decreaseQtyAria('Water'))).toHaveClass('sm:h-9', 'sm:w-9')
    for (const btn of removeButtons()) {
      expect(btn).toHaveClass('h-9', 'w-9')
    }
    expect(screen.getByLabelText(bilingualAriaLabel(POS.qtyAria('Water')))).toHaveClass('sm:h-9')
  })

  it('disables + at stock max; - and remove still work', async () => {
    const user = userEvent.setup()
    vi.mocked(useProductDetail).mockReturnValue({
      data: { ...waterProduct(), current_stock_pieces: 10 },
      isLoading: false,
    } as never)
    addLine({ quantity_in_unit: 10 })
    const { rerender } = render(<CartItem item={usePOSStore.getState().items[0]} />)

    const plus = getByBilingualRole('button', POS.increaseQtyAria('Water'))
    expect(plus).toBeDisabled()
    await user.click(plus)
    expect(usePOSStore.getState().items[0].quantity_in_unit).toBe(10)

    await user.click(getByBilingualRole('button', POS.decreaseQtyAria('Water')))
    rerender(<CartItem item={usePOSStore.getState().items[0]} />)
    expect(usePOSStore.getState().items[0].quantity_in_unit).toBe(9)
    expect(getByBilingualRole('button', POS.increaseQtyAria('Water'))).toBeEnabled()

    await user.click(removeButtons()[0])
    expect(usePOSStore.getState().items).toHaveLength(0)
  })

  it('clamps manual quantity input to available stock and toasts remaining', () => {
    vi.mocked(toast.error).mockClear()
    vi.mocked(useProductDetail).mockReturnValue({
      data: { ...waterProduct(), current_stock_pieces: 10 },
      isLoading: false,
    } as never)
    addLine({ quantity_in_unit: 5 })
    render(<CartItem item={usePOSStore.getState().items[0]} />)

    const input = screen.getByLabelText(bilingualAriaLabel(POS.qtyAria('Water')))
    fireEvent.change(input, { target: { value: '15' } })
    expect(usePOSStore.getState().items[0].quantity_in_unit).toBe(10)
    expect(toast.error).toHaveBeenCalled()
  })
})
