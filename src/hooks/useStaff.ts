import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { edge } from '@/lib/edge'
import { CACHE_STALE } from '@/lib/cachePolicy'
import { ADMIN } from '@/lib/bilingual/admin'
import { t } from '@/lib/bilingual/types'
import type { Staff } from '@/types/database'
import type { AdminStaffRole, CreateStaffEdgePayload, UpdateStaffEdgePayload } from '@/types/rpc'

export const staffKeys = {
  all: ['staff'] as const,
  list: (filters: StaffListFilters) => ['staff', 'list', filters] as const,
  detail: (id: string) => ['staff', 'detail', id] as const,
}

export type StaffStatusFilter = 'all' | 'active' | 'inactive'
export type StaffRoleFilter = 'all' | AdminStaffRole

export interface StaffListFilters {
  page: number
  pageSize: number
  search: string
  status: StaffStatusFilter
  role: StaffRoleFilter
}

export interface StaffListResult {
  data: Staff[]
  count: number
}

export async function fetchStaffList(filters: StaffListFilters): Promise<StaffListResult> {
  const from = filters.page * filters.pageSize
  const to = from + filters.pageSize - 1

  let q = supabase
    .from('staff')
    .select('*', { count: 'exact' })
    .order('full_name')
    .range(from, to)

  if (filters.search.trim()) {
    const term = filters.search.trim()
    q = q.or(`full_name.ilike.%${term}%,username.ilike.%${term}%`)
  }
  if (filters.status === 'active') q = q.eq('is_active', true)
  if (filters.status === 'inactive') q = q.eq('is_active', false)
  if (filters.role !== 'all') q = q.eq('role', filters.role)

  const { data, error, count } = await q
  if (error) throw error
  return { data: (data ?? []) as Staff[], count: count ?? 0 }
}

export async function fetchStaff(id: string): Promise<Staff> {
  const { data, error } = await supabase.from('staff').select('*').eq('id', id).single()
  if (error) throw error
  return data as Staff
}

export function useStaffList(filters: StaffListFilters) {
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300)
    return () => clearTimeout(timer)
  }, [filters.search])

  const queryFilters = { ...filters, search: debouncedSearch }

  return useQuery({
    queryKey: staffKeys.list(queryFilters),
    queryFn: () => fetchStaffList(queryFilters),
    staleTime: CACHE_STALE.staffList,
    placeholderData: (prev) => prev,
  })
}

export function useStaff(id: string | null) {
  return useQuery({
    queryKey: staffKeys.detail(id ?? ''),
    queryFn: () => fetchStaff(id!),
    enabled: !!id,
    staleTime: CACHE_STALE.staffDetail,
  })
}

function invalidateStaff(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown },
  staffId?: string,
) {
  queryClient.invalidateQueries({ queryKey: staffKeys.all })
  if (staffId) queryClient.invalidateQueries({ queryKey: staffKeys.detail(staffId) })
}

export function useCreateStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateStaffEdgePayload) => {
      const result = await edge.createStaff(payload)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => invalidateStaff(queryClient),
  })
}

export function useUpdateStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UpdateStaffEdgePayload) => {
      const result = await edge.updateStaff(payload)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, variables) => invalidateStaff(queryClient, variables.staff_id),
  })
}

export function useDeactivateStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (staffId: string) => {
      const result = await edge.deactivateStaff(staffId)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, staffId) => invalidateStaff(queryClient, staffId),
  })
}

export function useReactivateStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (staffId: string) => {
      const result = await edge.reactivateStaff(staffId)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, staffId) => invalidateStaff(queryClient, staffId),
  })
}

export function roleLabel(role: string): string {
  if (role === 'admin') return t(ADMIN.roleAdmin)
  if (role === 'depot_staff') return t(ADMIN.roleDepotStaff)
  return t(ADMIN.roleCashier)
}
