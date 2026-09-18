/**
 * useTransfers — TanStack Query hooks for depot-to-depot transfers.
 *
 * Reads: stock_transfers + stock_transfer_items (SELECT via RLS).
 * Writes: only rpc.createTransferDraft / completeTransfer / cancelTransfer.
 * Drafts are immutable — cancel and recreate. No client UPDATE.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rpc } from '@/lib/rpc'
import { inventoryKeys } from '@/hooks/useInventory'
import { productKeys } from '@/hooks/useProducts'
import { markReportsAndDashboardStale, type CacheInvalidator } from '@/lib/cacheInvalidation'
import { CACHE_STALE, keepPlaceholderWhen } from '@/lib/cachePolicy'
import type { Staff, TransferStatus } from '@/types/database'
import type {
  CancelTransferParams,
  CompleteTransferParams,
  CreateTransferDraftParams,
  TransferDraftItem,
} from '@/types/rpc'

export const TRANSFER_PAGE_SIZE = 30

export const TRANSFER_LIST_SELECT = `
  *,
  from_depot:depots!from_depot_id(name),
  to_depot:depots!to_depot_id(name),
  created_staff:staff!created_by(full_name),
  stock_transfer_items(count)
`

export const TRANSFER_DETAIL_SELECT = `
  *,
  from_depot:depots!from_depot_id(name),
  to_depot:depots!to_depot_id(name),
  created_staff:staff!created_by(full_name),
  completed_staff:staff!completed_by(full_name),
  cancelled_staff:staff!cancelled_by(full_name)
`

export const TRANSFER_ITEMS_SELECT = `
  *,
  from_product:products!from_product_id(name, product_units(unit_level, unit_name)),
  to_product:products!to_product_id(name)
`

export interface TransferListFilters {
  involvingDepotId: string | null
  status?: TransferStatus | null
  page: number
  pageSize: number
}

export interface TransferListItem {
  id: string
  from_depot_id: string
  to_depot_id: string
  status: TransferStatus
  created_by: string
  created_at: string
  completed_at: string | null
  completed_by: string | null
  note: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
  from_depot_name: string
  to_depot_name: string
  created_by_name: string | null
  item_count: number
}

export interface TransferItemDetail {
  id: string
  transfer_id: string
  from_product_id: string
  to_product_id: string
  unit_level: number
  quantity_in_unit: number
  quantity_pieces: number
  from_product_name: string
  to_product_name: string
  unit_name: string
}

export interface TransferDetailData extends TransferListItem {
  completed_by_name: string | null
  cancelled_by_name: string | null
  items: TransferItemDetail[]
}

export const transferKeys = {
  all: ['transfers'] as const,
  lists: () => ['transfers', 'list'] as const,
  list: (filters: TransferListFilters) => ['transfers', 'list', filters] as const,
  detail: (id: string) => ['transfers', 'detail', id] as const,
}

export function canAccessTransfers(role: Staff['role'] | null | undefined): boolean {
  return role === 'admin' || role === 'depot_staff'
}

export function canMutateTransfer(
  staff: Pick<Staff, 'role' | 'depot_id'> | null | undefined,
  transfer: Pick<{ from_depot_id: string; status: TransferStatus }, 'from_depot_id' | 'status'> | null | undefined,
): boolean {
  if (!staff || !transfer) return false
  if (transfer.status !== 'pending') return false
  if (staff.role === 'admin') return true
  if (staff.role === 'depot_staff') return staff.depot_id === transfer.from_depot_id
  return false
}

export function hasDuplicateSourceProducts(
  items: Array<{ from_product_id: string }>,
): boolean {
  const ids = items.map((i) => i.from_product_id).filter(Boolean)
  return new Set(ids).size !== ids.length
}

export function toCreateTransferDraftParams(input: {
  fromDepotId: string
  toDepotId: string
  items: TransferDraftItem[]
  note?: string | null
}): CreateTransferDraftParams {
  return {
    p_from_depot_id: input.fromDepotId,
    p_to_depot_id: input.toDepotId,
    p_items: input.items.map((item) => ({
      from_product_id: item.from_product_id,
      to_product_id: item.to_product_id,
      unit_level: item.unit_level,
      quantity_in_unit: item.quantity_in_unit,
    })),
    p_note: input.note?.trim() || null,
  }
}

export function invalidateAfterCreateDraft(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown },
  transferId?: string,
) {
  queryClient.invalidateQueries({ queryKey: transferKeys.lists() })
  if (transferId) {
    queryClient.invalidateQueries({ queryKey: transferKeys.detail(transferId) })
  }
}

export function invalidateAfterCompleteTransfer(
  queryClient: CacheInvalidator,
  transferId: string,
  productIds: string[] = [],
) {
  queryClient.invalidateQueries({ queryKey: transferKeys.detail(transferId) })
  queryClient.invalidateQueries({ queryKey: transferKeys.lists() })
  queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() })
  queryClient.invalidateQueries({ queryKey: inventoryKeys.stockActivities() })
  queryClient.invalidateQueries({ queryKey: productKeys.all })
  for (const productId of productIds) {
    queryClient.invalidateQueries({ queryKey: inventoryKeys.activity(productId) })
  }
  markReportsAndDashboardStale(queryClient)
}

export function invalidateAfterCancelTransfer(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown },
  transferId: string,
) {
  queryClient.invalidateQueries({ queryKey: transferKeys.detail(transferId) })
  queryClient.invalidateQueries({ queryKey: transferKeys.lists() })
}

function mapListRow(row: Record<string, unknown>): TransferListItem {
  const items = row.stock_transfer_items as Array<{ count?: number }> | undefined
  const fromDepot = row.from_depot as { name?: string } | null
  const toDepot = row.to_depot as { name?: string } | null
  const createdStaff = row.created_staff as { full_name?: string } | null
  return {
    id: row.id as string,
    from_depot_id: row.from_depot_id as string,
    to_depot_id: row.to_depot_id as string,
    status: row.status as TransferStatus,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
    completed_by: (row.completed_by as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    cancelled_by: (row.cancelled_by as string | null) ?? null,
    cancel_reason: (row.cancel_reason as string | null) ?? null,
    from_depot_name: fromDepot?.name ?? '—',
    to_depot_name: toDepot?.name ?? '—',
    created_by_name: createdStaff?.full_name ?? null,
    item_count: items?.[0]?.count ?? 0,
  }
}

export async function fetchTransfersList(
  filters: TransferListFilters,
): Promise<{ data: TransferListItem[]; count: number }> {
  const from = filters.page * filters.pageSize
  const to = from + filters.pageSize - 1

  let q = supabase
    .from('stock_transfers')
    .select(TRANSFER_LIST_SELECT, { count: 'exact' })

  if (filters.involvingDepotId) {
    const depotId = filters.involvingDepotId
    q = q.or(`from_depot_id.eq.${depotId},to_depot_id.eq.${depotId}`)
  }

  if (filters.status) {
    q = q.eq('status', filters.status)
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  return {
    data: ((data ?? []) as Record<string, unknown>[]).map(mapListRow),
    count: count ?? 0,
  }
}

export async function fetchTransferDetail(id: string): Promise<TransferDetailData> {
  const { data: header, error: headerError } = await supabase
    .from('stock_transfers')
    .select(TRANSFER_DETAIL_SELECT)
    .eq('id', id)
    .single()

  if (headerError) throw headerError

  const { data: itemsRaw, error: itemsError } = await supabase
    .from('stock_transfer_items')
    .select(TRANSFER_ITEMS_SELECT)
    .eq('transfer_id', id)
    .order('id')

  if (itemsError) throw itemsError

  const row = header as Record<string, unknown>
  const completedStaff = row.completed_staff as { full_name?: string } | null
  const cancelledStaff = row.cancelled_staff as { full_name?: string } | null

  const items: TransferItemDetail[] = ((itemsRaw ?? []) as Record<string, unknown>[]).map((item) => {
    const fromProduct = item.from_product as {
      name?: string
      product_units?: Array<{ unit_level: number; unit_name: string }>
    } | null
    const toProduct = item.to_product as { name?: string } | null
    const unitLevel = item.unit_level as number
    const unitName =
      fromProduct?.product_units?.find((u) => u.unit_level === unitLevel)?.unit_name
      ?? (unitLevel === 0 ? 'Piece' : unitLevel === 1 ? 'Package' : 'Carton')

    return {
      id: item.id as string,
      transfer_id: item.transfer_id as string,
      from_product_id: item.from_product_id as string,
      to_product_id: item.to_product_id as string,
      unit_level: unitLevel,
      quantity_in_unit: Number(item.quantity_in_unit),
      quantity_pieces: Number(item.quantity_pieces),
      from_product_name: fromProduct?.name ?? '—',
      to_product_name: toProduct?.name ?? '—',
      unit_name: unitName,
    }
  })

  return {
    ...mapListRow({ ...row, stock_transfer_items: [{ count: items.length }] }),
    completed_by_name: completedStaff?.full_name ?? null,
    cancelled_by_name: cancelledStaff?.full_name ?? null,
    items,
  }
}

export function useTransfersList(filters: TransferListFilters) {
  return useQuery({
    queryKey: transferKeys.list(filters),
    queryFn: () => fetchTransfersList(filters),
    staleTime: CACHE_STALE.transfersList,
    placeholderData: keepPlaceholderWhen((prevKey) => {
      const prev = prevKey[2] as TransferListFilters | undefined
      return (prev?.involvingDepotId ?? null) === (filters.involvingDepotId ?? null)
    }),
  })
}

export function useTransferDetail(id: string | null) {
  return useQuery({
    queryKey: transferKeys.detail(id ?? ''),
    queryFn: () => fetchTransferDetail(id!),
    enabled: !!id,
    staleTime: CACHE_STALE.transfersDetail,
  })
}

export function useCreateTransferDraft() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CreateTransferDraftParams) => {
      const result = await rpc.createTransferDraft(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (data) => {
      invalidateAfterCreateDraft(queryClient, data.transfer_id)
    },
  })
}

export function useCompleteTransfer(productIds: string[] = []) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CompleteTransferParams) => {
      const result = await rpc.completeTransfer(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (data) => {
      invalidateAfterCompleteTransfer(queryClient, data.transfer_id, productIds)
    },
  })
}

export function useCancelTransfer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CancelTransferParams) => {
      const result = await rpc.cancelTransfer(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (data) => {
      invalidateAfterCancelTransfer(queryClient, data.transfer_id)
    },
  })
}
