/**
 * useShifts — TanStack Query hooks for cashier shift management.
 *
 * Reads: shifts (+ joined depot/staff) and live running totals via RLS SELECT.
 * Writes: only rpc.openShift / rpc.closeShift.
 * Current POS shift is never auto-bound from this hook.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { embedOne } from '@/lib/embed'
import { fillCashierNames } from '@/lib/staffDisplayNames'
import { supabase } from '@/lib/supabase'
import { rpc } from '@/lib/rpc'
import { CACHE_STALE, keepPlaceholderWhen } from '@/lib/cachePolicy'
import type { ShiftStatus, Staff } from '@/types/database'
import type {
  CloseShiftParams,
  CloseShiftResult,
  OpenShiftParams,
  RecordCashMovementParams,
  RecordCashMovementResult,
} from '@/types/rpc'

export const SHIFT_PAGE_SIZE = 30

export const SHIFT_LIST_SELECT = `
  *,
  depot:depots!depot_id(name),
  cashier:staff!cashier_id(full_name),
  closed_staff:staff!closed_by(full_name)
`

export interface ShiftListFilters {
  depotId: string | null
  /** When set (cashiers), list only this cashier's shifts. */
  cashierId?: string | null
  status?: ShiftStatus | null
  /** Inclusive Africa/Abidjan day (YYYY-MM-DD) matched on closed_at. */
  closedOn?: string | null
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
  /**
   * Cash activity on the shift (sales + customer payments − cash refunds), no float.
   * Filled for list rows when running totals are loaded (always for open; optional for closed).
   */
  shift_cash_activity_cfa?: number | null
  /**
   * Expected drawer cash: always live estimate excluding voided sales.
   */
  expected_display_cfa?: number | null
  /** Cash from non-voided sales only (for « dont ventes »). */
  shift_sales_cash_cfa?: number | null
}

export interface ShiftRunningTotals {
  sales_cash_cfa: number
  customer_pmts_cfa: number
  return_cash_cfa: number
  cash_in_cfa?: number
  cash_out_cfa?: number
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
  staff: Pick<Staff, 'role' | 'depot_id' | 'id'> | null | undefined,
  shift: Pick<ShiftListItem, 'depot_id' | 'status' | 'cashier_id'> | null | undefined,
): boolean {
  if (!staff || !shift) return false
  if (shift.status !== 'open') return false
  if (staff.role === 'admin') return true
  if (staff.role === 'cashier') {
    return staff.depot_id === shift.depot_id && shift.cashier_id === staff.id
  }
  return false
}

/** Cashier: own-depot open shifts only. Admin: any accessible open shift. Never auto-select. */
export function canSelectShiftForPos(
  staff: Pick<Staff, 'role' | 'depot_id' | 'id'> | null | undefined,
  shift: Pick<ShiftListItem, 'depot_id' | 'status' | 'cashier_id'> | null | undefined,
): boolean {
  if (!staff || !shift) return false
  if (shift.status !== 'open') return false
  if (staff.role === 'admin') return true
  if (staff.role === 'cashier') {
    return staff.depot_id === shift.depot_id && shift.cashier_id === staff.id
  }
  return false
}

export function authorizedOpenShifts(
  staff: Pick<Staff, 'role' | 'depot_id' | 'id'> | null | undefined,
  shifts: ShiftListItem[] | null | undefined,
): ShiftListItem[] {
  return (shifts ?? []).filter((shift) => canSelectShiftForPos(staff, shift))
}

export function clearStalePosShift(_code: string | null | undefined) {
  // No-op: POS no longer binds an active shift (CEO Notes).
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
  return (
    openingFloat +
    running.sales_cash_cfa +
    running.customer_pmts_cfa +
    (running.cash_in_cfa ?? 0) -
    running.return_cash_cfa -
    (running.cash_out_cfa ?? 0)
  )
}

export function invalidateAfterOpenShift(
  queryClient: {
    invalidateQueries: (opts: {
      queryKey: readonly unknown[]
      refetchType?: 'active' | 'inactive' | 'all' | 'none'
    }) => unknown
  },
) {
  queryClient.invalidateQueries({ queryKey: shiftKeys.lists(), refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: shiftKeys.open(), refetchType: 'active' })
}

export function invalidateAfterCloseShift(
  queryClient: {
    invalidateQueries: (opts: {
      queryKey: readonly unknown[]
      refetchType?: 'active' | 'inactive' | 'all' | 'none'
    }) => unknown
  },
  shiftId: string,
) {
  queryClient.invalidateQueries({ queryKey: shiftKeys.detail(shiftId), refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: shiftKeys.lists(), refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: shiftKeys.open(), refetchType: 'active' })
}

function mapListRow(row: Record<string, unknown>): ShiftListItem {
  const depot = embedOne(row.depot as { name?: string } | { name?: string }[] | null)
  const cashier = embedOne(row.cashier as { full_name?: string } | { full_name?: string }[] | null)
  const closedStaff = embedOne(
    row.closed_staff as { full_name?: string } | { full_name?: string }[] | null,
  )
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

export function emptyShiftRunningTotals(): ShiftRunningTotals {
  return {
    sales_cash_cfa: 0,
    customer_pmts_cfa: 0,
    return_cash_cfa: 0,
    cash_in_cfa: 0,
    cash_out_cfa: 0,
  }
}

export async function fetchShiftRunningTotals(shiftId: string): Promise<ShiftRunningTotals> {
  const map = await fetchShiftRunningTotalsBatch([shiftId])
  return map.get(shiftId) ?? emptyShiftRunningTotals()
}

/** Server-side SUM per shift — do not download sale/payment/return rows. */
export async function fetchShiftRunningTotalsBatch(
  shiftIds: string[],
): Promise<Map<string, ShiftRunningTotals>> {
  const out = new Map<string, ShiftRunningTotals>()
  for (const id of shiftIds) out.set(id, emptyShiftRunningTotals())
  if (shiftIds.length === 0) return out

  const { data, error } = await (supabase.rpc as any)('shift_running_totals_batch', {
    p_shift_ids: shiftIds,
  })
  if (error) throw error

  for (const row of (Array.isArray(data) ? data : []) as Array<{
    shift_id: string
    sales_cash_cfa: number | string
    customer_pmts_cfa: number | string
    return_cash_cfa: number | string
    cash_in_cfa: number | string
    cash_out_cfa: number | string
  }>) {
    if (!row?.shift_id) continue
    out.set(row.shift_id, {
      sales_cash_cfa: Number(row.sales_cash_cfa ?? 0),
      customer_pmts_cfa: Number(row.customer_pmts_cfa ?? 0),
      return_cash_cfa: Number(row.return_cash_cfa ?? 0),
      cash_in_cfa: Number(row.cash_in_cfa ?? 0),
      cash_out_cfa: Number(row.cash_out_cfa ?? 0),
    })
  }
  return out
}

function enrichListWithExpected(
  rows: ShiftListItem[],
  runningById: Map<string, ShiftRunningTotals>,
): ShiftListItem[] {
  return rows.map((row) => {
    const running = runningById.get(row.id) ?? emptyShiftRunningTotals()
    const activity =
      running.sales_cash_cfa +
      running.customer_pmts_cfa +
      (running.cash_in_cfa ?? 0) -
      running.return_cash_cfa -
      (running.cash_out_cfa ?? 0)
    const expectedLive = estimateExpectedCash(row.opening_float_cfa, running)
    return {
      ...row,
      shift_cash_activity_cfa: activity,
      shift_sales_cash_cfa: running.sales_cash_cfa,
      // Always exclude voided sales (live), including closed shifts.
      expected_display_cfa: expectedLive,
      discrepancy_cfa:
        row.status === 'closed' && row.actual_cash_cfa != null
          ? row.actual_cash_cfa - expectedLive
          : row.discrepancy_cfa,
    }
  })
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

  if (filters.cashierId) {
    q = q.eq('cashier_id', filters.cashierId)
  }

  if (filters.status) {
    q = q.eq('status', filters.status)
  }

  if (filters.closedOn) {
    const from = `${filters.closedOn}T00:00:00.000Z`
    const next = new Date(from)
    next.setUTCDate(next.getUTCDate() + 1)
    q = q.gte('closed_at', from).lt('closed_at', next.toISOString())
  }

  const { data, error, count } = await q
    .order('opened_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  const mapped = await fillCashierNames(
    ((data ?? []) as Record<string, unknown>[]).map(mapListRow),
  )
  // Always load activity for the page so open rows show live Attendu / ventes.
  const runningById = await fetchShiftRunningTotalsBatch(mapped.map((r) => r.id))
  return {
    data: enrichListWithExpected(mapped, runningById),
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
  return fillCashierNames(((data ?? []) as Record<string, unknown>[]).map(mapListRow))
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
    staleTime: CACHE_STALE.shiftsList,
    placeholderData: keepPlaceholderWhen((prevKey) => {
      const prev = prevKey[2] as ShiftListFilters | undefined
      return (prev?.depotId ?? null) === (filters.depotId ?? null)
    }),
  })
}

/** Display-only. Must never call setShiftId. */
export function useOpenShifts() {
  return useQuery({
    queryKey: shiftKeys.open(),
    queryFn: fetchOpenShifts,
    staleTime: CACHE_STALE.shiftsList,
  })
}

export function useShiftDetail(id: string | null) {
  return useQuery({
    queryKey: shiftKeys.detail(id ?? ''),
    queryFn: () => fetchShiftDetail(id!),
    enabled: !!id,
    staleTime: CACHE_STALE.shiftsDetail,
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

export interface ShiftCashMovementRow {
  id: string
  shift_id: string
  direction: 'in' | 'out'
  amount_cfa: number
  note: string
  recorded_at: string
}

export async function fetchShiftCashMovements(shiftId: string): Promise<ShiftCashMovementRow[]> {
  const { data, error } = await supabase
    .from('shift_cash_movements')
    .select('id, shift_id, direction, amount_cfa, note, recorded_at')
    .eq('shift_id', shiftId)
    .order('recorded_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as ShiftCashMovementRow[]).map((row) => ({
    ...row,
    amount_cfa: Number(row.amount_cfa),
  }))
}

export function useShiftCashMovements(shiftId: string | null) {
  return useQuery({
    queryKey: [...shiftKeys.detail(shiftId ?? ''), 'cash-movements'] as const,
    queryFn: () => fetchShiftCashMovements(shiftId!),
    enabled: !!shiftId,
    staleTime: CACHE_STALE.shiftsDetail,
  })
}

function bumpShiftRunning(
  running: ShiftRunningTotals,
  direction: 'in' | 'out',
  amount: number,
): ShiftRunningTotals {
  if (direction === 'in') {
    return { ...running, cash_in_cfa: (running.cash_in_cfa ?? 0) + amount }
  }
  return { ...running, cash_out_cfa: (running.cash_out_cfa ?? 0) + amount }
}

/** Update the open shift in memory. A cash movement does not refetch the shift list. */
export function applyCashMovementToShiftCaches(
  queryClient: {
    setQueryData: (
      key: readonly unknown[],
      updater: (current: unknown) => unknown,
    ) => unknown
    setQueriesData: (
      filters: { queryKey: readonly unknown[] },
      updater: (current: unknown) => unknown,
    ) => unknown
  },
  movement: {
    movement_id: string
    shift_id: string
    direction: 'in' | 'out'
    amount_cfa: number
    note: string
  },
) {
  const amount = Number(movement.amount_cfa)
  const delta = movement.direction === 'in' ? amount : -amount

  queryClient.setQueryData(shiftKeys.detail(movement.shift_id), (current) => {
    if (!current || typeof current !== 'object' || !('running' in current)) return current
    const detail = current as ShiftDetailData
    const running = bumpShiftRunning(detail.running, movement.direction, amount)
    return {
      ...detail,
      running,
      shift_cash_activity_cfa: (detail.shift_cash_activity_cfa ?? 0) + delta,
      expected_display_cfa: estimateExpectedCash(detail.opening_float_cfa, running),
    }
  })

  queryClient.setQueriesData({ queryKey: shiftKeys.lists() }, (current) => {
    if (!current || typeof current !== 'object' || !('data' in current)) return current
    const page = current as { data: ShiftListItem[] }
    if (!Array.isArray(page.data)) return current
    return {
      ...page,
      data: page.data.map((row) => {
        if (row.id !== movement.shift_id) return row
        const base = row.expected_display_cfa ?? row.expected_cash_cfa ?? row.opening_float_cfa
        return {
          ...row,
          shift_cash_activity_cfa: (row.shift_cash_activity_cfa ?? 0) + delta,
          expected_display_cfa: base + delta,
        }
      }),
    }
  })

  queryClient.setQueryData(
    [...shiftKeys.detail(movement.shift_id), 'cash-movements'],
    (current) => {
      if (!Array.isArray(current)) return current
      if (current.some((row) => row?.id === movement.movement_id)) return current
      return [
        ...current,
        {
          id: movement.movement_id,
          shift_id: movement.shift_id,
          direction: movement.direction,
          amount_cfa: amount,
          note: movement.note,
          recorded_at: new Date().toISOString(),
        },
      ]
    },
  )
}

export function useRecordCashMovement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: RecordCashMovementParams): Promise<RecordCashMovementResult> => {
      const result = await rpc.recordCashMovement(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (data) => {
      applyCashMovementToShiftCaches(queryClient, data)
    },
  })
}
