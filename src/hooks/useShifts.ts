/**
 * useShifts — TanStack Query hooks for cashier shift management.
 *
 * Reads: shifts (+ joined depot/staff) and live running totals via RLS SELECT.
 * Writes: only rpc.openShift / rpc.closeShift.
 * Current POS shift is never auto-bound from this hook.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rpc } from '@/lib/rpc'
import { usePOSStore } from '@/stores/posStore'
import type { ShiftStatus, Staff } from '@/types/database'
import type { CloseShiftParams, CloseShiftResult, OpenShiftParams } from '@/types/rpc'

export const SHIFT_PAGE_SIZE = 30

export const SHIFT_LIST_SELECT = `
  *,
  depot:depots!depot_id(name),
  cashier:staff!cashier_id(full_name),
  closed_staff:staff!closed_by(full_name)
`

export interface ShiftListFilters {
  depotId: string | null
  status?: ShiftStatus | null
  page: number
  pageSize: number
}

export interface ShiftListItem {
  id: string
  depot_id: string
  cashier_id: string
  opening_float_cfa: number
  opened_at: string
  closed_at: string | null
  closed_by: string | null
  expected_cash_cfa: number | null
  actual_cash_cfa: number | null
  discrepancy_cfa: number | null
  status: ShiftStatus
  depot_name: string
  cashier_name: string | null
  closed_by_name: string | null
}

export interface ShiftRunningTotals {
  sales_cash_cfa: number
  customer_pmts_cfa: number
  return_cash_cfa: number
}

export interface ShiftDetailData extends ShiftListItem {
  running: ShiftRunningTotals
}

export const shiftKeys = {
  all:    ['shifts'] as const,
  lists:  () => ['shifts', 'list'] as const,
  list:   (filters: ShiftListFilters) => ['shifts', 'list', filters] as const,
  detail: (id: string) => ['shifts', 'detail', id] as const,
  open:   () => ['shifts', 'open'] as const,
}

export function canAccessShifts(role: Staff['role'] | null | undefined): boolean {
  return role === 'admin' || role === 'cashier'
}

export function canCloseShift(
  staff: Pick<Staff, 'role' | 'depot_id'> | null | undefined,
  shift: Pick<ShiftListItem, 'depot_id' | 'status'> | null | undefined,
): boolean {
  if (!staff || !shift) return false
  if (shift.status !== 'open') return false
  if (staff.role === 'admin') return true
  if (staff.role === 'cashier') return staff.depot_id === shift.depot_id
  return false
}

/** Cashier: own-depot open shifts only. Admin: any accessible open shift. Never auto-select. */
export function canSelectShiftForPos(
  staff: Pick<Staff, 'role' | 'depot_id'> | null | undefined,
  shift: Pick<ShiftListItem, 'depot_id' | 'status'> | null | undefined,
): boolean {
  if (!staff || !shift) return false
  if (shift.status !== 'open') return false
  if (staff.role === 'admin') return true
  if (staff.role === 'cashier') return staff.depot_id === shift.depot_id
  return false
}

export function authorizedOpenShifts(
  staff: Pick<Staff, 'role' | 'depot_id'> | null | undefined,
  shifts: ShiftListItem[] | null | undefined,
): ShiftListItem[] {
  return (shifts ?? []).filter((shift) => canSelectShiftForPos(staff, shift))
}

export function clearStalePosShift(code: string | null | undefined) {
  if (code === 'SHIFT_NOT_OPEN') {
    usePOSStore.getState().setShiftId(null)
  }
}

export function clampShiftPage(page: number, totalPages: number): number {
  if (page <= 0) return 0
  if (totalPages === 0) return 0
  if (page >= totalPages) return totalPages - 1
  return page
}

export function parseNonNegativeCfa(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

export function estimateExpectedCash(
  openingFloat: number,
  running: ShiftRunningTotals,
): number {
  return openingFloat + running.sales_cash_cfa + running.customer_pmts_cfa - running.return_cash_cfa
}

export function invalidateAfterOpenShift(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown },
) {
  queryClient.invalidateQueries({ queryKey: shiftKeys.lists() })
  queryClient.invalidateQueries({ queryKey: shiftKeys.open() })
}

export function invalidateAfterCloseShift(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown },
  shiftId: string,
) {
  queryClient.invalidateQueries({ queryKey: shiftKeys.detail(shiftId) })
  queryClient.invalidateQueries({ queryKey: shiftKeys.lists() })
  queryClient.invalidateQueries({ queryKey: shiftKeys.open() })
}

function mapListRow(row: Record<string, unknown>): ShiftListItem {
  const depot = row.depot as { name?: string } | null
  const cashier = row.cashier as { full_name?: string } | null
  const closedStaff = row.closed_staff as { full_name?: string } | null
  return {
    id: row.id as string,
    depot_id: row.depot_id as string,
    cashier_id: row.cashier_id as string,
    opening_float_cfa: Number(row.opening_float_cfa),
    opened_at: row.opened_at as string,
    closed_at: (row.closed_at as string | null) ?? null,
    closed_by: (row.closed_by as string | null) ?? null,
    expected_cash_cfa: row.expected_cash_cfa == null ? null : Number(row.expected_cash_cfa),
    actual_cash_cfa: row.actual_cash_cfa == null ? null : Number(row.actual_cash_cfa),
    discrepancy_cfa: row.discrepancy_cfa == null ? null : Number(row.discrepancy_cfa),
    status: row.status as ShiftStatus,
    depot_name: depot?.name ?? '—',
    cashier_name: cashier?.full_name ?? null,
    closed_by_name: closedStaff?.full_name ?? null,
  }
}

export async function fetchShiftRunningTotals(shiftId: string): Promise<ShiftRunningTotals> {
  const [salesRes, paymentsRes, returnsRes] = await Promise.all([
    supabase.from('sales').select('amount_applied_cfa, status').eq('shift_id', shiftId),
    supabase.from('payments').select('amount_cfa, payment_type, is_reversed').eq('shift_id', shiftId),
    supabase.from('sale_returns').select('cash_refunded_cfa').eq('shift_id', shiftId),
  ])

  if (salesRes.error) throw salesRes.error
  if (paymentsRes.error) throw paymentsRes.error
  if (returnsRes.error) throw returnsRes.error

  const sales_cash_cfa = ((salesRes.data ?? []) as Array<{
    amount_applied_cfa: number
    status: string
  }>).reduce((sum, row) => (
    row.status === 'voided' ? sum : sum + Number(row.amount_applied_cfa ?? 0)
  ), 0)

  const customer_pmts_cfa = ((paymentsRes.data ?? []) as Array<{
    amount_cfa: number
    payment_type: string
    is_reversed: boolean
  }>).reduce((sum, row) => (
    row.payment_type === 'customer_payment' && row.is_reversed === false
      ? sum + Number(row.amount_cfa ?? 0)
      : sum
  ), 0)

  const return_cash_cfa = ((returnsRes.data ?? []) as Array<{
    cash_refunded_cfa: number
  }>).reduce((sum, row) => sum + Number(row.cash_refunded_cfa ?? 0), 0)

  return { sales_cash_cfa, customer_pmts_cfa, return_cash_cfa }
}

export async function fetchShiftsList(
  filters: ShiftListFilters,
): Promise<{ data: ShiftListItem[]; count: number }> {
  const from = filters.page * filters.pageSize
  const to = from + filters.pageSize - 1

  let q = supabase
    .from('shifts')
    .select(SHIFT_LIST_SELECT, { count: 'exact' })

  if (filters.depotId) {
    q = q.eq('depot_id', filters.depotId)
  }

  if (filters.status) {
    q = q.eq('status', filters.status)
  }

  const { data, error, count } = await q
    .order('opened_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  return {
    data: ((data ?? []) as Record<string, unknown>[]).map(mapListRow),
    count: count ?? 0,
  }
}

export async function fetchOpenShifts(): Promise<ShiftListItem[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select(SHIFT_LIST_SELECT)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapListRow)
}

export async function fetchShiftDetail(id: string): Promise<ShiftDetailData> {
  const { data, error } = await supabase
    .from('shifts')
    .select(SHIFT_LIST_SELECT)
    .eq('id', id)
    .single()

  if (error) throw error

  const running = await fetchShiftRunningTotals(id)
  return {
    ...mapListRow(data as Record<string, unknown>),
    running,
  }
}

export function useShiftsList(filters: ShiftListFilters) {
  return useQuery({
    queryKey: shiftKeys.list(filters),
    queryFn: () => fetchShiftsList(filters),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  })
}

/** Display-only. Must never call setShiftId. */
export function useOpenShifts() {
  return useQuery({
    queryKey: shiftKeys.open(),
    queryFn: fetchOpenShifts,
    staleTime: 15_000,
  })
}

export function useShiftDetail(id: string | null) {
  return useQuery({
    queryKey: shiftKeys.detail(id ?? ''),
    queryFn: () => fetchShiftDetail(id!),
    enabled: !!id,
    staleTime: 10_000,
  })
}

export function useOpenShift() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: OpenShiftParams) => {
      const result = await rpc.openShift(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => {
      invalidateAfterOpenShift(queryClient)
    },
  })
}

export function useCloseShift() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CloseShiftParams): Promise<CloseShiftResult> => {
      const result = await rpc.closeShift(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (data) => {
      invalidateAfterCloseShift(queryClient, data.shift_id)
    },
  })
}
