/**
 * Shared product search: match by name and/or unit serial_number.
 */

import { supabase } from '@/lib/supabase'

const DEFAULT_LIMIT = 500

/** Product IDs whose any unit serial_number matches (case-insensitive). */
export async function findProductIdsBySerial(
  serialQuery: string,
  limit = DEFAULT_LIMIT,
): Promise<string[]> {
  const trimmed = serialQuery.trim()
  if (!trimmed) return []

  const { data, error } = await supabase
    .from('product_units')
    .select('product_id')
    .ilike('serial_number', `%${trimmed}%`)
    .limit(limit)

  if (error) throw error
  return [...new Set((data ?? []).map((row) => String(row.product_id)))]
}

/**
 * Product IDs matching name or serial. Optional depot scope applies to both.
 */
export async function findProductIdsMatchingNameOrSerial(
  search: string,
  options?: { depotId?: string | null; limit?: number },
): Promise<string[]> {
  const trimmed = search.trim()
  if (!trimmed) return []

  const limit = options?.limit ?? DEFAULT_LIMIT
  const depotId = options?.depotId ?? null

  let nameQuery = supabase
    .from('products')
    .select('id')
    .ilike('name', `%${trimmed}%`)
    .limit(limit)

  if (depotId) {
    nameQuery = nameQuery.eq('depot_id', depotId)
  }

  const [{ data: nameRows, error: nameError }, serialIds] = await Promise.all([
    nameQuery,
    findProductIdsBySerial(trimmed, limit),
  ])

  if (nameError) throw nameError

  let scopedSerialIds = serialIds
  if (depotId && serialIds.length > 0) {
    const { data: depotRows, error: depotError } = await supabase
      .from('products')
      .select('id')
      .eq('depot_id', depotId)
      .in('id', serialIds)
    if (depotError) throw depotError
    scopedSerialIds = (depotRows ?? []).map((row) => String(row.id))
  }

  return [
    ...new Set([
      ...(nameRows ?? []).map((row) => String(row.id)),
      ...scopedSerialIds,
    ]),
  ]
}

/** PostgREST `.or()` filter: name ilike and/or id in serial matches. */
export function nameOrSerialOrFilter(trimmed: string, serialProductIds: string[]): string {
  if (serialProductIds.length === 0) {
    return `name.ilike.%${trimmed}%`
  }
  return `name.ilike.%${trimmed}%,id.in.(${serialProductIds.join(',')})`
}
