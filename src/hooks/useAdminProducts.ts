import { useMutation, useQueryClient } from '@tanstack/react-query'
import { rpc } from '@/lib/rpc'
import { inventoryKeys, invalidateAfterStockMutation } from '@/hooks/useInventory'
import { productKeys } from '@/hooks/useProducts'
import type { CreateProductParams, UpdateProductParams } from '@/types/rpc'

function invalidateProducts(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown },
  productId?: string,
) {
  queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() })
  queryClient.invalidateQueries({ queryKey: productKeys.all })
  if (productId) invalidateAfterStockMutation(queryClient, productId)
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: CreateProductParams) => {
      const result = await rpc.createProduct(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => invalidateProducts(queryClient),
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: UpdateProductParams) => {
      const result = await rpc.updateProduct(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, variables) => invalidateProducts(queryClient, variables.p_product_id),
  })
}

export function useDeactivateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (productId: string) => {
      const result = await rpc.deactivateProduct(productId)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, productId) => invalidateProducts(queryClient, productId),
  })
}

export function useReactivateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (productId: string) => {
      const result = await rpc.reactivateProduct(productId)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_, productId) => invalidateProducts(queryClient, productId),
  })
}

export function isHttpsUrl(value: string): boolean {
  return /^https:\/\//.test(value)
}
