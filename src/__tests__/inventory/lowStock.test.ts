/**
 * Per-product low-stock tracking: evaluation, alerts query, cache keys.
 * No notification table — current state is derived from products.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { invalidateAfterSaleSettled } from '@/lib/cacheInvalidation'
import { productKeys } from '@/hooks/useProducts'
import { invalidateAfterStockMutation } from '@/hooks/useInventory'
import {
  fetchStockAlerts,
  mapStockAlertRow,
  STOCK_ALERT_SELECT,
} from '@/hooks/useStockAlerts'
import {
  evaluateTrackedStockAlert,
  isTrackedLowStock,
  isTrackedOutOfStock,
  validateLowStockSettings,
} from '@/lib/lowStock'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

interface AlertRow {
  id: string
  name: string
  depot_id: string
  current_stock_pieces: number
  low_stock_threshold: number | null
  track_low_stock: boolean
  is_low_stock: boolean
  is_active: boolean
  depots: { name: string; code: string }
}

function onion(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    id: 'prod-onion-dkr',
    name: 'Onion',
    depot_id: 'depot-dakar',
    current_stock_pieces: 18,
    low_stock_threshold: 10,
    track_low_stock: true,
    is_low_stock: false,
    is_active: true,
    depots: { name: 'Dakar Depot', code: 'DKR' },
    ...overrides,
  }
}

function mockProductQueries(rows: AlertRow[]) {
  const tables: string[] = []
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    tables.push(table)
    let filtered = [...rows]
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = (col: string, val: unknown) => {
      filtered = filtered.filter((row) => (row as Record<string, unknown>)[col] === val)
      return builder
    }
    builder.lte = (col: string, val: unknown) => {
      filtered = filtered.filter((row) => Number((row as Record<string, unknown>)[col]) <= Number(val))
      return builder
    }
    builder.order = () => builder
    builder.limit = () => builder
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: filtered, error: null, count: filtered.length }).then(resolve, reject)
    return builder as never
  })
  return tables
}

describe('validateLowStockSettings', () => {
  it('requires a threshold when tracking is on', () => {
    expect(validateLowStockSettings(true, null)).toMatch(/threshold/i)
  })

  it('rejects a negative threshold', () => {
    expect(validateLowStockSettings(true, -1)).toMatch(/0 or greater/i)
    expect(validateLowStockSettings(false, -1)).toMatch(/0 or greater/i)
  })

  it('allows tracking off with a null threshold', () => {
    expect(validateLowStockSettings(false, null)).toBeNull()
  })

  it('allows threshold 0 when tracking is on', () => {
    expect(validateLowStockSettings(true, 0)).toBeNull()
  })
})

describe('evaluateTrackedStockAlert', () => {
  it('hides untracked products even when stock is 1', () => {
    const input = { track_low_stock: false, low_stock_threshold: 10, current_stock_pieces: 1 }
    expect(evaluateTrackedStockAlert(input)).toBeNull()
    expect(isTrackedLowStock(input)).toBe(false)
  })

  it('hides tracked products above the threshold', () => {
    expect(
      evaluateTrackedStockAlert({
        track_low_stock: true,
        low_stock_threshold: 10,
        current_stock_pieces: 18,
      }),
    ).toBeNull()
  })

  it('flags tracked stock exactly at the threshold as low stock', () => {
    expect(
      evaluateTrackedStockAlert({
        track_low_stock: true,
        low_stock_threshold: 10,
        current_stock_pieces: 10,
      }),
    ).toBe('low_stock')
  })

  it('flags tracked stock below the threshold but above 0 as low stock', () => {
    expect(
      evaluateTrackedStockAlert({
        track_low_stock: true,
        low_stock_threshold: 10,
        current_stock_pieces: 7,
      }),
    ).toBe('low_stock')
  })

  it('flags tracked stock of 0 as out of stock, not low stock', () => {
    const input = { track_low_stock: true, low_stock_threshold: 10, current_stock_pieces: 0 }
    expect(evaluateTrackedStockAlert(input)).toBe('out_of_stock')
    expect(isTrackedOutOfStock(input)).toBe(true)
    expect(isTrackedLowStock(input)).toBe(false)
  })

  it('reclassifies when the threshold changes', () => {
    const stock = { track_low_stock: true, current_stock_pieces: 12, low_stock_threshold: 10 }
    expect(evaluateTrackedStockAlert(stock)).toBeNull()
    expect(evaluateTrackedStockAlert({ ...stock, low_stock_threshold: 12 })).toBe('low_stock')
  })

  it('drops the alert when tracking is turned off', () => {
    const low = { track_low_stock: true, low_stock_threshold: 10, current_stock_pieces: 7 }
    expect(evaluateTrackedStockAlert(low)).toBe('low_stock')
    expect(evaluateTrackedStockAlert({ ...low, track_low_stock: false })).toBeNull()
  })
})

describe('mapStockAlertRow', () => {
  it('names the depot and never attaches a receipt', () => {
    const item = mapStockAlertRow({
      id: 'prod-1',
      name: 'Onion',
      depot_id: 'depot-abj',
      current_stock_pieces: 7,
      low_stock_threshold: 10,
      track_low_stock: true,
      depots: { name: 'Abidjan Depot', code: 'ABJ' },
    })
    expect(item).toMatchObject({
      productName: 'Onion',
      depotName: 'Abidjan Depot',
      currentStockPieces: 7,
      threshold: 10,
      kind: 'low_stock',
    })
    expect(item).not.toHaveProperty('saleId')
    expect(JSON.stringify(item)).not.toMatch(/receipt/i)
  })
})

describe('fetchStockAlerts', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset()
  })

  it('evaluates the same product independently per depot', async () => {
    mockProductQueries([
      onion({ is_low_stock: false, current_stock_pieces: 18 }),
      onion({
        id: 'prod-onion-abj',
        depot_id: 'depot-abidjan',
        current_stock_pieces: 7,
        is_low_stock: true,
        depots: { name: 'Abidjan Depot', code: 'ABJ' },
      }),
    ])

    const result = await fetchStockAlerts(null)
    expect(result.lowStock).toHaveLength(1)
    expect(result.lowStock[0]?.depotName).toBe('Abidjan Depot')
    expect(result.lowStock[0]?.currentStockPieces).toBe(7)
    expect(result.outOfStock).toHaveLength(0)
  })

  it('keeps one current low-stock row while stock stays below the threshold', async () => {
    const tables9 = mockProductQueries([
      onion({ current_stock_pieces: 9, is_low_stock: true }),
    ])
    const first = await fetchStockAlerts(null)
    const tables8 = mockProductQueries([
      onion({ current_stock_pieces: 8, is_low_stock: true }),
    ])
    const second = await fetchStockAlerts(null)
    const tables7 = mockProductQueries([
      onion({ current_stock_pieces: 7, is_low_stock: true }),
    ])
    const third = await fetchStockAlerts(null)

    expect(first.lowStock).toHaveLength(1)
    expect(second.lowStock).toHaveLength(1)
    expect(third.lowStock).toHaveLength(1)
    expect(first.lowStock[0]?.productId).toBe(second.lowStock[0]?.productId)
    expect(second.lowStock[0]?.productId).toBe(third.lowStock[0]?.productId)
    expect([...tables9, ...tables8, ...tables7].every((table) => table === 'products')).toBe(true)
    expect([...tables9, ...tables8, ...tables7]).not.toContain('notifications')
  })

  it('does not query a notifications table', async () => {
    const tables = mockProductQueries([])
    await fetchStockAlerts('depot-dakar')
    expect(tables.every((table) => table === 'products')).toBe(true)
    expect(STOCK_ALERT_SELECT).toContain('low_stock_threshold')
    expect(STOCK_ALERT_SELECT).toContain('depots!depot_id')
  })
})

describe('stock alert cache keys', () => {
  it('nests under products so sale settle and product updates refresh alerts', () => {
    const key = productKeys.stockAlerts('depot-a')
    expect(key).toEqual(['products', 'stock-alerts', 'depot-a'])
    expect(key[0]).toBe('products')

    const client = new QueryClient()
    client.setQueryData(key, {
      lowStock: [],
      lowStockCount: 0,
      outOfStock: [],
      outOfStockCount: 0,
    })
    invalidateAfterSaleSettled(client, { saleId: 'sale-1' })
    expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  })

  it('invalidates stock alerts after restock and adjustment', () => {
    const keys: unknown[][] = []
    invalidateAfterStockMutation(
      {
        invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
          keys.push([...queryKey])
        },
      },
      'prod-1',
    )
    expect(keys).toContainEqual([...productKeys.stockAlertsAll()])
  })
})
