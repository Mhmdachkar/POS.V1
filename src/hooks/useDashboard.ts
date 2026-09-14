import { useQuery } from '@tanstack/react-query'
import { rpc } from '@/lib/rpc'
import type { AdminDashboardSummary } from '@/types/rpc'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: (depotId: string | null) => ['dashboard', 'summary', depotId] as const,
}

export async function fetchDashboardSummary(depotId: string | null): Promise<AdminDashboardSummary> {
  const result = await rpc.adminDashboardSummary(depotId)
  if (result.error) throw result.error
  return result.data
}

export function useDashboardSummary(depotId: string | null) {
  return useQuery({
    queryKey: dashboardKeys.summary(depotId),
    queryFn: () => fetchDashboardSummary(depotId),
    staleTime: 30_000,
  })
}
