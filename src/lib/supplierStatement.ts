/**
 * Relevé de compte fournisseur — same A4 shell as the client relevé.
 * Sign convention is inverted vs client: BR = crédit, règlement = débit.
 * Full-range final Solde must equal suppliers.balance_owed_cfa (floored ledger).
 */

import type { SupplierLedgerRpcRow } from '@/lib/supplierLedger'
import { supplierLedgerAccountBalanceCfa } from '@/lib/supplierLedger'
import {
  type CommercialClientBlock,
  type CommercialHeaderContext,
  escapeDocHtml,
  formatDocCfa,
  formatDocDate,
  renderCommercialHeader,
  renderPartyBlock,
  wrapCommercialDocument,
} from '@/lib/commercialDocumentHtml'
import { printCommercialDocument } from '@/lib/reportExport'
import { DISPLAY_TIME_ZONE, formatReportDate } from '@/lib/formatters'
import { releveSoldeSentence } from '@/lib/amountInWordsFr'

export const SUPPLIER_LEDGER_PERIOD_NOTE_THRESHOLD = 2000

export type SupplierStatementLineType = 'BR' | 'Reglement' | 'Annulation'

export interface SupplierStatementLine {
  occurredAt: string
  reference: string
  type: SupplierStatementLineType
  typeLabel: string
  detail: string
  debitCfa: number
  creditCfa: number
  soldeCfa: number
  isOpening?: boolean
}

export interface SupplierStatementDataset {
  supplierId: string
  party: CommercialClientBlock
  header: CommercialHeaderContext
  periodFromYmd: string | null
  periodToYmd: string | null
  soldeInitialCfa: number
  lines: SupplierStatementLine[]
  totalDebitCfa: number
  totalCreditCfa: number
  soldeFinalCfa: number
  balanceOwedCfa: number
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

export function todayYmdAbidjan(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function supplierStatementLineTypeLabel(type: SupplierStatementLineType): string {
  if (type === 'Reglement') return 'R\u00e8glement'
  return type
}

function typeForKind(kind: SupplierLedgerRpcRow['kind']): SupplierStatementLineType {
  if (kind === 'purchase') return 'BR'
  if (kind === 'payment') return 'Reglement'
  return 'Annulation'
}

export function statementDetailForSupplierLedgerRow(row: SupplierLedgerRpcRow): string {
  const detail = row.detail?.trim()
  if (detail) return detail
  if (row.kind === 'purchase') return 'BR valid\u00e9'
  if (row.kind === 'payment') return 'R\u00e8glement fournisseur'
  if (row.kind === 'payment_reversal') return 'Annulation r\u00e8glement BR'
  return 'Annulation BR'
}

/**
 * Filter ledger (oldest-first) to [fromYmd, toYmd] inclusive on Abidjan calendar day.
 * Solde initial = running balance after the last event before the period (else 0).
 * Positive amount → Crédit (BR); negative → Débit (règlement / annulation).
 */
export function buildSupplierStatementLines(
  ledgerOldestFirst: SupplierLedgerRpcRow[],
  periodFromYmd: string | null,
  periodToYmd: string | null,
): { soldeInitialCfa: number; lines: SupplierStatementLine[] } {
  let soldeInitial = 0
  const lines: SupplierStatementLine[] = []

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
    const credit = amount > 0 ? amount : 0
    const debit = amount < 0 ? Math.abs(amount) : 0
    const type = typeForKind(row.kind)
    lines.push({
      occurredAt: row.occurred_at,
      reference: row.reference?.trim() || '\u2014',
      type,
      typeLabel: supplierStatementLineTypeLabel(type),
      detail: statementDetailForSupplierLedgerRow(row),
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
  lines: SupplierStatementLine[],
): SupplierStatementLine[] {
  if (lines.length === 0 && soldeInitialCfa === 0) return lines
  const label = periodFromYmd
    ? `Solde initial au ${formatReportDate(periodFromYmd)}`
    : 'Solde initial'
  const opening: SupplierStatementLine = {
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

export function buildSupplierStatementDataset(opts: {
  supplierId: string
  party: CommercialClientBlock
  header: CommercialHeaderContext
  ledgerOldestFirst: SupplierLedgerRpcRow[]
  balanceOwedCfa: number
  periodFromYmd?: string | null
  periodToYmd?: string | null
  asOfIso?: string
}): SupplierStatementDataset {
  const periodFromYmd = opts.periodFromYmd ?? null
  const periodToYmd = opts.periodToYmd ?? null
  const { soldeInitialCfa, lines: movementLines } = buildSupplierStatementLines(
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
  const accountBalanceCfa = supplierLedgerAccountBalanceCfa(opts.ledgerOldestFirst)

  return {
    supplierId: opts.supplierId,
    party: opts.party,
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
    largeLedgerNote: opts.ledgerOldestFirst.length > SUPPLIER_LEDGER_PERIOD_NOTE_THRESHOLD,
    asOfDateLabel: formatDocDate(asOfIso),
  }
}

/**
 * Full-range closing solde equals both the ledger last row and stored Solde dû.
 * Period exports skip the owed check (opening/closing can differ from today).
 */
export function statementMatchesBalance(dataset: SupplierStatementDataset): boolean {
  if (dataset.periodFromYmd != null || dataset.periodToYmd != null) return true
  const final = Math.round(dataset.soldeFinalCfa)
  const ledger = Math.round(dataset.accountBalanceCfa)
  const owed = Math.round(dataset.balanceOwedCfa)
  return final === ledger && ledger === owed
}

const STATEMENT_EXTRA_CSS = `
  table.doc.statement th, table.doc.statement td { border: 1px solid #d0d5dd; }
  table.doc.statement tbody tr:nth-child(even),
  table.doc.statement tbody tr:nth-child(even) td {
    background-color: #f5f5f5 !important;
    background: #f5f5f5 !important;
    box-shadow: inset 0 0 0 1000px #f5f5f5;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  table.doc.statement tbody tr.opening,
  table.doc.statement tbody tr.opening td {
    font-weight: 600;
    background-color: #f3f4f6 !important;
    background: #f3f4f6 !important;
    box-shadow: inset 0 0 0 1000px #f3f4f6;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .statement-footer { margin-top: 14px; font-size: 11px; color: #667085; text-align: right; }
`

export function buildSupplierStatementHtml(dataset: SupplierStatementDataset): string {
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
    ? `<p class="note">Grand historique (&gt; ${SUPPLIER_LEDGER_PERIOD_NOTE_THRESHOLD} lignes) : filtrage p\u00e9riode c\u00f4t\u00e9 client.</p>`
    : ''

  const closingAmount = formatDocCfa(Math.abs(dataset.soldeFinalCfa))
  const closingLabel = Math.round(dataset.soldeFinalCfa) > 0 ? 'Solde d\u00fb' : 'Compte sold\u00e9'

  const body = `
    ${renderCommercialHeader(dataset.header, {
      title: 'Relev\u00e9 de compte fournisseur',
      dateLabel: 'Solde au',
      date: dataset.asOfDateLabel,
      extraLines: [{ label: '', value: periodLabel }],
    })}
    <div class="parties">
      ${renderPartyBlock('Fournisseur', dataset.party)}
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
    <p class="statement-footer">\u00c9dit\u00e9 le ${escapeDocHtml(dataset.asOfDateLabel)}</p>
  `
  return wrapCommercialDocument({
    title: `Releve — ${dataset.party.name}`,
    bodyHtml: body,
    extraCss: STATEMENT_EXTRA_CSS,
  })
}

export function printSupplierStatementPdf(dataset: SupplierStatementDataset): void {
  printCommercialDocument(buildSupplierStatementHtml(dataset))
}

export function statementDatasetFromSources(opts: {
  supplier: {
    id: string
    name: string
    phone: string | null
    address: string | null
    balance_owed_cfa: number
  }
  ledgerOldestFirst: SupplierLedgerRpcRow[]
  businessName: string
  logoUrl?: string | null
  depotName?: string | null
  depotAddress?: string | null
  periodFromYmd?: string | null
  periodToYmd?: string | null
  businessPhone?: string | null
  businessAddress?: string | null
}): SupplierStatementDataset {
  return buildSupplierStatementDataset({
    supplierId: opts.supplier.id,
    party: {
      name: opts.supplier.name,
      phone: opts.supplier.phone,
      address: opts.supplier.address,
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
    balanceOwedCfa: opts.supplier.balance_owed_cfa,
    periodFromYmd: opts.periodFromYmd,
    periodToYmd: opts.periodToYmd,
  })
}
