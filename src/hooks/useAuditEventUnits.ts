import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { UnitLike } from '@/lib/stockQuantityDisplay'
import type { AuditLogRow } from '@/hooks/useAuditLog'

function mapUnits(raw: unknown): UnitLike[] | null {
  if (!Array.isArray(raw)) return null
  const units = raw
    .map((u) => {
      const row = u as Record<string, unknown>
      return {
        unit_level: Number(row.unit_level),
        unit_name: String(row.unit_name ?? ''),
        conversion_to_base: Number(row.conversion_to_base),
      }
    })
    .filter((u) => u.unit_name && (u.unit_level === 0 || u.conversion_to_base > 0))
  return units.length ? units.sort((a, b) => a.unit_level - b.unit_level) : null
}

function unitsFromProductJson(value: unknown): UnitLike[] | null {
  if (!value || typeof value !== 'object') return null
  return mapUnits((value as Record<string, unknown>).units)
}

async function fetchProductUnits(productId: string): Promise<UnitLike[] | null> {
  const { data, error } = await supabase
    .from('products')
    .select('product_units(unit_level, unit_name, conversion_to_base)')
    .eq('id', productId)
    .single()
  if (error || !data) return null
  return mapUnits((data as { product_units: unknown }).product_units)
}

async function resolveAuditEventUnits(row: AuditLogRow): Promise<UnitLike[] | null> {
  const fromAfter = unitsFromProductJson(row.after_value)
  if (fromAfter?.length) return fromAfter
  const fromBefore = unitsFromProductJson(row.before_value)
  if (fromBefore?.length) return fromBefore

  if (row.action === 'adjust_inventory' && row.entity_id) {
    const { data } = await supabase
      .from('inventory_adjustments')
      .select('product_id')
      .eq('id', row.entity_id)
      .maybeSingle()
    if (data?.product_id) return fetchProductUnits(data.product_id)
  }

  if (row.action === 'restock_product' && row.entity_id) {
    const { data } = await supabase
      .from('stock_entries')
      .select('product_id')
      .eq('id', row.entity_id)
      .maybeSingle()
    if (data?.product_id) return fetchProductUnits(data.product_id)
  }

  if (row.entity_type === 'product' && row.entity_id) {
    return fetchProductUnits(row.entity_id)
  }

  return null
}

export function useAuditEventUnits(row: AuditLogRow | null) {
  return useQuery({
    queryKey: ['audit-event-units', row?.id ?? ''],
    queryFn: () => (row ? resolveAuditEventUnits(row) : null),
    enabled: !!row,
    staleTime: 60_000,
  })
}
