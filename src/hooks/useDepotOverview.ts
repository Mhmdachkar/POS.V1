import { useQuery } from '@tanstack/react-query'
import { ymdInDisplayTimeZone } from '@/lib/formatters'
import { supabase } from '@/lib/supabase'
import { useDepotStore } from '@/stores/depotStore'

export interface DepotOverviewMetrics {
  pendingRelease: number
  releasedToday: number
  lowStock: number
  outOfStock: number
  untrackedZero: number
}

export const depotOverviewKeys = {
  all: ['depot', 'overview'] as const,
  depot: (depotId: string) => ['depot', 'overview', depotId] as const,
}

/** Product columns for overview metrics (includes generated is_low_stock). */
interface DepotOverviewProductRow {
  id: string
  current_stock_pieces: number
  low_stock_threshold: number | null
  track_low_stock: boolean
  is_low_stock: boolean
  is_active: boolean
}

interface PendingFulfillmentRow {
  sale_id: string
  created_at: string
}

/** Start of the shop day. Africa/Abidjan is UTC+0, so the bound is that calendar midnight. */
export function startOfShopToday(now: Date = new Date()): string {
  return `${ymdInDisplayTimeZone(now)}T00:00:00.000Z`
}

export async function fetchDepotOverview(depotId: string): Promise<{
  metrics: DepotOverviewMetrics
  pendingSaleIds: string[]
}> {
  const todayStart = startOfShopToday()

  const [pendingRes, releasedRes, productsRes] = await Promise.all([
    supabase
      .from('sale_fulfillments')
      .select('sale_id, sales!inner(status)', { count: 'exact' })
      .eq('depot_id', depotId)
      .eq('status', 'pending')
      .not('sales.status', 'in', '(voided,returned)'),
    supabase
      .from('sale_fulfillments')
      .select('sale_id', { count: 'exact' })
      .eq('depot_id', depotId)
      .eq('status', 'released')
      .gte('released_at', todayStart),
    supabase
      .from('products')
      .select('id, current_stock_pieces, low_stock_threshold, track_low_stock, is_low_stock, is_active')
      .eq('depot_id', depotId)
      .eq('is_active', true),
  ])

  if (pendingRes.error) throw pendingRes.error
  if (releasedRes.error) throw releasedRes.error
  if (productsRes.error) throw productsRes.error

  let lowStock = 0
  let outOfStock = 0
  let untrackedZero = 0
  const products = (productsRes.data ?? []) as DepotOverviewProductRow[]
  for (const p of products) {
    const stock = Number(p.current_stock_pieces)
    const tracked = p.track_low_stock === true
    if (!tracked && stock <= 0) untrackedZero += 1
    else if (tracked && stock <= 0) outOfStock += 1
    else if (tracked && (p.is_low_stock || (p.low_stock_threshold != null && stock <= Number(p.low_stock_threshold)))) {
      lowStock += 1
    }
  }

  const pendingList = await supabase
    .from('sale_fulfillments')
    .select('sale_id, created_at, sales!inner(status)')
    .eq('depot_id', depotId)
    .eq('status', 'pending')
    .not('sales.status', 'in', '(voided,returned)')
    .order('created_at', { ascending: false })
    .limit(8)

  if (pendingList.error) throw pendingList.error

  return {
    metrics: {
      pendingRelease: pendingRes.count ?? 0,
      releasedToday: releasedRes.count ?? 0,
      lowStock,
      outOfStock,
      untrackedZero,
    },
    pendingSaleIds: ((pendingList.data ?? []) as PendingFulfillmentRow[]).map((r) => r.sale_id),
  }
}

export function useDepotOverview() {
  const depotId = useDepotStore((s) => s.currentDepotId)
  return useQuery({
    queryKey: depotOverviewKeys.depot(depotId ?? ''),
    queryFn: () => fetchDepotOverview(depotId!),
    enabled: !!depotId,
  })
}
