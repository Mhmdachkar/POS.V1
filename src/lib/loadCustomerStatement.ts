import { rpc } from '@/lib/rpc'
import { fetchBusinessSettings } from '@/hooks/useBusinessSettings'
import { supabase } from '@/lib/supabase'
import {
  openCustomerStatementWhatsApp,
  printCustomerStatementPdf,
  statementDatasetFromSources,
  todayYmdAbidjan,
  type CustomerStatementDataset,
} from '@/lib/customerStatement'
import { DISPLAY_TIME_ZONE } from '@/lib/formatters'

function ymdFirstLedger(ledger: { occurred_at: string }[]): string | null {
  if (ledger.length === 0) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ledger[0]!.occurred_at))
}

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
  /** When true and dates omitted, use first ledger movement through today (Abidjan). */
  defaultPeriodWhenEmpty?: boolean
}): Promise<CustomerStatementDataset> {
  const [ledgerRes, settings] = await Promise.all([
    rpc.customerLedger(opts.customer.id),
    fetchBusinessSettings(),
  ])
  if (ledgerRes.error) throw ledgerRes.error

  const ledgerOldestFirst = ledgerRes.data ?? []
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
    customer: opts.customer,
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

export async function exportCustomerStatement(
  opts: Parameters<typeof loadCustomerStatement>[0] & { mode: 'pdf' | 'whatsapp' },
): Promise<CustomerStatementDataset> {
  const dataset = await loadCustomerStatement({
    ...opts,
    defaultPeriodWhenEmpty: opts.mode === 'pdf' || opts.mode === 'whatsapp',
  })
  if (opts.mode === 'pdf') printCustomerStatementPdf(dataset)
  else {
    printCustomerStatementPdf(dataset)
    openCustomerStatementWhatsApp(dataset)
  }
  return dataset
}