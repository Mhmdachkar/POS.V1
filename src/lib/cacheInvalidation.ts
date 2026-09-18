export interface CacheInvalidator {
  invalidateQueries: (opts: {
    queryKey: readonly unknown[]
    refetchType?: 'active' | 'inactive' | 'all' | 'none'
  }) => unknown
}

/** Mark reports/dashboard stale; refetch only mounted observers (14B-2). */
export function markReportsAndDashboardStale(queryClient: CacheInvalidator) {
  queryClient.invalidateQueries({ queryKey: ['reports'], refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'active' })
}

/** Refresh POS catalog / product stock after concurrent stock change. */
export function refreshPosCatalogStock(queryClient: CacheInvalidator) {
  queryClient.invalidateQueries({ queryKey: ['products'] })
  queryClient.invalidateQueries({ queryKey: ['inventory', 'list'] })
  queryClient.invalidateQueries({ queryKey: ['inventory', 'stock-activity'] })
}

export function invalidateAfterSaleSettled(
  queryClient: CacheInvalidator,
  opts?: {
    saleId?: string | null
    customerId?: string | null
    shiftId?: string | null
  },
) {
  refreshPosCatalogStock(queryClient)
  queryClient.invalidateQueries({ queryKey: ['sales', 'list'] })
  queryClient.invalidateQueries({ queryKey: ['print_jobs'] })
  queryClient.invalidateQueries({ queryKey: ['depot', 'overview'] })
  if (opts?.saleId) {
    queryClient.invalidateQueries({ queryKey: ['sales', 'detail', opts.saleId] })
    queryClient.invalidateQueries({ queryKey: ['print_jobs', 'sale', opts.saleId] })
  }
  queryClient.invalidateQueries({ queryKey: ['customers'] })
  if (opts?.customerId) {
    queryClient.invalidateQueries({ queryKey: ['customers', 'detail', opts.customerId] })
  }
  queryClient.invalidateQueries({ queryKey: ['shifts', 'list'] })
  queryClient.invalidateQueries({ queryKey: ['shifts', 'open'] })
  if (opts?.shiftId) {
    queryClient.invalidateQueries({ queryKey: ['shifts', 'detail', opts.shiftId] })
  }
  markReportsAndDashboardStale(queryClient)
}

export function invalidateAfterFulfillmentRelease(
  queryClient: CacheInvalidator,
  saleId: string,
) {
  queryClient.invalidateQueries({ queryKey: ['sales', 'list'] })
  queryClient.invalidateQueries({ queryKey: ['sales', 'detail', saleId] })
  queryClient.invalidateQueries({ queryKey: ['depot', 'overview'] })
}
