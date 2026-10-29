/**
 * CEO Notes — Per-unit profit / margin in ProductDetailDrawer.
 * Formula is inline: profit = selling − cost;
 * margin = (profit/selling*100).toFixed(2) when selling > 0, else —.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductDetailDrawer } from '@/pages/inventory/components/ProductDetailDrawer'
import { useProductDetail } from '@/hooks/useProducts'
import { formatCFA } from '@/lib/formatters'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { useAuthStore } from '@/stores/authStore'
import type { ProductWithUnits } from '@/types'
import { getByFrench } from '../helpers/bilingualQueries'

vi.mock('@/hooks/useProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useProducts')>()
  return {
    ...actual,
    useProductDetail: vi.fn(),
  }
})

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useInventoryActivity: vi.fn(() => ({ data: [], isLoading: false })),
    useCategories: vi.fn(() => ({ data: [], isLoading: false })),
    useDepotOptions: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/hooks/useAdminProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAdminProducts')>()
  return {
    ...actual,
    useDeactivateProduct: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useReactivateProduct: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }
})

vi.mock('@/pages/inventory/components/ProductFormModal', () => ({
  ProductFormModal: () => null,
}))

vi.mock('@/pages/inventory/components/RestockModal', () => ({
  RestockModal: () => null,
}))

vi.mock('@/pages/inventory/components/AdjustmentModal', () => ({
  AdjustmentModal: () => null,
}))

function productWithUnits(
  units: Array<{
    unit_name: string
    cost_price_cfa: number
    selling_price_cfa: number
    conversion_to_base?: number
    unit_level?: 0 | 1 | 2
  }>,
): ProductWithUnits {
  return {
    id: 'prod-1',
    depot_id: 'depot-a',
    category_id: 'cat-1',
    name: 'Test Product',
    photo_url: 'https://cdn.example.com/p.jpg',
    current_stock_pieces: 100,
    track_low_stock: false,
    low_stock_threshold: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    units: units.map((u, i) => ({
      id: `u-${i}`,
      product_id: 'prod-1',
      unit_level: u.unit_level ?? (i as 0 | 1 | 2),
      unit_name: u.unit_name,
      serial_number: `SN-${i}`,
      conversion_to_base: u.conversion_to_base ?? 1,
      relative_quantity: (u.unit_level ?? i) === 0 ? null : 12,
      cost_price_cfa: u.cost_price_cfa,
      selling_price_cfa: u.selling_price_cfa,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })),
  }
}

function renderDrawer(product: ProductWithUnits) {
  vi.mocked(useProductDetail).mockReturnValue({
    data: product,
    isLoading: false,
  } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProductDetailDrawer productId={product.id} onClose={() => undefined} />
    </QueryClientProvider>,
  )
}

describe('CEO Notes — product profit / margin', () => {
  beforeEach(() => {
    useAuthStore.setState({
      staff: {
        id: 'admin-1',
        username: 'admin',
        full_name: 'Admin',
        role: 'admin',
        depot_id: null,
        is_active: true,
        deactivated_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      session: null,
      isLoading: false,
    })
    vi.mocked(useProductDetail).mockReset()
  })

  it('shows profit = selling − cost (CFA 25 for 45−20)', () => {
    renderDrawer(productWithUnits([{ unit_name: 'Piece', cost_price_cfa: 20, selling_price_cfa: 45 }]))
    expect(screen.getAllByText(INVENTORY.profit.fr)[0]).toBeInTheDocument()
    expect(screen.getByText(`+${formatCFA(25)}`)).toBeInTheDocument()
  })

  it('shows margin as 55.56% for cost 20 / selling 45', () => {
    renderDrawer(productWithUnits([{ unit_name: 'Piece', cost_price_cfa: 20, selling_price_cfa: 45 }]))
    expect(screen.getAllByText(INVENTORY.profitMargin.fr)[0]).toBeInTheDocument()
    expect(screen.getByText('55,6 %')).toBeInTheDocument()
  })

  it('selling=0 is safe (shows — , no NaN/Infinity)', () => {
    renderDrawer(
      productWithUnits([{ unit_name: 'Piece', cost_price_cfa: 100, selling_price_cfa: 0 }]),
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/NaN|Infinity/i)).not.toBeInTheDocument()
    expect(screen.getByText(formatCFA(-100))).toBeInTheDocument()
  })

  it('shows hierarchical stock breakdown for 1234 pieces', () => {
    const product = productWithUnits([
      { unit_name: 'Piece', cost_price_cfa: 20, selling_price_cfa: 45, conversion_to_base: 1, unit_level: 0 },
      { unit_name: 'Package', cost_price_cfa: 240, selling_price_cfa: 540, conversion_to_base: 12, unit_level: 1 },
      { unit_name: 'Carton', cost_price_cfa: 12000, selling_price_cfa: 27000, conversion_to_base: 600, unit_level: 2 },
    ])
    product.current_stock_pieces = 1234
    renderDrawer(product)
    const matchRow = (expected: string) =>
      screen.getByText((_content, node) => {
        if (node?.tagName !== 'P') return false
        return (node.textContent ?? '').replace(/\s+/g, ' ').trim() === expected
      })
    expect(matchRow('2 Cartons')).toBeInTheDocument()
    expect(matchRow('2 Paquets')).toBeInTheDocument()
    expect(matchRow('10 Pièces')).toBeInTheDocument()
  })
})
