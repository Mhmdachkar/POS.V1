import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rpc } from '@/lib/rpc'
import { categoryKeys } from '@/hooks/useInventory'
import type { Category } from '@/types/database'
import type { CreateCategoryParams, UpdateCategoryParams } from '@/types/rpc'

export const adminCategoryKeys = {
  all: ['admin-categories'] as const,
  tree: ['admin-categories', 'tree'] as const,
}

export async function fetchAllCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, parent_id, is_active, created_at')
    .order('name')
  if (error) throw error
  return (data ?? []) as Category[]
}

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[]
}

export function buildCategoryTree(rows: Category[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>()
  rows.forEach((row) => byId.set(row.id, { ...row, children: [] }))
  const roots: CategoryTreeNode[] = []
  byId.forEach((node) => {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  const sortNodes = (nodes: CategoryTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    nodes.forEach((n) => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}

export function flattenTree(nodes: CategoryTreeNode[], depth = 0): Array<CategoryTreeNode & { depth: number }> {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flattenTree(node.children, depth + 1),
  ])
}

export function findCategoryPath(
  nodes: CategoryTreeNode[],
  id: string,
  trail: CategoryTreeNode[] = [],
): CategoryTreeNode[] | null {
  for (const node of nodes) {
    const next = [...trail, node]
    if (node.id === id) return next
    const found = findCategoryPath(node.children, id, next)
    if (found) return found
  }
  return null
}

export interface CategoryProductRow {
  id: string
  name: string
  photo_url: string
  is_active: boolean
  current_stock_pieces: number
  depot_id: string
  depot_name: string
}

export async function fetchProductsForCategory(categoryId: string): Promise<CategoryProductRow[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, photo_url, is_active, current_stock_pieces, depot_id, depots(name)')
    .eq('category_id', categoryId)
    .order('name')
  if (error) throw error

  return ((data ?? []) as Array<{
    id: string
    name: string
    photo_url: string
    is_active: boolean
    current_stock_pieces: number
    depot_id: string
    depots: { name: string } | { name: string }[] | null
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    photo_url: row.photo_url,
    is_active: row.is_active,
    current_stock_pieces: row.current_stock_pieces,
    depot_id: row.depot_id,
    depot_name: Array.isArray(row.depots) ? (row.depots[0]?.name ?? '') : (row.depots?.name ?? ''),
  }))
}

export function useCategoryProducts(categoryId: string | null) {
  return useQuery({
    queryKey: [...adminCategoryKeys.all, 'products', categoryId] as const,
    queryFn: () => fetchProductsForCategory(categoryId!),
    enabled: !!categoryId,
    staleTime: 15_000,
  })
}

export function useAdminCategoryTree() {
  return useQuery({
    queryKey: adminCategoryKeys.tree,
    queryFn: fetchAllCategories,
    staleTime: 30_000,
    select: buildCategoryTree,
  })
}

export function useAdminCategoryList() {
  return useQuery({
    queryKey: adminCategoryKeys.tree,
    queryFn: fetchAllCategories,
    staleTime: 30_000,
  })
}

function invalidateCategories(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown },
) {
  queryClient.invalidateQueries({ queryKey: adminCategoryKeys.all })
  queryClient.invalidateQueries({ queryKey: categoryKeys.all })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: CreateCategoryParams) => {
      const result = await rpc.createCategory(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => invalidateCategories(queryClient),
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: UpdateCategoryParams) => {
      const result = await rpc.updateCategory(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => invalidateCategories(queryClient),
  })
}

export function useDeactivateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const result = await rpc.deactivateCategory(categoryId)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => invalidateCategories(queryClient),
  })
}

export function useReactivateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const result = await rpc.reactivateCategory(categoryId)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => invalidateCategories(queryClient),
  })
}
