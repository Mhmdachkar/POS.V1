import { rpc } from '@/lib/rpc'
import { fetchBusinessSettings } from '@/hooks/useBusinessSettings'
import { supabase } from '@/lib/supabase'
import {
  openCustomerStatementWhatsApp,
  printCustomerStatementPdf,
  statementDatasetFromSources,
  type CustomerStatementDataset,
} from '@/lib/customerStatement'

export async function loadCustomerStatement(opts: {
  customer: {
    id: string
    name: string
    phone: string | null
    address: string | null
    balance_owed_cfa: number
  }
  depotId?: string | null
  periodFromYmd?: string | null
  periodToYmd?: string | null
}): Promise<CustomerStatementDataset> {
  const [ledgerRes, settings] = await Promise.all([
    rpc.customerLedger(opts.customer.id),
    fetchBusinessSettings(),
  ])
  if (ledgerRes.error) throw ledgerRes.error

  let depotName: string | null = null
  let depotAddress: string | null = null
  if (opts.depotId) {
    const { data } = await supabase
      .from('depots')
      .select('name, location')
      .eq('id', opts.depotId)
      .maybeSingle()
    const depot = data as { name: string; location: string } | null
    depotName = depot?.name ?? null
    depotAddress = depot?.location ?? null
  }

  return statementDatasetFromSources({
    customer: opts.customer,
    ledgerOldestFirst: ledgerRes.data ?? [],
    businessName: settings.business_name,
    logoUrl: settings.logo_url,
    depotName,
    depotAddress,
    periodFromYmd: opts.periodFromYmd,
    periodToYmd: opts.periodToYmd,
  })
}

export async function exportCustomerStatement(
  opts: Parameters<typeof loadCustomerStatement>[0] & { mode: 'pdf' | 'whatsapp' },
): Promise<CustomerStatementDataset> {
  const dataset = await loadCustomerStatement(opts)
  if (opts.mode === 'pdf') printCustomerStatementPdf(dataset)
  else {
    printCustomerStatementPdf(dataset)
    openCustomerStatementWhatsApp(dataset)
  }
  return dataset
}