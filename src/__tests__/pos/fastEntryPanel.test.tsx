import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FastEntryPanel } from '@/components/pos/FastEntryPanel'
import { PosStockProvider } from '@/components/pos/PosStockProvider'
import { usePOSProductCatalog } from '@/hooks/useProducts'
import { usePOSStore } from '@/stores/posStore'
import { POS } from '@/lib/bilingual/pos'
import { bilingualAriaLabel } from '@/lib/bilingual/types'
import { todayYmdAbidjan } from '@/lib/supplierDueDate'
import type { ProductUnit } from '@/types/database'
import type { ProductWithUnits } from '@/types'

vi.mock('@/hooks/useProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useProducts')>()
  return {
    ...actual,
    usePOSProductCatalog: vi.fn(),
  }
})

function makeUnit(overrides: Partial<ProductUnit> = {}): ProductUnit {
  return {
    id: 'unit-piece',
    product_id: 'prod-z178',
    unit_level: 0,
    unit_name: 'Piece',
    serial_number: 'Z-178',
    relative_quantity: null,
    conversion_to_base: 1,
    cost_price_cfa: 1000,
    selling_price_cfa: 18000,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function product(): ProductWithUnits {
  return {
    id: 'prod-z178',
    depot_id: 'depot-main',
    category_id: 'cat-tables',
    name: 'Folding Table — Z-178',
    photo_url: '',
    current_stock_pieces: 40,
    track_low_stock: false,
    low_stock_threshold: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    units: [
      makeUnit(),
      makeUnit({
        id: 'unit-carton',
        unit_level: 1,
        unit_name: 'Carton',
        serial_number: 'Z-178-CTN',
        relative_quantity: 4,
        conversion_to_base: 4,
        cost_price_cfa: 4000,
        selling_price_cfa: 72000,
      }),
    ],
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PosStockProvider products={[product()]}>
        <FastEntryPanel depotId="depot-main" onRequestPay={() => {}} />
      </PosStockProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  usePOSStore.getState().startNewSale()
  vi.mocked(usePOSProductCatalog).mockReturnValue({
    data: [product()],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  } as never)
})

describe('FastEntryPanel', () => {
  it('fills the document date with today and keeps a later edit', () => {
    renderPanel()

    const date = screen.getByLabelText('Date') as HTMLInputElement
    expect(date.value).toBe(todayYmdAbidjan())

    fireEvent.change(date, { target: { value: '2026-01-15' } })
    expect(date.value).toBe('2026-01-15')
    expect(usePOSStore.getState().documentDateYmd).toBe('2026-01-15')
  })

  it('lets the cashier sell the same product by piece or carton', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByPlaceholderText('Code'), 'Z-178')
    const entryUnit = screen.getByLabelText(
      bilingualAriaLabel(POS.selectUnitAria('Folding Table — Z-178')),
    )
    expect(screen.getAllByRole('option', { name: 'Pièce' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('option', { name: 'Carton' }).length).toBeGreaterThan(0)

    await user.selectOptions(entryUnit, '1')
    await user.click(screen.getByRole('button', { name: 'Enter' }))

    const line = usePOSStore.getState().items[0]
    expect(line.unit_level).toBe(1)
    expect(line.unit_name).toBe('Carton')
    expect(line.unit_price_cfa).toBe(72000)
    expect(line.conversion_to_base).toBe(4)

    const gridUnit = screen.getByLabelText(
      bilingualAriaLabel(POS.selectUnitAria('Folding Table — Z-178')),
    )
    expect((gridUnit as HTMLSelectElement).value).toBe('1')
    expect(screen.getByLabelText('Stock dispo').textContent).toBe('10')
    await user.selectOptions(gridUnit, '0')

    const updated = usePOSStore.getState().items[0]
    expect(updated.unit_level).toBe(0)
    expect(screen.getByLabelText('Stock dispo').textContent).toBe('40')
    expect(updated.unit_name).toBe('Piece')
    expect(updated.unit_price_cfa).toBe(18000)
  })
})
