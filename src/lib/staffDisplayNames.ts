import { supabase } from '@/lib/supabase'

/** Fill cashier display names the staff RLS would hide. Missing RPC is ignored. */
export async function fillCashierNames<T extends { cashier_id: string | null; cashier_name: string | null }>(
  rows: T[],
): Promise<T[]> {
  const missing = [...new Set(rows.filter((row) => row.cashier_id && !row.cashier_name).map((row) => row.cashier_id as string))]
  if (missing.length === 0) return rows
  const { data, error } = await supabase.rpc('staff_display_names', { p_ids: missing })
  if (error || !Array.isArray(data)) return rows
  const names = new Map(
    (data as Array<{ id: string; full_name: string | null }>).map((row) => [row.id, row.full_name]),
  )
  return rows.map((row) => {
    if (row.cashier_name || !row.cashier_id) return row
    return { ...row, cashier_name: names.get(row.cashier_id) ?? null }
  })
}
