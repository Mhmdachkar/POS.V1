import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rpc } from '@/lib/rpc'
import { CACHE_STALE } from '@/lib/cachePolicy'

export const deliveryNoteKeys = {
  all: ['delivery_notes'] as const,
  forSale: (saleId: string) => ['delivery_notes', 'sale', saleId] as const,
  remaining: (saleId: string) => ['delivery_notes', 'remaining', saleId] as const,
  detail: (id: string) => ['delivery_notes', 'detail', id] as const,
}

export interface DeliveryRemainingRow {
  sale_item_id: string
  product_id: string
  unit_level: number
  product_name: string
  unit_name: string
  sold_qty: number
  returned_qty: number
  delivered_qty: number
  remaining_qty: number
  unit_price_cfa: number
  line_discount_cfa: number
  line_total_cfa: number
}

export interface DeliveryNoteRow {
  id: string
  depot_id: string
  sale_id: string
  number: string
  show_prices: boolean
  received_by_name: string | null
  document_date: string
  created_by: string
  created_at: string
}

export interface DeliveryNoteItemRow {
  id: string
  delivery_note_id: string
  sale_item_id: string
  product_id: string
  unit_level: number
  quantity_in_unit: number
  unit_price_cfa: number
  line_discount_cfa: number
  line_total_cfa: number
  /** Full sale line qty (from get_delivery_note join). */
  sale_quantity_in_unit?: number
  /** Full sale line discount before BL proration. */
  sale_line_discount_cfa?: number
  product_name: string
  unit_name: string
  serial_number: string | null
  sort_index: number
}

export async function fetchSaleDeliveryRemaining(saleId: string) {
  const result = await rpc.saleDeliveryRemaining(saleId)
  if (result.error) throw result.error
  return result.data as {
    sale_id: string
    receipt_number: string
    status: string
    rows: DeliveryRemainingRow[]
  }
}

export async function fetchDeliveryNotesForSale(saleId: string) {
  const result = await rpc.listDeliveryNotesForSale(saleId)
  if (result.error) throw result.error
  return result.data as { rows: DeliveryNoteRow[] }
}

export async function fetchDeliveryNoteDetail(id: string) {
  const result = await rpc.getDeliveryNote(id)
  if (result.error) throw result.error
  return result.data as {
    note: DeliveryNoteRow
    items: DeliveryNoteItemRow[]
    receipt_number: string
    customer: { id: string; name: string; phone: string | null; address: string | null } | null
  }
}

export function useSaleDeliveryRemaining(saleId: string | null) {
  return useQuery({
    queryKey: deliveryNoteKeys.remaining(saleId ?? ''),
    queryFn: () => fetchSaleDeliveryRemaining(saleId!),
    enabled: !!saleId,
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function useDeliveryNotesForSale(saleId: string | null) {
  return useQuery({
    queryKey: deliveryNoteKeys.forSale(saleId ?? ''),
    queryFn: () => fetchDeliveryNotesForSale(saleId!),
    enabled: !!saleId,
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function useCreateDeliveryNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: Parameters<typeof rpc.createDeliveryNote>[0]) => {
      const result = await rpc.createDeliveryNote(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: deliveryNoteKeys.forSale(vars.p_sale_id) })
      void qc.invalidateQueries({ queryKey: deliveryNoteKeys.remaining(vars.p_sale_id) })
      void qc.invalidateQueries({ queryKey: deliveryNoteKeys.all })
    },
  })
}
