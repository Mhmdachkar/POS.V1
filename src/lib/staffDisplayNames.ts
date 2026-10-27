import { supabase } from '@/lib/supabase'
import { assertKnownRpc } from '@/lib/rpcSignatures'

type StaffDisplayNameRow = { id: string; full_name: string | null }

/** Same rpc() cast as callRpc — Database tables are not GenericSchema-complete. */
export async function fetchStaffDisplayNameMap(ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()
  assertKnownRpc('staff_display_names')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('staff_display_names', { p_ids: unique })
  if (error || !Array.isArray(data)) return new Map()
  return new Map((data as StaffDisplayNameRow[]).map((row) => [row.id, row.full_name]))
}

/** Fill cashier display names the staff RLS would hide. Missing RPC is ignored. */
export async function fillCashierNames<T extends { cashier_id: string | null; cashier_name: string | null }>(
  rows: T[],
): Promise<T[]> {
  const missing = [...new Set(rows.filter((row) => row.cashier_id && !row.cashier_name).map((row) => row.cashier_id as string))]
  if (missing.length === 0) return rows
  const names = await fetchStaffDisplayNameMap(missing)
  if (names.size === 0) return rows
  return rows.map((row) => {
    if (row.cashier_name || !row.cashier_id) return row
    return { ...row, cashier_name: names.get(row.cashier_id) ?? null }
  })
}
