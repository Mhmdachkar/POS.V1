import { useQuery } from '@tanstack/react-query'
import { rpc } from '@/lib/rpc'
import type {
  AdminCashReport,
  AdminCustomersReport,
  AdminInventoryReport,
  AdminReportParams,
  AdminSalesReport,
} from '@/types/rpc'

export const reportKeys = {
  all: ['reports'] as const,
  sales: (p: AdminReportParams) => ['reports', 'sales', p] as const,
  inventory: (p: AdminReportParams) => ['reports', 'inventory', p] as const,
  customers: (p: AdminReportParams) => ['reports', 'customers', p] as const,
  cash: (p: AdminReportParams) => ['reports', 'cash', p] as const,
}

function toParams(
  depotId: string | null,
  startDate: string,
  endDate: string,
): AdminReportParams {
  return {
    p_depot_id: depotId,
    p_start_date: startDate,
    p_end_date: endDate,
  }
}

export function useSalesReport(depotId: string | null, startDate: string, endDate: string) {
  const params = toParams(depotId, startDate, endDate)
  return useQuery({
    queryKey: reportKeys.sales(params),
    queryFn: async (): Promise<AdminSalesReport> => {
      const result = await rpc.adminReportSales(params)
      if (result.error) throw result.error
      return result.data
    },
    staleTime: 60_000,
  })
}

export function useInventoryReport(depotId: string | null, startDate: string, endDate: string) {
  const params = toParams(depotId, startDate, endDate)
  return useQuery({
    queryKey: reportKeys.inventory(params),
    queryFn: async (): Promise<AdminInventoryReport> => {
      const result = await rpc.adminReportInventory(params)
      if (result.error) throw result.error
      return result.data
    },
    staleTime: 60_000,
  })
}

export function useCustomersReport(depotId: string | null, startDate: string, endDate: string) {
  const params = toParams(depotId, startDate, endDate)
  return useQuery({
    queryKey: reportKeys.customers(params),
    queryFn: async (): Promise<AdminCustomersReport> => {
      const result = await rpc.adminReportCustomers(params)
      if (result.error) throw result.error
      return result.data
    },
    staleTime: 60_000,
  })
}

export function useCashReport(depotId: string | null, startDate: string, endDate: string) {
  const params = toParams(depotId, startDate, endDate)
  return useQuery({
    queryKey: reportKeys.cash(params),
    queryFn: async (): Promise<AdminCashReport> => {
      const result = await rpc.adminReportCash(params)
      if (result.error) throw result.error
      return result.data
    },
    staleTime: 60_000,
  })
}
