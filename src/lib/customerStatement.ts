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
import { printCommercialDocument } from '@/lib/reportExport'
import { DISPLAY_TIME_ZONE, formatReportDate } from '@/lib/formatters'
import { releveSoldeSentence } from '@/lib/amountInWordsFr'
import { ledgerAccountBalanceCfa } from '@/lib/customerAccountBalance'

export const LEDGER_PERIOD_SQL_NOTE_THRESHOLD = 2000

export type StatementLineType = 'Vente' | 'Reglement' | 'Retour' | 'Encaissement' | 'Remboursement'

/** @deprecated Use statementLineTypeLabel */
export type StatementLibelle = 'Vente' | 'Reglement' | 'Retour'

export interface StatementLine {
  occurredAt: string
  reference: string
  type: StatementLineType
  /** Short type column label */
  typeLabel: string
  /** Detail / libelle column */
  detail: string
  debitCfa: number
  creditCfa: number
  soldeCfa: number
  /** Opening-balance row (no movement date). */
  isOpening?: boolean
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
  /** customers.balance_owed_cfa — debt-only, not used for displayed closing solde. */
  balanceOwedCfa: number
  /** Last customer_ledger running_balance_cfa (signed). Displayed client solde. */
  accountBalanceCfa: number
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

export function statementLineTypeLabel(type: StatementLineType): string {
  if (type === 'Reglement') return 'R\u00e8glement'
  if (type === 'Encaissement') return 'Encaissement'
  if (type === 'Remboursement') return 'Remboursement'
  return type
}

function typeForKind(kind: CustomerLedgerRpcRow['kind']): StatementLineType {
  if (kind === 'sale') return 'Vente'
  if (kind === 'return') return 'Retour'
  if (kind === 'cash_payment') return 'Encaissement'
  if (kind === 'cash_refund') return 'Remboursement'
  return 'Reglement'
}

export function statementDetailForLedgerRow(row: CustomerLedgerRpcRow): string {
  if (row.kind === 'sale') {
    return row.adds_credit ? 'Vente \u00e0 cr\u00e9dit' : 'Vente comptant'
  }
  if (row.kind === 'cash_payment') {
    return 'Encaissement sur vente'
  }
  if (row.kind === 'cash_refund') {
    return 'Remboursement esp\u00e8ces'
  }
  if (row.kind === 'return') {
    const items = row.item_summary?.trim()
    return items || 'Retour marchandise'
  }
  const note = row.note?.trim()
  return note || 'Paiement compte client'
}

export function todayYmdAbidjan(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function statementClosingBalanceLabel(soldeFinalCfa: number): string {
  const rounded = Math.round(soldeFinalCfa)
  if (rounded > 0) return 'Solde d\u00fb'
  if (rounded < 0) return 'Solde en votre faveur'
  return 'Compte sold\u00e9'
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
    const type = typeForKind(row.kind)
    lines.push({
      occurredAt: row.occurred_at,
      reference: row.reference?.trim() || '\u2014',
      type,
      typeLabel: statementLineTypeLabel(type),
      detail: statementDetailForLedgerRow(row),
      debitCfa: debit,
      creditCfa: credit,
      soldeCfa: Number(row.running_balance_cfa),
    })
  }

  return { soldeInitialCfa: soldeInitial, lines }
}

export function withOpeningBalanceRow(
  soldeInitialCfa: number,
  periodFromYmd: string | null,
  lines: StatementLine[],
): StatementLine[] {
  if (lines.length === 0 && soldeInitialCfa === 0) return lines
  const label = periodFromYmd
    ? `Solde initial au ${formatReportDate(periodFromYmd)}`
    : 'Solde initial'
  const opening: StatementLine = {
    occurredAt: '',
    reference: '\u2014',
    type: 'Reglement',
    typeLabel: '',
    detail: label,
    debitCfa: 0,
    creditCfa: 0,
    soldeCfa: soldeInitialCfa,
    isOpening: true,
  }
  return [opening, ...lines]
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
  const { soldeInitialCfa, lines: movementLines } = buildStatementLines(
    opts.ledgerOldestFirst,
    periodFromYmd,
    periodToYmd,
  )
  const lines = withOpeningBalanceRow(soldeInitialCfa, periodFromYmd, movementLines)
  const totalDebitCfa = lines.reduce((s, l) => s + l.debitCfa, 0)
  const totalCreditCfa = lines.reduce((s, l) => s + l.creditCfa, 0)
  const soldeFinalCfa =
    movementLines.length > 0 ? movementLines[movementLines.length - 1]!.soldeCfa : soldeInitialCfa
  const asOfIso = opts.asOfIso ?? new Date().toISOString()
  const accountBalanceCfa = ledgerAccountBalanceCfa(opts.ledgerOldestFirst)

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
    accountBalanceCfa,
    largeLedgerNote: opts.ledgerOldestFirst.length > LEDGER_PERIOD_SQL_NOTE_THRESHOLD,
    asOfDateLabel: formatDocDate(asOfIso),
  }
}

/** Full-range closing solde equals the displayed client solde (ledger running balance). */
export function statementMatchesBalance(dataset: CustomerStatementDataset): boolean {
  if (dataset.periodFromYmd != null || dataset.periodToYmd != null) return true
  return Math.round(dataset.soldeFinalCfa) === Math.round(dataset.accountBalanceCfa)
}

const STATEMENT_EXTRA_CSS = `
  table.doc.statement th, table.doc.statement td { border: 1px solid #d0d5dd; }
  table.doc.statement tbody tr:nth-child(even) td {
    background: #f9fafb;
    box-shadow: inset 0 0 0 1000px #f9fafb;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table.doc.statement tbody tr.opening td {
    font-weight: 600;
    background: #f3f4f6;
    box-shadow: inset 0 0 0 1000px #f3f4f6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .statement-footer { margin-top: 14px; font-size: 11px; color: #667085; text-align: right; }
`

export function buildCustomerStatementHtml(dataset: CustomerStatementDataset): string {
  const periodLabel =
    dataset.periodFromYmd || dataset.periodToYmd
      ? `P\u00e9riode du ${escapeDocHtml(dataset.periodFromYmd ? formatReportDate(dataset.periodFromYmd) : '\u2014')} au ${escapeDocHtml(dataset.periodToYmd ? formatReportDate(dataset.periodToYmd) : '\u2014')}`
      : 'P\u00e9riode : tout le compte'

  const rows = dataset.lines
    .map(
      (l) => `<tr class="${l.isOpening ? 'opening' : ''}">
      <td>${l.isOpening ? '' : escapeDocHtml(formatDocDate(l.occurredAt))}</td>
      <td>${escapeDocHtml(l.reference)}</td>
      <td>${escapeDocHtml(l.typeLabel)}</td>
      <td>${escapeDocHtml(l.detail)}</td>
      <td class="num">${l.debitCfa ? escapeDocHtml(formatDocCfa(l.debitCfa)) : ''}</td>
      <td class="num">${l.creditCfa ? escapeDocHtml(formatDocCfa(l.creditCfa)) : ''}</td>
      <td class="num">${escapeDocHtml(formatDocCfa(l.soldeCfa))}</td>
    </tr>`,
    )
    .join('')

  const note = dataset.largeLedgerNote
    ? `<p class="note">Grand historique (&gt; ${LEDGER_PERIOD_SQL_NOTE_THRESHOLD} lignes) : filtrage p\u00e9riode c\u00f4t\u00e9 client. Une version SQL p\u00e9riode pourra \u00eatre ajout\u00e9e plus tard.</p>`
    : ''

  const closingLabel = statementClosingBalanceLabel(dataset.soldeFinalCfa)
  const closingAmount = formatDocCfa(Math.abs(dataset.soldeFinalCfa))

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
        <h3>R\u00e9capitulatif p\u00e9riode</h3>
        <p>Total d\u00e9bit : <strong>${escapeDocHtml(formatDocCfa(dataset.totalDebitCfa))}</strong></p>
        <p>Total cr\u00e9dit : <strong>${escapeDocHtml(formatDocCfa(dataset.totalCreditCfa))}</strong></p>
      </div>
    </div>
    ${note}
    <table class="doc statement">
      <thead><tr>
        <th>Date</th><th>N\u00b0</th><th>Type</th><th>Libell\u00e9</th>
        <th class="num">D\u00e9bit</th><th class="num">Cr\u00e9dit</th><th class="num">Solde</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="muted">Aucune \u00e9criture sur la p\u00e9riode.</td></tr>`}</tbody>
    </table>
    <table class="totals">
      <tr><td>Total d\u00e9bit</td><td>${escapeDocHtml(formatDocCfa(dataset.totalDebitCfa))}</td></tr>
      <tr><td>Total cr\u00e9dit</td><td>${escapeDocHtml(formatDocCfa(dataset.totalCreditCfa))}</td></tr>
      <tr class="net"><td>${escapeDocHtml(closingLabel)} au ${escapeDocHtml(dataset.asOfDateLabel)}</td><td>${escapeDocHtml(closingAmount)}</td></tr>
    </table>
    <p class="words">${escapeDocHtml(releveSoldeSentence(dataset.soldeFinalCfa))}</p>
    ${dataset.soldeFinalCfa < 0 ? `<p class="note">Avoir client</p>` : ''}
    <p class="statement-footer">\u00c9dit\u00e9 le ${escapeDocHtml(dataset.asOfDateLabel)}</p>
  `
  return wrapCommercialDocument({
    title: `Releve — ${dataset.client.name}`,
    bodyHtml: body,
    extraCss: STATEMENT_EXTRA_CSS,
  })
}

export function printCustomerStatementPdf(dataset: CustomerStatementDataset): void {
  printCommercialDocument(buildCustomerStatementHtml(dataset))
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
  businessPhone?: string | null
  businessAddress?: string | null
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
      phone: opts.businessPhone ?? null,
      businessAddress: opts.businessAddress ?? null,
      depotName: opts.depotName,
      depotAddress: opts.depotAddress,
    },
    ledgerOldestFirst: opts.ledgerOldestFirst,
    balanceOwedCfa: opts.customer.balance_owed_cfa,
    periodFromYmd: opts.periodFromYmd,
    periodToYmd: opts.periodToYmd,
  })
}