import { rpc } from '@/lib/rpc'
import { fetchBusinessSettings } from '@/hooks/useBusinessSettings'
import { supabase } from '@/lib/supabase'
import {
  printSupplierStatementPdf,
  statementDatasetFromSources,
  todayYmdAbidjan,
  type SupplierStatementDataset,
} from '@/lib/supplierStatement'
import { DISPLAY_TIME_ZONE } from '@/lib/formatters'
import { asSupplierLedgerRows } from '@/lib/supplierLedger'

function ymdFirstLedger(ledger: { occurred_at: string }[]): string | null {
  if (ledger.length === 0) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ledger[0]!.occurred_at))
}

export async function loadSupplierStatement(opts: {
  supplier: {
    id: string
    name: string
    phone: string | null
    address: string | null
    balance_owed_cfa: number
  }
  depotId?: string | null
  periodFromYmd?: string | null
  periodToYmd?: string | null
  defaultPeriodWhenEmpty?: boolean
}): Promise<SupplierStatementDataset> {
  const [ledgerRes, settings] = await Promise.all([
    rpc.supplierLedger(opts.supplier.id),
    fetchBusinessSettings(),
  ])
  if (ledgerRes.error) throw ledgerRes.error

  const ledgerOldestFirst = asSupplierLedgerRows(ledgerRes.data)
  let periodFromYmd = opts.periodFromYmd ?? null
  let periodToYmd = opts.periodToYmd ?? null
  if (
    opts.defaultPeriodWhenEmpty &&
    periodFromYmd == null &&
    periodToYmd == null &&
    ledgerOldestFirst.length > 0
  ) {
    periodFromYmd = ymdFirstLedger(ledgerOldestFirst)
    periodToYmd = todayYmdAbidjan()
  }

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
    supplier: opts.supplier,
    ledgerOldestFirst,
    businessName: settings.business_name,
    logoUrl: settings.logo_url,
    businessPhone: settings.phone,
    businessAddress: settings.address,
    depotName,
    depotAddress,
    periodFromYmd,
    periodToYmd,
  })
}

export async function exportSupplierStatement(
  opts: Parameters<typeof loadSupplierStatement>[0],
): Promise<SupplierStatementDataset> {
  const dataset = await loadSupplierStatement({
    ...opts,
    defaultPeriodWhenEmpty: true,
  })
  printSupplierStatementPdf(dataset)
  return dataset
}
