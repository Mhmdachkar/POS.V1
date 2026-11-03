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
  queryClient.invalidateQueries({ queryKey: ['products'], refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: ['inventory', 'list'], refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: ['inventory', 'stock-activity'], refetchType: 'active' })
}

export function invalidateAfterSaleSettled(
  queryClient: CacheInvalidator,
  opts?: {
    saleId?: string | null
    customerId?: string | null
    shiftId?: string | null
    proformaId?: string | null
  },
) {
  refreshPosCatalogStock(queryClient)
  queryClient.invalidateQueries({ queryKey: ['sales', 'list'], refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: ['depot', 'overview'], refetchType: 'active' })
  if (opts?.saleId) {
    queryClient.invalidateQueries({
      queryKey: ['sales', 'detail', opts.saleId],
      refetchType: 'active',
    })
    queryClient.invalidateQueries({ queryKey: ['print_jobs', 'sale', opts.saleId] })
  }
  if (opts?.customerId) {
    const id = opts.customerId
    queryClient.invalidateQueries({ queryKey: ['customers', 'detail', id] })
    queryClient.invalidateQueries({ queryKey: ['customers', 'activity', id] })
    queryClient.invalidateQueries({ queryKey: ['customers', 'activity-summary', id] })
    queryClient.invalidateQueries({ queryKey: ['customers', 'ledger-balance', id] })
    queryClient.invalidateQueries({ queryKey: ['customers', 'payments', id] })
    queryClient.invalidateQueries({ queryKey: ['customers', 'list'], refetchType: 'active' })
    queryClient.invalidateQueries({ queryKey: ['customers', 'search'], refetchType: 'active' })
    queryClient.invalidateQueries({ queryKey: ['payments'], refetchType: 'active' })
  }
  queryClient.invalidateQueries({ queryKey: ['shifts', 'open'], refetchType: 'active' })
  if (opts?.shiftId) {
    queryClient.invalidateQueries({ queryKey: ['shifts', 'detail', opts.shiftId] })
    queryClient.invalidateQueries({ queryKey: ['shifts', 'list'], refetchType: 'active' })
  }
  markReportsAndDashboardStale(queryClient)
  if (opts?.proformaId) {
    queryClient.invalidateQueries({ queryKey: ['proformas'], refetchType: 'active' })
    queryClient.invalidateQueries({ queryKey: ['proformas', 'detail', opts.proformaId] })
  }
}

export function invalidateAfterFulfillmentRelease(
  queryClient: CacheInvalidator,
  saleId: string,
) {
  queryClient.invalidateQueries({ queryKey: ['sales', 'list'] })
  queryClient.invalidateQueries({ queryKey: ['sales', 'detail', saleId] })
  queryClient.invalidateQueries({ queryKey: ['depot', 'overview'] })
}
