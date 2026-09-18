import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rpc } from '@/lib/rpc'
import type { PrintJobRow } from '@/lib/printPayload'

export const printJobKeys = {
  all: ['print_jobs'] as const,
  forSale: (saleId: string) => ['print_jobs', 'sale', saleId] as const,
}

export async function fetchPrintJobsForSale(saleId: string): Promise<PrintJobRow[]> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('sale_id', saleId)
    .order('destination')

  if (error) throw error
  return (data ?? []) as PrintJobRow[]
}

export function usePrintJobsForSale(saleId: string | null) {
  return useQuery({
    queryKey: printJobKeys.forSale(saleId ?? ''),
    queryFn: () => fetchPrintJobsForSale(saleId!),
    enabled: !!saleId,
  })
}

export function useInvalidatePrintJobs() {
  const queryClient = useQueryClient()
  return (saleId?: string | null) => {
    queryClient.invalidateQueries({ queryKey: printJobKeys.all })
    if (saleId) {
      queryClient.invalidateQueries({ queryKey: printJobKeys.forSale(saleId) })
    }
  }
}

export async function requeuePrintJob(jobId: string) {
  return rpc.requeuePrintJob({ p_job_id: jobId })
}

export async function releaseSaleFulfillment(saleId: string) {
  return rpc.releaseSaleFulfillment({ p_sale_id: saleId })
}
