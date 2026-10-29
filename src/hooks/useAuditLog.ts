import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CACHE_STALE } from '@/lib/cachePolicy'
import type { AuditLog } from '@/types/database'

export const AUDIT_ACTIONS = [
  'complete_sale',
  'release_sale_fulfillment',
  'record_payment',
  'process_return',
  'void_sale',
  'void_sale_cash_reversal',
  'adjust_inventory',
  'restock_product',
  'create_transfer_draft',
  'complete_transfer',
  'cancel_transfer',
  'open_shift',
  'close_shift',
  'create_customer',
  'update_customer',
  'deactivate_customer',
  'reactivate_customer',
  'create_staff',
  'update_staff',
  'deactivate_staff',
  'reactivate_staff',
  'staff_auth_reconcile',
  'create_depot',
  'update_depot',
  'deactivate_depot',
  'reactivate_depot',
  'create_category',
  'update_category',
  'deactivate_category',
  'reactivate_category',
  'create_product',
  'update_product',
  'deactivate_product',
  'reactivate_product',
  'update_business_settings',
  'validate_purchase_receipt',
  'cancel_purchase_receipt',
  'record_supplier_payment',
  'create_supplier',
  'update_supplier',
  'correct_electro2_stock_cost',
  'upsert_purchase_receipt',
  'create_delivery_note',
  'set_proforma_status',
  'duplicate_proforma',
  'update_proforma',
  'create_proforma',
] as const

export const AUDIT_ENTITY_TYPES = [
  'sale',
  'payment',
  'sale_return',
  'inventory_adjustment',
  'stock_entry',
  'stock_transfer',
  'shift',
  'customer',
  'staff',
  'depot',
  'category',
  'product',
  'business_settings',
  'purchase_receipt',
  'supplier',
  'supplier_payment',
  'proforma',
  'delivery_note',
] as const

export interface AuditLogRow extends AuditLog {
  actor_name: string | null
  actor_username: string | null
}

export interface AuditLogFilters {
  depotId?: string | null
  action?: string | null
  entityType?: string | null
  actorId?: string | null
  entityIdSearch?: string
  startDate: string
  endDate: string
  page?: number
  pageSize?: number
}

export const auditKeys = {
  all: ['audit'] as const,
  list: (f: AuditLogFilters) => ['audit', 'list', f] as const,
}

/** Abidjan is UTC+0 — calendar-day bounds match UTC midnight slices. */
function utcBounds(startDate: string, endDate: string): { from: string; toExclusive: string } {
  const next = new Date(`${endDate}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return {
    from: `${startDate}T00:00:00.000Z`,
    toExclusive: next.toISOString(),
  }
}

export async function fetchAuditLog(filters: AuditLogFilters): Promise<{
  data: AuditLogRow[]
  count: number
}> {
  const page = filters.page ?? 0
  const pageSize = filters.pageSize ?? 50
  const from = page * pageSize
  const to = from + pageSize - 1
  const { from: occurredFrom, toExclusive } = utcBounds(filters.startDate, filters.endDate)

  let q = supabase
    .from('audit_log')
    .select(
      `
      *,
      staff!actor_id(full_name, username)
      `,
      { count: 'exact' },
    )
    .gte('occurred_at', occurredFrom)
    .lt('occurred_at', toExclusive)
    .order('occurred_at', { ascending: false })

  if (filters.depotId) {
    // Include tenant-wide rows (null depot) so supplier create/edit stay visible
    // when an admin has a depot selected.
    q = q.or(`depot_id.eq.${filters.depotId},depot_id.is.null`)
  }
  if (filters.action) {
    q = q.eq('action', filters.action)
  }
  if (filters.entityType) {
    q = q.eq('entity_type', filters.entityType)
  }
  if (filters.actorId) {
    q = q.eq('actor_id', filters.actorId)
  }
  if (filters.entityIdSearch?.trim()) {
    const term = filters.entityIdSearch.trim()
    q = q.eq('entity_id', term)
  }

  const { data, error, count } = await q.range(from, to)
  if (error) throw error

  const rows: AuditLogRow[] = (data ?? []).map((row: Record<string, unknown>) => {
    const staff = row.staff as { full_name?: string; username?: string } | null
    const { staff: _s, ...rest } = row
    return {
      ...(rest as unknown as AuditLog),
      actor_name: staff?.full_name ?? null,
      actor_username: staff?.username ?? null,
    }
  })

  return { data: rows, count: count ?? 0 }
}

export function useAuditLog(filters: AuditLogFilters) {
  return useQuery({
    queryKey: auditKeys.list(filters),
    queryFn: () => fetchAuditLog(filters),
    staleTime: CACHE_STALE.audit,
  })
}
