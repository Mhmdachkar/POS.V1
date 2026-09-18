import { useMutation, useQueryClient } from '@tanstack/react-query'
import { rpc } from '@/lib/rpc'
import { inventoryKeys, invalidateAfterStockMutation } from '@/hooks/useInventory'
import { productKeys } from '@/hooks/useProducts'
import { productPerfMark, productPerfMeasure } from '@/lib/productPerf'
import type { CacheInvalidator } from '@/lib/cacheInvalidation'
import type { CreateProductParams, UpdateProductParams } from '@/types/rpc'

/**
 * After create_product succeeds: refresh the inventory list and POS catalog /
 * stock alerts. Does not touch reports/dashboard (stock is still 0).
 * Callers must not await this from mutation onSuccess — fire-and-forget so
 * mutateAsync resolves when the RPC returns.
 */
export function invalidateAfterProductCreate(queryClient: CacheInvalidator): void {
  queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() })
  queryClient.invalidateQueries({ queryKey: productKeys.searches() })
  queryClient.invalidateQueries({ queryKey: productKeys.stockAlertsAll() })
}

/**
 * After update/deactivate/reactivate: reuse stock-mutation invalidation
 * (list, detail, activity, catalog searches, low-stock alerts, reports).
 */
export function invalidateAfterProductUpdate(
  queryClient: CacheInvalidator,
  productId: string,
): void {
  invalidateAfterStockMutation(queryClient, productId)
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: CreateProductParams) => {
      productPerfMark('create_product:rpc:start')
      const result = await rpc.createProduct(params)
      productPerfMark('create_product:rpc:end')
      productPerfMeasure('create_product:rpc', 'create_product:rpc:start', 'create_product:rpc:end')
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => {
      productPerfMark('create_product:invalidate:start')
      invalidateAfterProductCreate(queryClient)
      productPerfMark('create_product:invalidate:queued')
    },
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
    onSuccess: (_, variables) => {
      invalidateAfterProductUpdate(queryClient, variables.p_product_id)
    },
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
    onSuccess: (_, productId) => {
      invalidateAfterProductUpdate(queryClient, productId)
    },
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
    onSuccess: (_, productId) => {
      invalidateAfterProductUpdate(queryClient, productId)
    },
  })
}

export function isHttpsUrl(value: string): boolean {
  return /^https:\/\//.test(value)
}
