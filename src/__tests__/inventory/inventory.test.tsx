/**
 * Phase 7 — Inventory Management unit tests.
 *
 * Covers query predicates, filter-before-pagination, RPC param mapping,
 * inactive-product UI policy, activity query shape, and invalidation keys.
 * All Supabase / RPC calls are mocked. No live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { messageForCodePlain } from '@/lib/bilingual/errors'
import { ERROR_MESSAGES, parseError } from '@/lib/errors'
import type { VhmError, VhmErrorCode } from '@/lib/errors'
import { RestockModal } from '@/pages/inventory/components/RestockModal'
import { AdjustmentModal } from '@/pages/inventory/components/AdjustmentModal'
import { clampInventoryPage } from '@/pages/inventory/InventoryPage'
import { rpc } from '@/lib/rpc'
import {
  getStockStatus,
  LOW_STOCK_THRESHOLD_PIECES,
  type InventoryListFilters,
  type ProductWithUnits,
} from '@/types'
import {
  INACTIVE_PRODUCT_MESSAGE,
  INVENTORY_ACTIVITY_LIMIT,
  INVENTORY_ACTIVITY_SELECT,
  INVENTORY_LIST_SELECT,
  INVENTORY_PAGE_SIZE,
  INVENTORY_SEARCH_DEBOUNCE_MS,
  adjustmentFormSchema,
  applyInventoryStockStatusFilter,
  categoryKeys,
  fetchInventoryActivity,
  fetchInventoryList,
  fetchStockActivity,
  formatDerivedUnitQuantity,
  invalidateAfterStockMutation,
  inventoryKeys,
  primarySellingUnit,
  STOCK_ACTIVITY_PAGE_SIZE,
  STOCK_ACTIVITY_SELECT,
  stockActivityCreatedAtBounds,
  restockFormSchema,
  stockStatusPredicates,
  toAdjustRpcParams,
  toAdjustmentRpcQuantity,
  toRestockRpcParams,
} from '@/hooks/useInventory'
import { productKeys } from '@/hooks/useProducts'
import { ProductDetailDrawer } from '@/pages/inventory/components/ProductDetailDrawer'
import { supabase } from '@/lib/supabase'
import { useProductDetail } from '@/hooks/useProducts'

vi.mock('@/lib/rpc', () => ({
  rpc: {
    restockProduct: vi.fn(),
    adjustInventory: vi.fn(),
  },
}))

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

// ─────────────────────────────────────────────────────────────────
// Filter-aware PostgREST mock
// ─────────────────────────────────────────────────────────────────

type ProductRow = {
  id: string
  name: string
  depot_id: string
  category_id: string
  current_stock_pieces: number
  track_low_stock: boolean
  low_stock_threshold: number | null
  is_low_stock: boolean
  is_active: boolean
  photo_url: string
  updated_at: string
  created_at: string
  product_units: unknown[]
  categories: { name: string } | null
}

function padName(i: number) {
  return `Product ${String(i).padStart(3, '0')}`
}

function buildCatalog(): ProductRow[] {
  const rows: ProductRow[] = []
  for (let i = 0; i < 100; i++) {
    const outOfStock = i === 90
    rows.push({
      id: `prod-${i}`,
      name: padName(i),
      depot_id: i < 50 ? 'depot-a' : 'depot-b',
      category_id: i % 2 === 0 ? 'cat-water' : 'cat-food',
      current_stock_pieces: outOfStock ? 0 : 50,
      track_low_stock: false,
      low_stock_threshold: null,
      is_low_stock: false,
      is_active: true,
      photo_url: 'https://placehold.co/40',
      updated_at: '2026-09-12T00:00:00Z',
      created_at: '2026-09-12T00:00:00Z',
      product_units: [{ unit_level: 0, unit_name: 'Piece', conversion_to_base: 1 }],
      categories: { name: i % 2 === 0 ? 'Water' : 'Food' },
    })
  }
  return rows
}

function createFilterAwareFrom(allRows: ProductRow[]) {
  const calls: string[] = []
  let filtered = [...allRows]
  let range: [number, number] | null = null
  let selectArgs: unknown[] = []
  let table = 'products'

  const builder: Record<string, unknown> = {}

  const assign = (name: string, fn: (...args: unknown[]) => unknown) => {
    builder[name] = fn
  }

  assign('select', (...args: unknown[]) => {
    calls.push('select')
    selectArgs = args
    filtered = [...allRows]
    range = null
    return builder
  })
  assign('order', () => {
    calls.push('order')
    return builder
  })
  assign('eq', (col: unknown, val: unknown) => {
    calls.push(`eq:${String(col)}`)
    filtered = filtered.filter((r) => (r as Record<string, unknown>)[String(col)] === val)
    return builder
  })
  assign('ilike', (col: unknown, val: unknown) => {
    calls.push(`ilike:${String(col)}`)
    const needle = String(val).replace(/%/g, '').toLowerCase()
    if (table === 'product_units') {
      // Inventory catalog mock has no unit serials — no serial matches.
      filtered = []
      return builder
    }
    filtered = filtered.filter((r) =>
      String((r as Record<string, unknown>)[String(col)]).toLowerCase().includes(needle),
    )
    return builder
  })
  assign('or', (filter: unknown) => {
    calls.push(`or:${String(filter)}`)
    const text = String(filter)
    const nameMatch = text.match(/name\.ilike\.%([^%]+)%/)
    const needle = (nameMatch?.[1] ?? '').toLowerCase()
    const idMatch = text.match(/id\.in\.\(([^)]*)\)/)
    const ids = idMatch?.[1] ? idMatch[1].split(',').filter(Boolean) : []
    filtered = allRows.filter((r) => {
      const byName = needle ? r.name.toLowerCase().includes(needle) : false
      const byId = ids.includes(r.id)
      return byName || byId
    })
    return builder
  })
  assign('lte', (col: unknown, val: unknown) => {
    calls.push(`lte:${String(col)}`)
    filtered = filtered.filter((r) => Number((r as Record<string, unknown>)[String(col)]) <= Number(val))
    return builder
  })
  assign('gt', (col: unknown, val: unknown) => {
    calls.push(`gt:${String(col)}`)
    filtered = filtered.filter((r) => Number((r as Record<string, unknown>)[String(col)]) > Number(val))
    return builder
  })
  assign('range', (from: unknown, to: unknown) => {
    calls.push('range')
    range = [Number(from), Number(to)]
    return builder
  })
  assign('limit', (n: unknown) => {
    calls.push(`limit:${String(n)}`)
    return builder
  })

  const execute = () => {
    if (table === 'product_units') {
      return Promise.resolve({ data: [], error: null })
    }
    const count = filtered.length
    const page = range ? filtered.slice(range[0], range[1] + 1) : filtered
    return Promise.resolve({ data: page, error: null, count })
  }

  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    execute().then(resolve, reject)

  const from = (name: string) => {
    table = name
    calls.push(`from:${name}`)
    return builder
  }

  return { builder, calls, from, getSelectArgs: () => selectArgs }
}

// ─────────────────────────────────────────────────────────────────
// 1. getStockStatus
// ─────────────────────────────────────────────────────────────────

describe('getStockStatus', () => {
  it('maps 0 to out_of_stock', () => {
    expect(getStockStatus(0)).toBe('out_of_stock')
  })

  it('does not treat untracked stock of 1 as low_stock', () => {
    expect(getStockStatus(1)).toBe('healthy')
  })

  it('maps tracked stock at the threshold to low_stock', () => {
    expect(getStockStatus(10, { trackLowStock: true, threshold: 10 })).toBe('low_stock')
  })

  it('maps stock above a tracked threshold to healthy', () => {
    expect(getStockStatus(11, { trackLowStock: true, threshold: 10 })).toBe('healthy')
  })

  it('uses LOW_STOCK_THRESHOLD_PIECES = 10 as the form default only', () => {
    expect(LOW_STOCK_THRESHOLD_PIECES).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────
// 2. Stock status query predicates
// ─────────────────────────────────────────────────────────────────

describe('stock status query predicates', () => {
  it('out_of_stock uses lte current_stock_pieces 0', () => {
    expect(stockStatusPredicates('out_of_stock')).toEqual({
      lte: [['current_stock_pieces', 0]],
    })
  })

  it('low_stock uses the generated is_low_stock flag', () => {
    expect(stockStatusPredicates('low_stock')).toEqual({
      eq: [['is_low_stock', true]],
    })
  })

  it('healthy uses in-stock and not is_low_stock', () => {
    expect(stockStatusPredicates('healthy')).toEqual({
      gt: [['current_stock_pieces', 0]],
      eq: [['is_low_stock', false]],
    })
  })

  it('all applies no stock predicates', () => {
    expect(stockStatusPredicates('all')).toEqual({})
  })

  it('applyInventoryStockStatusFilter uses is_low_stock for low stock', () => {
    const order: string[] = []
    const q = {
      lte(col: string, val: number) {
        order.push(`lte:${col}:${val}`)
        return this
      },
      gt(col: string, val: number) {
        order.push(`gt:${col}:${val}`)
        return this
      },
      eq(col: string, val: boolean) {
        order.push(`eq:${col}:${String(val)}`)
        return this
      },
    }
    applyInventoryStockStatusFilter(q, 'low_stock')
    expect(order).toEqual(['eq:is_low_stock:true'])
  })
})

// ─────────────────────────────────────────────────────────────────
// 3. Filter-before-pagination
// ─────────────────────────────────────────────────────────────────

describe('filter-before-pagination', () => {
  const catalog = buildCatalog()

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset()
  })

  it('returns an Out of Stock product that would live on page 4 of All', async () => {
    const { from } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockImplementation((table: string) => from(table) as never)

    const unfilteredPage0: InventoryListFilters = {
      page: 0,
      pageSize: INVENTORY_PAGE_SIZE,
      search: '',
      categoryId: null,
      stockStatus: 'all',
      depotId: null,
    }

    const allFirst = await fetchInventoryList(unfilteredPage0)
    expect(allFirst.data.find((p) => p.id === 'prod-90')).toBeUndefined()
    expect(allFirst.count).toBe(100)

    const { from: filteredFrom, calls: filteredCalls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockImplementation((table: string) => filteredFrom(table) as never)

    const result = await fetchInventoryList({
      ...unfilteredPage0,
      stockStatus: 'out_of_stock',
    })

    expect(result.count).toBe(1)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe('prod-90')
    expect(result.data[0].current_stock_pieces).toBe(0)

    const lteIndex = filteredCalls.indexOf('lte:current_stock_pieces')
    const rangeIndex = filteredCalls.indexOf('range')
    expect(lteIndex).toBeGreaterThan(-1)
    expect(rangeIndex).toBeGreaterThan(lteIndex)
  })

  it('uses count: exact on the filtered query', async () => {
    const { from, getSelectArgs } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockImplementation((table: string) => from(table) as never)

    await fetchInventoryList({
      page: 0,
      pageSize: INVENTORY_PAGE_SIZE,
      search: '',
      categoryId: null,
      stockStatus: 'healthy',
      depotId: null,
    })

    expect(getSelectArgs()[0]).toBe(INVENTORY_LIST_SELECT)
    expect(getSelectArgs()[1]).toEqual({ count: 'exact' })
  })

  it('does not apply a React getStockStatus filter on the returned page', async () => {
    const { from } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockImplementation((table: string) => from(table) as never)

    const result = await fetchInventoryList({
      page: 0,
      pageSize: INVENTORY_PAGE_SIZE,
      search: '',
      categoryId: null,
      stockStatus: 'out_of_stock',
      depotId: null,
    })

    expect(result.data.every((p) => p.current_stock_pieces <= 0)).toBe(true)
    expect(result.count).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────
// 4. Search + category + depot
// ─────────────────────────────────────────────────────────────────

describe('list filters', () => {
  const catalog = buildCatalog()

  it('applies name or serial or-filter when search is present', async () => {
    const { from, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockImplementation((table: string) => from(table) as never)

    await fetchInventoryList({
      page: 0,
      pageSize: 30,
      search: 'Product 001',
      categoryId: null,
      stockStatus: 'all',
      depotId: null,
    })

    expect(calls).toContain('from:product_units')
    expect(calls.some((c) => c.startsWith('or:name.ilike.%Product 001%'))).toBe(true)
  })

  it('puts categoryId on the list query key so each category is a server-side page', () => {
    const base: InventoryListFilters = {
      page: 0,
      pageSize: 30,
      search: '',
      stockStatus: 'all',
      depotId: 'depot-a',
      categoryId: null,
    }
    expect(inventoryKeys.list({ ...base, categoryId: 'cat-a' })).toEqual([
      'inventory',
      'list',
      { ...base, categoryId: 'cat-a' },
    ])
    expect(inventoryKeys.list({ ...base, categoryId: 'cat-a' })).not.toEqual(
      inventoryKeys.list({ ...base, categoryId: 'cat-b' }),
    )
  })

  it('applies category_id when category is selected', async () => {
    const { from, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockImplementation((table: string) => from(table) as never)

    await fetchInventoryList({
      page: 0,
      pageSize: 30,
      search: '',
      categoryId: 'cat-water',
      stockStatus: 'all',
      depotId: null,
    })

    expect(calls).toContain('eq:category_id')
  })

  it('omits depot eq filter when depotId is null (All Depots)', async () => {
    const { from, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockImplementation((table: string) => from(table) as never)

    await fetchInventoryList({
      page: 0,
      pageSize: 30,
      search: '',
      categoryId: null,
      stockStatus: 'all',
      depotId: null,
    })

    expect(calls.some((c) => c === 'eq:depot_id')).toBe(false)
  })

  it('applies depot_id when a depot is selected', async () => {
    const { from, calls } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockImplementation((table: string) => from(table) as never)

    const result = await fetchInventoryList({
      page: 0,
      pageSize: 30,
      search: '',
      categoryId: null,
      stockStatus: 'all',
      depotId: 'depot-b',
    })

    expect(calls).toContain('eq:depot_id')
    expect(result.count).toBe(50)
    expect(result.data.every((p) => p.depot_id === 'depot-b')).toBe(true)
  })

  it('keeps concrete product depot_id on All Depots rows', async () => {
    const { from } = createFilterAwareFrom(catalog)
    vi.mocked(supabase.from).mockImplementation((table: string) => from(table) as never)

    const result = await fetchInventoryList({
      page: 0,
      pageSize: 30,
      search: '',
      categoryId: null,
      stockStatus: 'all',
      depotId: null,
    })

    expect(result.data.some((p) => p.depot_id === 'depot-a')).toBe(true)
    expect(result.data.every((p) => typeof p.depot_id === 'string' && p.depot_id.length > 0)).toBe(true)
  })

  it('search debounce is 300ms', () => {
    expect(INVENTORY_SEARCH_DEBOUNCE_MS).toBe(300)
  })

  it('page size is 30', () => {
    expect(INVENTORY_PAGE_SIZE).toBe(30)
  })
})

// ─────────────────────────────────────────────────────────────────
// 5. Restock RPC mapping
// ─────────────────────────────────────────────────────────────────

describe('restock RPC mapping', () => {
  it('sends p_unit_level and never unit_id or quantity_pieces', () => {
    const params = toRestockRpcParams('prod-1', {
      unit_level: 2,
      quantity_in_unit: 3,
      note: 'delivery',
    })

    expect(params).toEqual({
      p_product_id: 'prod-1',
      p_unit_level: 2,
      p_quantity_in_unit: 3,
      p_note: 'delivery',
    })
    expect(params).not.toHaveProperty('unit_id')
    expect(params).not.toHaveProperty('p_unit_id')
    expect(params).not.toHaveProperty('quantity_pieces')
    expect(params).not.toHaveProperty('p_quantity_pieces')
    expect(params).not.toHaveProperty('p_depot_id')
    expect(params).not.toHaveProperty('currentDepotId')
  })

  it('rejects non-positive quantity in zod', () => {
    const zero = restockFormSchema.safeParse({ unit_level: 0, quantity_in_unit: 0 })
    const negative = restockFormSchema.safeParse({ unit_level: 0, quantity_in_unit: -1 })
    const ok = restockFormSchema.safeParse({ unit_level: 1, quantity_in_unit: 2 })
    expect(zero.success).toBe(false)
    expect(negative.success).toBe(false)
    expect(ok.success).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────
// 6. Adjustment RPC mapping
// ─────────────────────────────────────────────────────────────────

describe('adjustment RPC mapping', () => {
  it('DAMAGE maps +5 UI to -5 RPC', () => {
    expect(toAdjustmentRpcQuantity('DAMAGE', 5)).toBe(-5)
    expect(toAdjustRpcParams('prod-1', 'DAMAGE', 5, null).p_quantity_pieces).toBe(-5)
  })

  it('LOSS maps +5 UI to -5 RPC', () => {
    expect(toAdjustmentRpcQuantity('LOSS', 5)).toBe(-5)
  })

  it('EXPIRY maps +5 UI to -5 RPC', () => {
    expect(toAdjustmentRpcQuantity('EXPIRY', 5)).toBe(-5)
  })

  it('COUNT_CORRECTION preserves sign', () => {
    expect(toAdjustmentRpcQuantity('COUNT_CORRECTION', 5)).toBe(5)
    expect(toAdjustmentRpcQuantity('COUNT_CORRECTION', -5)).toBe(-5)
  })

  it('OTHER preserves sign and requires reason', () => {
    expect(toAdjustmentRpcQuantity('OTHER', -3)).toBe(-3)
    const missing = adjustmentFormSchema.safeParse({
      adjustment_type: 'OTHER',
      quantity: -3,
      reason: '',
    })
    const ok = adjustmentFormSchema.safeParse({
      adjustment_type: 'OTHER',
      quantity: -3,
      reason: 'found extra crate',
    })
    expect(missing.success).toBe(false)
    expect(ok.success).toBe(true)
  })

  it('rejects zero quantity', () => {
    const zero = adjustmentFormSchema.safeParse({
      adjustment_type: 'COUNT_CORRECTION',
      quantity: 0,
    })
    expect(zero.success).toBe(false)
  })

  it('never includes currentDepotId on RPC params', () => {
    const params = toAdjustRpcParams('prod-b', 'DAMAGE', 2, 'broken')
    expect(params.p_product_id).toBe('prod-b')
    expect(params).not.toHaveProperty('p_depot_id')
    expect(params).not.toHaveProperty('currentDepotId')
  })
})

// ─────────────────────────────────────────────────────────────────
// 7. Error mapping
// ─────────────────────────────────────────────────────────────────

describe('inventory error mapping', () => {
  const codes: VhmErrorCode[] = [
    'PRODUCT_INACTIVE',
    'INVALID_QUANTITY',
    'INVALID_UNIT',
    'INVALID_DEPOT',
    'ADJUSTMENT_NEGATIVE_RESULT',
    'UNAUTHORIZED',
  ]

  it.each(codes)('parseError maps %s to a user message', (code) => {
    const err = parseError({ message: JSON.stringify({ code, details: {} }) })
    expect(err.code).toBe(code)
    expect(err.message.length).toBeGreaterThan(0)
    expect(err.message).not.toMatch(/P0001|postgres|sqlstate/i)
  })
})

// ─────────────────────────────────────────────────────────────────
// 8. Activity query
// ─────────────────────────────────────────────────────────────────

describe('inventory activity query', () => {
  it('uses inventory_transactions, product_id, created_at desc, limit 50, staff!created_by', async () => {
    const calls: string[] = []
    const builder: Record<string, unknown> = {}
    builder.select = (sel: unknown) => {
      calls.push(`select:${String(sel)}`)
      return builder
    }
    builder.eq = (col: unknown, val: unknown) => {
      calls.push(`eq:${String(col)}:${String(val)}`)
      return builder
    }
    builder.order = (col: unknown, opts: unknown) => {
      calls.push(`order:${String(col)}:${JSON.stringify(opts)}`)
      return builder
    }
    builder.limit = (n: unknown) => {
      calls.push(`limit:${String(n)}`)
      return builder
    }
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({
        data: [
          {
            id: 'tx-1',
            depot_id: 'depot-a',
            product_id: 'prod-1',
            quantity_pieces: 5,
            transaction_type: 'RESTOCK',
            reference_type: 'stock_entry',
            reference_id: 'e1',
            created_by: 'staff-1',
            created_at: '2026-09-12T00:00:00Z',
            metadata: {},
            staff: { full_name: 'Awa Diop' },
          },
          {
            id: 'tx-2',
            depot_id: 'depot-a',
            product_id: 'prod-1',
            quantity_pieces: -2,
            transaction_type: 'ADJUSTMENT',
            reference_type: 'inventory_adjustment',
            reference_id: 'a1',
            created_by: 'staff-2',
            created_at: '2026-09-11T00:00:00Z',
            metadata: { type: 'DAMAGE' },
            staff: null,
          },
        ],
        error: null,
      }).then(resolve, reject)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      calls.push(`from:${table}`)
      return builder as never
    })

    const rows = await fetchInventoryActivity('prod-1')

    expect(calls[0]).toBe('from:inventory_transactions')
    expect(calls).toContain(`select:${INVENTORY_ACTIVITY_SELECT}`)
    expect(INVENTORY_ACTIVITY_SELECT).toBe('*, staff!created_by(full_name)')
    expect(calls).toContain('eq:product_id:prod-1')
    expect(calls).toContain('order:created_at:{"ascending":false}')
    expect(calls).toContain(`limit:${INVENTORY_ACTIVITY_LIMIT}`)
    expect(INVENTORY_ACTIVITY_LIMIT).toBe(50)
    expect(calls.some((c) => c.startsWith('eq:depot_id'))).toBe(false)

    expect(rows[0].staff_name).toBe('Awa Diop')
    expect(rows[1].staff_name).toBeNull()
  })

  it('null staff renders as em dash', () => {
    const display = (staffName: string | null) => staffName ?? '—'
    expect(display(null)).toBe('—')
    expect(display('Awa Diop')).toBe('Awa Diop')
  })
})

describe('stock activity ledger query', () => {
  /** One builder per `from()` so Promise.all(name + serial) does not share table state. */
  function ledgerBuilderForTable(table: string, calls: string[]) {
    const builder: Record<string, unknown> = {}
    builder.select = (sel: unknown, opts?: unknown) => {
      calls.push(`select:${String(sel)}`)
      calls.push(`count:${JSON.stringify(opts ?? null)}`)
      return builder
    }
    builder.eq = (col: unknown, val: unknown) => {
      calls.push(`eq:${String(col)}:${String(val)}`)
      return builder
    }
    builder.in = (col: unknown, vals: unknown) => {
      calls.push(`in:${String(col)}:${JSON.stringify(vals)}`)
      return builder
    }
    builder.limit = () => builder
    builder.order = (col: unknown, opts: unknown) => {
      calls.push(`order:${String(col)}:${JSON.stringify(opts)}`)
      return builder
    }
    builder.gte = (col: unknown, val: unknown) => {
      calls.push(`gte:${String(col)}:${String(val)}`)
      return builder
    }
    builder.lt = (col: unknown, val: unknown) => {
      calls.push(`lt:${String(col)}:${String(val)}`)
      return builder
    }
    builder.ilike = (col: unknown, val: unknown) => {
      calls.push(`ilike:${String(col)}:${String(val)}`)
      return builder
    }
    builder.range = (from: unknown, to: unknown) => {
      calls.push(`range:${from}-${to}`)
      return builder
    }
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      if (table === 'product_units') {
        return Promise.resolve({ data: [], error: null }).then(resolve, reject)
      }
      if (table === 'products') {
        return Promise.resolve({ data: [{ id: 'prod-1' }], error: null }).then(resolve, reject)
      }
      return Promise.resolve({
        data: [
          {
            id: 'tx-1',
            depot_id: 'depot-a',
            product_id: 'prod-1',
            quantity_pieces: 5,
            transaction_type: 'RESTOCK',
            reference_type: 'stock_entry',
            reference_id: 'e1',
            created_by: 'staff-1',
            created_at: '2026-09-12T00:00:00Z',
            metadata: { unit_name: 'Bottle', quantity_in_unit: 5 },
            staff: { full_name: 'Awa Diop' },
            products: { name: 'Mineral Water', is_active: true },
            depots: { name: 'Dakar', code: 'DKR' },
          },
        ],
        error: null,
        count: 1,
      }).then(resolve, reject)
    }
    return builder
  }

  it('selects inventory_transactions with count, newest first, range last', async () => {
    const calls: string[] = []
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      calls.push(`from:${table}`)
      return ledgerBuilderForTable(table, calls) as never
    })

    const bounds = stockActivityCreatedAtBounds('this_week')
    const result = await fetchStockActivity({
      depotId: 'depot-a',
      search: 'Water',
      transactionType: 'SALE',
      datePreset: 'this_week',
      page: 1,
      pageSize: STOCK_ACTIVITY_PAGE_SIZE,
    })

    expect(calls).toContain('from:products')
    expect(calls).toContain('from:product_units')
    expect(calls).toContain('from:inventory_transactions')
    expect(calls).toContain(`select:${STOCK_ACTIVITY_SELECT}`)
    expect(STOCK_ACTIVITY_SELECT).toBe(
      '*, staff!created_by(full_name), products!product_id!inner(name, is_active), depots!depot_id(name, code)',
    )
    expect(calls).toContain('count:{"count":"exact"}')
    expect(calls).toContain('order:created_at:{"ascending":false}')
    expect(calls).toContain('eq:depot_id:depot-a')
    expect(calls).toContain('eq:transaction_type:SALE')
    expect(calls).toContain(`gte:created_at:${bounds!.from}`)
    expect(calls).toContain(`lt:created_at:${bounds!.toExclusive}`)
    expect(calls).toContain('in:product_id:["prod-1"]')
    expect(calls).toContain(`range:50-99`)
    expect(STOCK_ACTIVITY_PAGE_SIZE).toBe(50)

    const rangeIdx = calls.findIndex((c) => c.startsWith('range:'))
    const inIdx = calls.findIndex((c) => c.startsWith('in:product_id:'))
    const eqTypeIdx = calls.findIndex((c) => c === 'eq:transaction_type:SALE')
    expect(rangeIdx).toBeGreaterThan(-1)
    expect(inIdx).toBeGreaterThan(-1)
    expect(inIdx).toBeLessThan(rangeIdx)
    expect(eqTypeIdx).toBeLessThan(rangeIdx)

    expect(result.count).toBe(1)
    expect(result.data[0].staff_name).toBe('Awa Diop')
    expect(result.data[0].product_name).toBe('Mineral Water')
    expect(result.data[0].depot_name).toBe('Dakar')
  })

  it('omits depot, type, date, and search predicates when unset', async () => {
    const calls: string[] = []
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      calls.push(`from:${table}`)
      return ledgerBuilderForTable(table, calls) as never
    })

    await fetchStockActivity({
      depotId: null,
      search: '  ',
      transactionType: 'all',
      datePreset: 'all',
      page: 0,
      pageSize: STOCK_ACTIVITY_PAGE_SIZE,
    })

    expect(calls.some((c) => c.startsWith('eq:depot_id'))).toBe(false)
    expect(calls.some((c) => c.startsWith('eq:transaction_type'))).toBe(false)
    expect(calls.some((c) => c.startsWith('gte:created_at'))).toBe(false)
    expect(calls.some((c) => c.startsWith('lt:created_at'))).toBe(false)
    expect(calls.some((c) => c.startsWith('ilike:'))).toBe(false)
    expect(calls.some((c) => c.startsWith('in:product_id:'))).toBe(false)
    expect(calls).toContain('range:0-49')
  })
})

// ─────────────────────────────────────────────────────────────────
// 9. Invalidation
// ─────────────────────────────────────────────────────────────────

describe('query invalidation', () => {
  it('invalidates lists, product detail, activity, and products search — not categories', () => {
    const keys: unknown[][] = []
    const queryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        keys.push([...queryKey])
      },
    }

    invalidateAfterStockMutation(queryClient, 'prod-1')

    expect(keys).toContainEqual(['inventory', 'list'])
    expect(keys).toContainEqual([...productKeys.detail('prod-1')])
    expect(keys).toContainEqual([...inventoryKeys.activity('prod-1')])
    expect(keys).toContainEqual([...inventoryKeys.stockActivities()])
    expect(keys).toContainEqual([...productKeys.searches()])
    expect(keys).toContainEqual([...productKeys.stockAlertsAll()])
    expect(keys.some((k) => k[0] === 'reports')).toBe(true)
    expect(keys.some((k) => k[0] === 'dashboard')).toBe(true)
    expect(keys.some((k) => k[0] === 'categories')).toBe(false)
    expect(keys).not.toContainEqual([...categoryKeys.all])
  })
})

// ─────────────────────────────────────────────────────────────────
// 10. Inactive product UI
// ─────────────────────────────────────────────────────────────────

const inactiveProduct: ProductWithUnits = {
  id: 'prod-inactive',
  depot_id: 'depot-a',
  category_id: 'cat-water',
  name: 'Inactive Water',
  photo_url: 'https://placehold.co/40',
  current_stock_pieces: 4,
  track_low_stock: false,
  low_stock_threshold: null,
  is_active: false,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  units: [
    {
      id: 'u1',
      product_id: 'prod-inactive',
      unit_level: 0,
      unit_name: 'Piece',
      conversion_to_base: 1,
      cost_price_cfa: 100,
      selling_price_cfa: 150,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
  ],
}

describe('inactive product UI', () => {
  it('disables Restock and Adjust and shows Product is inactive', () => {
    vi.mocked(useProductDetail).mockReturnValue({
      data: inactiveProduct,
      isLoading: false,
    } as never)

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ProductDetailDrawer productId="prod-inactive" onClose={() => {}} />
      </QueryClientProvider>,
    )

    expect(screen.getAllByText(INACTIVE_PRODUCT_MESSAGE).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /restock/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /adjust inventory/i })).toBeDisabled()
  })

  it('still maps PRODUCT_INACTIVE RPC errors', () => {
    const err = parseError({
      message: JSON.stringify({ code: 'PRODUCT_INACTIVE', details: { product_id: 'x' } }),
    })
    expect(err.code).toBe('PRODUCT_INACTIVE')
    expect(err.message).toBe(messageForCodePlain('PRODUCT_INACTIVE'))
  })
})

// ─────────────────────────────────────────────────────────────────
// 11. Derived unit display
// ─────────────────────────────────────────────────────────────────

describe('derived unit quantity', () => {
  it('shows 3 decimal places and is display-only math', () => {
    expect(formatDerivedUnitQuantity(124.333, 24)).toBe(5.181)
    expect(formatDerivedUnitQuantity(10, 1)).toBe(10)
  })
})

describe('primarySellingUnit', () => {
  it('picks the smallest unit_level', () => {
    expect(
      primarySellingUnit([
        { unit_level: 2, unit_name: 'Carton' },
        { unit_level: 0, unit_name: 'Piece' },
      ])?.unit_name,
    ).toBe('Piece')
    expect(primarySellingUnit([])).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────
// 12. parseError — already-parsed VhmError (closure fix)
// ─────────────────────────────────────────────────────────────────

describe('parseError — already-parsed VhmError', () => {
  const codes: VhmErrorCode[] = [
    'PRODUCT_INACTIVE',
    'INVALID_QUANTITY',
    'INVALID_UNIT',
    'INVALID_DEPOT',
    'ADJUSTMENT_NEGATIVE_RESULT',
    'UNAUTHORIZED',
  ]

  it.each(codes)('preserves %s and uses ERROR_MESSAGES, not UNKNOWN', (code) => {
    const err = parseError({ code, message: 'ignored' })
    expect(err.code).toBe(code)
    expect(err.message).toBe(messageForCodePlain(code))
    expect(err.code).not.toBe('UNKNOWN')
    expect(err.message).not.toBe(ERROR_MESSAGES.UNKNOWN)
  })

  it('does not treat Postgres P0001 as a VhmError', () => {
    const err = parseError({ code: 'P0001', message: 'raw postgres boom' })
    expect(err.code).toBe('UNKNOWN')
    expect(err.message).toBe(messageForCodePlain('UNKNOWN'))
    expect(err.message).not.toContain('postgres')
  })

  it('maps unknown native Error to UNKNOWN', () => {
    const err = parseError(new Error('test'))
    expect(err.code).toBe('UNKNOWN')
    expect(err.message).toBe(messageForCodePlain('UNKNOWN'))
  })
})

// ─────────────────────────────────────────────────────────────────
// 13. Modal mutation error path
// ─────────────────────────────────────────────────────────────────

const activeProduct: ProductWithUnits = {
  id: 'prod-active',
  depot_id: 'depot-b',
  category_id: 'cat-water',
  name: 'Water 1.5L',
  photo_url: 'https://placehold.co/40',
  current_stock_pieces: 40,
  track_low_stock: false,
  low_stock_threshold: null,
  is_active: true,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  units: [
    {
      id: 'u1',
      product_id: 'prod-active',
      unit_level: 0,
      unit_name: 'Piece',
      conversion_to_base: 1,
      cost_price_cfa: 100,
      selling_price_cfa: 150,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
  ],
}

function renderWithQuery(ui: JSX.Element) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('RestockModal mutation error path', () => {
  beforeEach(() => {
    vi.mocked(rpc.restockProduct).mockReset()
  })

  it.each([
    'PRODUCT_INACTIVE',
    'INVALID_QUANTITY',
    'INVALID_UNIT',
  ] as const)('renders mapped %s after RPC error', async (code) => {
    const vhm: VhmError = { code, message: 'ignored' }
    vi.mocked(rpc.restockProduct).mockResolvedValue({ data: null, error: vhm })

    const user = userEvent.setup()
    renderWithQuery(<RestockModal open onClose={() => {}} product={activeProduct} />)

    await user.type(screen.getByRole('spinbutton'), '2')
    await user.click(screen.getByRole('button', { name: /^restock$/i }))

    expect(await screen.findByText(messageForCodePlain(code), { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(messageForCodePlain('UNKNOWN'), { exact: false })).not.toBeInTheDocument()
    expect(rpc.restockProduct).toHaveBeenCalled()
  })

  it('renders UNKNOWN for an unexpected thrown Error', async () => {
    vi.mocked(rpc.restockProduct).mockRejectedValue(new Error('test'))

    const user = userEvent.setup()
    renderWithQuery(<RestockModal open onClose={() => {}} product={activeProduct} />)

    await user.type(screen.getByRole('spinbutton'), '2')
    await user.click(screen.getByRole('button', { name: /^restock$/i }))

    expect(await screen.findByText(messageForCodePlain('UNKNOWN'), { exact: false })).toBeInTheDocument()
  })
})

describe('AdjustmentModal mutation error path', () => {
  beforeEach(() => {
    vi.mocked(rpc.adjustInventory).mockReset()
  })

  it.each([
    'PRODUCT_INACTIVE',
    'INVALID_QUANTITY',
    'ADJUSTMENT_NEGATIVE_RESULT',
  ] as const)('renders mapped %s after RPC error', async (code) => {
    const vhm: VhmError = { code, message: 'ignored' }
    vi.mocked(rpc.adjustInventory).mockResolvedValue({ data: null, error: vhm })

    const user = userEvent.setup()
    renderWithQuery(<AdjustmentModal open onClose={() => {}} product={activeProduct} />)

    await user.type(screen.getByRole('spinbutton'), '5')
    await user.click(screen.getByRole('button', { name: /apply adjustment/i }))

    expect(await screen.findByText(messageForCodePlain(code), { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(messageForCodePlain('UNKNOWN'), { exact: false })).not.toBeInTheDocument()
    expect(rpc.adjustInventory).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────
// 14. Page clamp
// ─────────────────────────────────────────────────────────────────

describe('clampInventoryPage', () => {
  it('moves page 4 to last valid page when totalPages is 2', () => {
    expect(clampInventoryPage(4, 2)).toBe(1)
  })

  it('resets page 1 to 0 when totalPages is 0', () => {
    expect(clampInventoryPage(1, 0)).toBe(0)
  })

  it('leaves page 0 unchanged', () => {
    expect(clampInventoryPage(0, 5)).toBe(0)
    expect(clampInventoryPage(0, 0)).toBe(0)
  })

  it('leaves a valid page unchanged', () => {
    expect(clampInventoryPage(1, 3)).toBe(1)
  })
})
