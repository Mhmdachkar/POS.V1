import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'
import { CACHE_STALE } from '@/lib/cachePolicy'

export const proformaKeys = {
  all: ['proformas'] as const,
  list: (depotId: string | null, status: string | null) =>
    ['proformas', 'list', depotId, status] as const,
  detail: (id: string) => ['proformas', 'detail', id] as const,
}

export interface ProformaRow {
  id: string
  depot_id: string
  number: string
  status: 'draft' | 'sent' | 'converted' | 'cancelled'
  customer_id: string | null
  document_date: string
  external_ref: string | null
  notes: string | null
  subtotal_cfa: number
  discount_type: 'flat' | 'percent' | null
  discount_value: number | null
  discount_amount_cfa: number
  total_cfa: number
  converted_sale_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  /** Client-enriched from customers table (list RPC returns id only). */
  customer_name?: string | null
}

export interface ProformaItemRow {
  id: string
  proforma_id: string
  product_id: string
  unit_level: number
  quantity_in_unit: number
  unit_price_cfa: number
  line_discount_cfa: number
  line_total_cfa: number
  cost_price_cfa: number
  product_name: string
  unit_name: string
  serial_number: string | null
  sort_index: number
}

export async function fetchProformaList(depotId: string | null, status: string | null) {
  const result = await rpc.listProformas({
    p_depot_id: depotId,
    p_status: status,
    p_limit: 100,
    p_offset: 0,
  })
  if (result.error) throw result.error
  const payload = result.data as { rows: ProformaRow[]; count: number }
  const rows = payload.rows ?? []
  const customerIds = [
    ...new Set(rows.map((r) => r.customer_id).filter((id): id is string => !!id)),
  ]
  if (customerIds.length === 0) {
    return { rows, count: payload.count }
  }

  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name')
    .in('id', customerIds)
  if (error) throw error
  const nameById = new Map(
    ((customers ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  )
  return {
    count: payload.count,
    rows: rows.map((row) => ({
      ...row,
      customer_name: row.customer_id ? (nameById.get(row.customer_id) ?? null) : null,
    })),
  }
}

export async function fetchProformaDetail(id: string) {
  const result = await rpc.getProforma(id)
  if (result.error) throw result.error
  const data = result.data as { proforma: ProformaRow; items: ProformaItemRow[] }
  return data
}

export function useProformaList(depotId: string | null, status: string | null) {
  return useQuery({
    queryKey: proformaKeys.list(depotId, status),
    queryFn: () => fetchProformaList(depotId, status),
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function useProformaDetail(id: string | null) {
  return useQuery({
    queryKey: proformaKeys.detail(id ?? ''),
    queryFn: () => fetchProformaDetail(id!),
    enabled: !!id,
  })
}

export function useCreateProforma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: Parameters<typeof rpc.createProforma>[0]) => {
      const result = await rpc.createProforma(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: proformaKeys.all })
    },
  })
}

export function useUpdateProforma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: Parameters<typeof rpc.updateProforma>[0]) => {
      const result = await rpc.updateProforma(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: proformaKeys.all })
      void qc.invalidateQueries({ queryKey: proformaKeys.detail(vars.p_proforma_id) })
    },
  })
}

export function useSetProformaStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { p_proforma_id: string; p_status: 'sent' | 'cancelled' }) => {
      const result = await rpc.setProformaStatus(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: proformaKeys.all })
    },
  })
}

export function useDuplicateProforma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await rpc.duplicateProforma(id)
      if (result.error) throw result.error
      return result.data as { id: string; number: string }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: proformaKeys.all })
    },
  })
}