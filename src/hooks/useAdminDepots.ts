import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { rpc } from '@/lib/rpc'
import { depotOptionKeys } from '@/hooks/useInventory'
import type { Depot } from '@/types/database'
import type { CreateDepotParams, UpdateDepotParams } from '@/types/rpc'

export const adminDepotKeys = {
  all: ['admin-depots'] as const,
  list: (filters: AdminDepotFilters) => ['admin-depots', 'list', filters] as const,
  detail: (id: string) => ['admin-depots', 'detail', id] as const,
}

export interface AdminDepotFilters {
  page: number
  pageSize: number
  search: string
  status: 'all' | 'active' | 'inactive'
}

export async function fetchAdminDepotList(
  filters: AdminDepotFilters,
): Promise<{ data: Depot[]; count: number }> {
  const from = filters.page * filters.pageSize
  const to = from + filters.pageSize - 1

  let q = supabase
    .from('depots')
    .select('*', { count: 'exact' })
    .order('name')
    .range(from, to)

  if (filters.search.trim()) {
    const term = filters.search.trim()
    q = q.or(`name.ilike.%${term}%,code.ilike.%${term}%,location.ilike.%${term}%`)
  }
  if (filters.status === 'active') q = q.eq('is_active', true)
  if (filters.status === 'inactive') q = q.eq('is_active', false)

  const { data, error, count } = await q
  if (error) throw error
  return { data: (data ?? []) as Depot[], count: count ?? 0 }
}

export async function fetchAdminDepot(id: string): Promise<Depot> {
  const { data, error } = await supabase.from('depots').select('*').eq('id', id).single()
  if (error) throw error
  return data as Depot
}

export function useAdminDepotList(filters: AdminDepotFilters) {
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300)
    return () => clearTimeout(t)
  }, [filters.search])

  const queryFilters = { ...filters, search: debouncedSearch }
  return useQuery({
    queryKey: adminDepotKeys.list(queryFilters),
    queryFn: () => fetchAdminDepotList(queryFilters),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  })
}

export function useAdminDepot(id: string | null) {
  return useQuery({
    queryKey: adminDepotKeys.detail(id ?? ''),
    queryFn: () => fetchAdminDepot(id!),
    enabled: !!id,
  })
}

function invalidateDepots(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown },
) {
  queryClient.invalidateQueries({ queryKey: adminDepotKeys.all })
  queryClient.invalidateQueries({ queryKey: depotOptionKeys.all })
}

export function useCreateDepot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: CreateDepotParams) => {
      const result = await rpc.createDepot(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => invalidateDepots(queryClient),
  })
}

export function useUpdateDepot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: UpdateDepotParams) => {
      const result = await rpc.updateDepot(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => invalidateDepots(queryClient),
  })
}

export function useDeactivateDepot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (depotId: string) => {
      const result = await rpc.deactivateDepot(depotId)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => invalidateDepots(queryClient),
  })
}

export function useReactivateDepot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (depotId: string) => {
      const result = await rpc.reactivateDepot(depotId)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => invalidateDepots(queryClient),
  })
}
