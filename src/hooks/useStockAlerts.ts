/**
 * Admin stock alerts — current low-stock / tracked out-of-stock rows.
 *
 * Derived from products + depots. No notification table.
 * Nested under productKeys so sale/product invalidation refreshes the list.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CACHE_STALE } from '@/lib/cachePolicy'
import { productKeys } from '@/hooks/useProducts'
import {
  evaluateTrackedStockAlert,
  type StockAlertKind,
} from '@/lib/lowStock'

export const STOCK_ALERT_LIMIT = 50

export const STOCK_ALERT_SELECT =
  'id, name, depot_id, current_stock_pieces, low_stock_threshold, track_low_stock, is_low_stock, depots!depot_id(name, code)'

export interface StockAlertItem {
  productId: string
  productName: string
  depotId: string
  depotName: string
  currentStockPieces: number
  threshold: number | null
  kind: StockAlertKind
}

export interface StockAlertsResult {
  lowStock: StockAlertItem[]
  lowStockCount: number
  outOfStock: StockAlertItem[]
  outOfStockCount: number
  /** Active products at zero that are not on the low-stock watch list. */
  untrackedZeroCount: number
}

function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

interface StockAlertRow {
  id: string
  name: string
  depot_id: string
  current_stock_pieces: number
  low_stock_threshold: number | null
  track_low_stock: boolean
  is_low_stock?: boolean
  depots?: { name?: string; code?: string } | { name?: string; code?: string }[] | null
}

export function mapStockAlertRow(row: StockAlertRow): StockAlertItem | null {
  const kind = evaluateTrackedStockAlert({
    track_low_stock: row.track_low_stock,
    low_stock_threshold: row.low_stock_threshold,
    current_stock_pieces: Number(row.current_stock_pieces),
  })
  if (!kind) return null
  const depot = embedOne(row.depots)
  return {
    productId: row.id,
    productName: row.name,
    depotId: row.depot_id,
    depotName: depot?.name?.trim() ? depot.name : depot?.code ?? 'Depot',
    currentStockPieces: Number(row.current_stock_pieces),
    threshold: row.low_stock_threshold == null ? null : Number(row.low_stock_threshold),
    kind,
  }
}

export function sortStockAlertItems(items: StockAlertItem[]): StockAlertItem[] {
  return [...items].sort((a, b) => {
    if (a.currentStockPieces !== b.currentStockPieces) {
      return a.currentStockPieces - b.currentStockPieces
    }
    const name = a.productName.localeCompare(b.productName)
    if (name !== 0) return name
    return a.depotId.localeCompare(b.depotId)
  })
}

async function queryTrackedAlerts(
  depotId: string | null,
  kind: StockAlertKind,
): Promise<{ data: StockAlertItem[]; count: number }> {
  let q = supabase
    .from('products')
    .select(STOCK_ALERT_SELECT, { count: 'exact' })
    .eq('is_active', true)
    .eq('track_low_stock', true)

  if (kind === 'low_stock') {
    q = q.eq('is_low_stock', true)
  } else {
    q = q.lte('current_stock_pieces', 0)
  }

  if (depotId) {
    q = q.eq('depot_id', depotId)
  }

  const { data, error, count } = await q
    .order('current_stock_pieces', { ascending: true })
    .order('name', { ascending: true })
    .order('depot_id', { ascending: true })
    .limit(STOCK_ALERT_LIMIT)

  if (error) throw error

  const mapped = sortStockAlertItems(
    ((data ?? []) as StockAlertRow[])
      .map(mapStockAlertRow)
      .filter((item): item is StockAlertItem => item != null && item.kind === kind),
  )

  return { data: mapped, count: count ?? mapped.length }
}

async function countUntrackedZero(depotId: string | null): Promise<number> {
  let q = supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('track_low_stock', false)
    .lte('current_stock_pieces', 0)
  if (depotId) q = q.eq('depot_id', depotId)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export async function fetchStockAlerts(depotId: string | null): Promise<StockAlertsResult> {
  const [low, out, untrackedZeroCount] = await Promise.all([
    queryTrackedAlerts(depotId, 'low_stock'),
    queryTrackedAlerts(depotId, 'out_of_stock'),
    countUntrackedZero(depotId),
  ])
  return {
    lowStock: low.data,
    lowStockCount: low.count,
    outOfStock: out.data,
    outOfStockCount: out.count,
    untrackedZeroCount,
  }
}

export function useStockAlerts(depotId: string | null) {
  return useQuery({
    queryKey: productKeys.stockAlerts(depotId),
    queryFn: () => fetchStockAlerts(depotId),
    staleTime: CACHE_STALE.dashboard,
  })
}
