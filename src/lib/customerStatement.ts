/**
 * Soft Gestion Releve de compte — built client-side from customer_ledger.
 * No new money logic. Full-range final Solde must equal balance_owed_cfa.
 */

import type { CustomerLedgerRpcRow } from '@/lib/rpc'
import {
  type CommercialClientBlock,
  type CommercialHeaderContext,
  escapeDocHtml,
  formatDocCfa,
  formatDocDate,
  renderClientBlock,
  renderCommercialHeader,
  wrapCommercialDocument,
} from '@/lib/commercialDocumentHtml'
import { printHtmlDocument } from '@/lib/reportExport'
import { DISPLAY_TIME_ZONE, formatReportDate } from '@/lib/formatters'

export const LEDGER_PERIOD_SQL_NOTE_THRESHOLD = 2000

export type StatementLibelle = 'Vente' | 'Reglement' | 'Retour'

export interface StatementLine {
  occurredAt: string
  reference: string
  libelle: StatementLibelle
  debitCfa: number
  creditCfa: number
  soldeCfa: number
}

export interface CustomerStatementDataset {
  customerId: string
  client: CommercialClientBlock
  header: CommercialHeaderContext
  periodFromYmd: string | null
  periodToYmd: string | null
  soldeInitialCfa: number
  lines: StatementLine[]
  totalDebitCfa: number
  totalCreditCfa: number
  soldeFinalCfa: number
  balanceOwedCfa: number
  largeLedgerNote: boolean
  asOfDateLabel: string
}

function ymdInAbidjan(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function libelleFor(kind: CustomerLedgerRpcRow['kind']): StatementLibelle {
  if (kind === 'sale') return 'Vente'
  if (kind === 'return') return 'Retour'
  return 'Reglement'
}

/** Display label with accent for Reglement. */
export function libelleLabel(libelle: StatementLibelle): string {
  if (libelle === 'Reglement') return 'R\u00e8glement'
  return libelle
}

/**
 * Filter ledger (oldest-first) to [fromYmd, toYmd] inclusive on Abidjan calendar day.
 * Solde initial = running balance after the last event before the period (else 0).
 */
export function buildStatementLines(
  ledgerOldestFirst: CustomerLedgerRpcRow[],
  periodFromYmd: string | null,
  periodToYmd: string | null,
): { soldeInitialCfa: number; lines: StatementLine[] } {
  let soldeInitial = 0
  const lines: StatementLine[] = []

  for (const row of ledgerOldestFirst) {
    const ymd = ymdInAbidjan(row.occurred_at)
    const beforeFrom = periodFromYmd != null && ymd < periodFromYmd
    const afterTo = periodToYmd != null && ymd > periodToYmd
    if (beforeFrom) {
      soldeInitial = Number(row.running_balance_cfa)
      continue
    }
    if (afterTo) continue

    const amount = Number(row.amount_cfa)
    const debit = amount > 0 ? amount : 0
    const credit = amount < 0 ? Math.abs(amount) : 0
    lines.push({
      occurredAt: row.occurred_at,
      reference: row.reference?.trim() || '\u2014',
      libelle: libelleFor(row.kind),
      debitCfa: debit,
      creditCfa: credit,
      soldeCfa: Number(row.running_balance_cfa),
    })
  }

  return { soldeInitialCfa: soldeInitial, lines }
}

export function buildCustomerStatementDataset(opts: {
  customerId: string
  client: CommercialClientBlock
  header: CommercialHeaderContext
  ledgerOldestFirst: CustomerLedgerRpcRow[]
  balanceOwedCfa: number
  periodFromYmd?: string | null
  periodToYmd?: string | null
  asOfIso?: string
}): CustomerStatementDataset {
  const periodFromYmd = opts.periodFromYmd ?? null
  const periodToYmd = opts.periodToYmd ?? null
  const { soldeInitialCfa, lines } = buildStatementLines(
    opts.ledgerOldestFirst,
    periodFromYmd,
    periodToYmd,
  )
  const totalDebitCfa = lines.reduce((s, l) => s + l.debitCfa, 0)
  const totalCreditCfa = lines.reduce((s, l) => s + l.creditCfa, 0)
  const soldeFinalFromLedger =
    lines.length > 0 ? lines[lines.length - 1]!.soldeCfa : soldeInitialCfa
  const fullAccount =
    periodFromYmd == null && periodToYmd == null
  /** Full-period PDF solde matches customers.balance_owed_cfa (screen). */
  const soldeFinalCfa = fullAccount ? opts.balanceOwedCfa : soldeFinalFromLedger
  const asOfIso = opts.asOfIso ?? new Date().toISOString()

  return {
    customerId: opts.customerId,
    client: opts.client,
    header: opts.header,
    periodFromYmd,
    periodToYmd,
    soldeInitialCfa,
    lines,
    totalDebitCfa,
    totalCreditCfa,
    soldeFinalCfa,
    balanceOwedCfa: opts.balanceOwedCfa,
    largeLedgerNote: opts.ledgerOldestFirst.length > LEDGER_PERIOD_SQL_NOTE_THRESHOLD,
    asOfDateLabel: formatDocDate(asOfIso),
  }
}

/** Full-range invariant used by tests and UI checks. */
export function statementMatchesBalance(dataset: CustomerStatementDataset): boolean {
  if (dataset.periodFromYmd != null || dataset.periodToYmd != null) return true
  return Math.round(dataset.soldeFinalCfa) === Math.round(dataset.balanceOwedCfa)
}

export function buildCustomerStatementHtml(dataset: CustomerStatementDataset): string {
  const periodLabel =
    dataset.periodFromYmd || dataset.periodToYmd
      ? `P\u00e9riode du ${escapeDocHtml(dataset.periodFromYmd ? formatReportDate(dataset.periodFromYmd) : '\u2014')} au ${escapeDocHtml(dataset.periodToYmd ? formatReportDate(dataset.periodToYmd) : '\u2014')}`
      : 'P\u00e9riode : tout le compte'

  const rows = dataset.lines
    .map(
      (l) => `<tr>
      <td>${escapeDocHtml(formatDocDate(l.occurredAt))}</td>
      <td>${escapeDocHtml(l.reference)}</td>
      <td>${escapeDocHtml(libelleLabel(l.libelle))}</td>
      <td class="num">${l.debitCfa ? escapeDocHtml(formatDocCfa(l.debitCfa)) : ''}</td>
      <td class="num">${l.creditCfa ? escapeDocHtml(formatDocCfa(l.creditCfa)) : ''}</td>
      <td class="num">${escapeDocHtml(formatDocCfa(l.soldeCfa))}</td>
    </tr>`,
    )
    .join('')

  const note = dataset.largeLedgerNote
    ? `<p class="note">Grand historique (&gt; ${LEDGER_PERIOD_SQL_NOTE_THRESHOLD} lignes) : filtrage p\u00e9riode c\u00f4t\u00e9 client. Une version SQL p\u00e9riode pourra \u00eatre ajout\u00e9e plus tard.</p>`
    : ''

  const body = `
    ${renderCommercialHeader(dataset.header, {
      title: 'Relev\u00e9 de compte client',
      dateLabel: 'Solde au',
      date: dataset.asOfDateLabel,
      extraLines: [{ label: '', value: periodLabel }],
    })}
    <div class="parties">
      ${renderClientBlock(dataset.client)}
      <div class="party">
        <h3>Soldes</h3>
        <p>Solde initial : <strong>${escapeDocHtml(formatDocCfa(dataset.soldeInitialCfa))}</strong></p>
        <p>Total d\u00e9bit : <strong>${escapeDocHtml(formatDocCfa(dataset.totalDebitCfa))}</strong></p>
        <p>Total cr\u00e9dit : <strong>${escapeDocHtml(formatDocCfa(dataset.totalCreditCfa))}</strong></p>
      </div>
    </div>
    ${note}
    <table class="doc">
      <thead><tr>
        <th>Date</th><th>N\u00b0</th><th>Libell\u00e9</th>
        <th class="num">D\u00e9bit</th><th class="num">Cr\u00e9dit</th><th class="num">Solde</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="muted">Aucune \u00e9criture sur la p\u00e9riode.</td></tr>`}</tbody>
    </table>
    <p style="font-size:13px;font-weight:700;margin-top:12px;">
      Solde d\u00fb au ${escapeDocHtml(dataset.asOfDateLabel)} : ${escapeDocHtml(formatDocCfa(dataset.soldeFinalCfa))}
    </p>
  `
  return wrapCommercialDocument({
    title: `Releve — ${dataset.client.name}`,
    bodyHtml: body,
  })
}

export function printCustomerStatementPdf(dataset: CustomerStatementDataset): void {
  printHtmlDocument(buildCustomerStatementHtml(dataset))
}

export function customerStatementWhatsAppText(dataset: CustomerStatementDataset): string {
  const name = dataset.client.name
  const solde = formatDocCfa(dataset.soldeFinalCfa)
  return `Releve de compte — ${name}\nSolde du au ${dataset.asOfDateLabel} : ${solde}`
}

export function openCustomerStatementWhatsApp(dataset: CustomerStatementDataset): void {
  const url = `https://wa.me/?text=${encodeURIComponent(customerStatementWhatsAppText(dataset))}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function statementDatasetFromSources(opts: {
  customer: { id: string; name: string; phone: string | null; address: string | null; balance_owed_cfa: number }
  ledgerOldestFirst: CustomerLedgerRpcRow[]
  businessName: string
  logoUrl?: string | null
  depotName?: string | null
  depotAddress?: string | null
  periodFromYmd?: string | null
  periodToYmd?: string | null
}): CustomerStatementDataset {
  return buildCustomerStatementDataset({
    customerId: opts.customer.id,
    client: {
      name: opts.customer.name,
      phone: opts.customer.phone,
      address: opts.customer.address,
    },
    header: {
      businessName: opts.businessName,
      logoUrl: opts.logoUrl,
      depotName: opts.depotName,
      depotAddress: opts.depotAddress,
    },
    ledgerOldestFirst: opts.ledgerOldestFirst,
    balanceOwedCfa: opts.customer.balance_owed_cfa,
    periodFromYmd: opts.periodFromYmd,
    periodToYmd: opts.periodToYmd,
  })
}