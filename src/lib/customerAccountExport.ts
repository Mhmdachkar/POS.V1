/**
 * Customer account Excel/PDF export — complete dataset for one customer.
 *
 * Product rows use Line Total (qty × unit price). Final Sale Total appears
 * once per receipt. Balance comes from customers.balance_owed_cfa.
 */

import { supabase } from '@/lib/supabase'
import { formatCFA, formatDate, formatDateTime } from '@/lib/formatters'
import {
  downloadXlsx,
  printHtmlDocument,
} from '@/lib/reportExport'
import { customerAccountFilename } from '@/lib/reportFilenames'
import {
  authoritativeFinalSaleTotal,
  lineTotalFromQtyPrice,
} from '@/lib/saleTotals'

const PAGE_SIZE = 500

/** Compact professional widths — product / receipt / serial get more room. */
const ACCOUNT_COL_WIDTHS = [12, 18, 14, 32, 12, 10, 12, 14]

export interface CustomerSaleExportRow {
  date: string
  receiptNumber: string
  serialNumber: string
  productName: string
  unitName: string
  quantity: number
  unitPriceCfa: number
  /** Catalog line amount — not the whole-sale total. */
  lineTotalCfa: number
  saleId: string
  finalSaleTotalCfa: number
  calculatedSaleTotalCfa: number
  hasOverride: boolean
}

export interface CustomerReturnExportRow {
  date: string
  receiptNumber: string
  returnId: string
  serialNumber: string
  productName: string
  unitName: string
  quantity: number
  /** Per-line return amount. */
  returnLineTotalCfa: number
  /** Whole return transaction total (once per return). */
  returnTransactionTotalCfa: number
}

export interface CustomerPaymentExportRow {
  date: string
  reference: string
  amountCfa: number
  note: string
}

export interface CustomerAccountExportDataset {
  customerId: string
  customerName: string
  sales: CustomerSaleExportRow[]
  returns: CustomerReturnExportRow[]
  payments: CustomerPaymentExportRow[]
  totalSalesCfa: number
  totalReturnsCfa: number
  totalPaymentsCfa: number
  /** Authoritative pooled balance from customers.balance_owed_cfa */
  currentBalanceCfa: number
  generatedAt: string
}

export interface CustomerSaleGroup {
  saleId: string
  receiptNumber: string
  date: string
  lines: CustomerSaleExportRow[]
  finalSaleTotalCfa: number
  calculatedSaleTotalCfa: number
  hasOverride: boolean
}

export interface CustomerReturnGroup {
  returnId: string
  receiptNumber: string
  date: string
  lines: CustomerReturnExportRow[]
  returnTransactionTotalCfa: number
}

function unitFallback(level: number): string {
  if (level === 1) return 'Paquet'
  if (level === 2) return 'Carton'
  return 'Pièce'
}

function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export function groupCustomerSaleRows(rows: CustomerSaleExportRow[]): CustomerSaleGroup[] {
  const order: string[] = []
  const map = new Map<string, CustomerSaleGroup>()
  for (const row of rows) {
    let g = map.get(row.saleId)
    if (!g) {
      g = {
        saleId: row.saleId,
        receiptNumber: row.receiptNumber,
        date: row.date,
        lines: [],
        finalSaleTotalCfa: row.finalSaleTotalCfa,
        calculatedSaleTotalCfa: row.calculatedSaleTotalCfa,
        hasOverride: row.hasOverride,
      }
      map.set(row.saleId, g)
      order.push(row.saleId)
    }
    g.lines.push(row)
  }
  return order.map((id) => map.get(id)!)
}

export function groupCustomerReturnRows(rows: CustomerReturnExportRow[]): CustomerReturnGroup[] {
  const order: string[] = []
  const map = new Map<string, CustomerReturnGroup>()
  for (const row of rows) {
    let g = map.get(row.returnId)
    if (!g) {
      g = {
        returnId: row.returnId,
        receiptNumber: row.receiptNumber,
        date: row.date,
        lines: [],
        returnTransactionTotalCfa: row.returnTransactionTotalCfa,
      }
      map.set(row.returnId, g)
      order.push(row.returnId)
    }
    g.lines.push(row)
  }
  return order.map((id) => map.get(id)!)
}

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const batch = data ?? []
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export async function fetchCustomerAccountExport(
  customerId: string,
): Promise<CustomerAccountExportDataset> {
  const { data: customerRaw, error: customerError } = await supabase
    .from('customers')
    .select('id, name, balance_owed_cfa')
    .eq('id', customerId)
    .single()
  if (customerError) throw customerError
  const customer = customerRaw as { id: string; name: string; balance_owed_cfa: number }

  const saleItems = await fetchAllPages(async (from, to) =>
    supabase
      .from('sale_items')
      .select(
        `
        unit_level,
        quantity_in_unit,
        unit_price_cfa,
        line_total_cfa,
        net_line_total_cfa,
        products!inner(
          name,
          product_units(unit_level, unit_name, serial_number)
        ),
        sales!inner(
          id,
          created_at,
          receipt_number,
          status,
          customer_id,
          total_cfa,
          admin_override_total_cfa
        )
        `,
      )
      .eq('sales.customer_id', customerId)
      .neq('sales.status', 'voided')
      .order('id', { ascending: true })
      .range(from, to),
  )

  const sales: CustomerSaleExportRow[] = []
  const saleMeta = new Map<string, { final: number; calculated: number; hasOverride: boolean }>()

  for (const raw of saleItems as Record<string, unknown>[]) {
    const sale = embedOne(raw.sales as Record<string, unknown> | Record<string, unknown>[] | null)
    if (!sale) continue
    const saleId = String(sale.id)
    const override =
      sale.admin_override_total_cfa == null || sale.admin_override_total_cfa === undefined
        ? null
        : Number(sale.admin_override_total_cfa)
    const calculated = Number(sale.total_cfa ?? 0)
    if (!saleMeta.has(saleId)) {
      saleMeta.set(saleId, {
        final: authoritativeFinalSaleTotal({
          total_cfa: calculated,
          admin_override_total_cfa: override,
        }),
        calculated,
        hasOverride: override != null,
      })
    }
    const meta = saleMeta.get(saleId)!
    const product = embedOne(raw.products as Record<string, unknown> | Record<string, unknown>[] | null)
    const units = Array.isArray(product?.product_units) ? product!.product_units : []
    const level = Number(raw.unit_level ?? 0)
    const unitRow = units.find((u: { unit_level?: number }) => Number(u.unit_level) === level) as
      | { unit_name?: string; serial_number?: string }
      | undefined

    const quantity = Number(raw.quantity_in_unit ?? 0)
    const unitPriceCfa = Number(raw.unit_price_cfa ?? 0)
    const storedLine = Number(raw.line_total_cfa ?? NaN)
    const lineTotalCfa = Number.isFinite(storedLine)
      ? storedLine
      : lineTotalFromQtyPrice(quantity, unitPriceCfa)

    sales.push({
      date: String(sale.created_at),
      receiptNumber: String(sale.receipt_number ?? ''),
      serialNumber: (unitRow?.serial_number ?? '').trim() || '—',
      productName: String(product?.name ?? 'Unknown Product'),
      unitName: (unitRow?.unit_name ?? '').trim() || unitFallback(level),
      quantity,
      unitPriceCfa,
      lineTotalCfa,
      saleId,
      finalSaleTotalCfa: meta.final,
      calculatedSaleTotalCfa: meta.calculated,
      hasOverride: meta.hasOverride,
    })
  }

  sales.sort((a, b) => a.date.localeCompare(b.date) || a.receiptNumber.localeCompare(b.receiptNumber))

  const returnHeaders = await fetchAllPages(async (from, to) =>
    supabase
      .from('sale_returns')
      .select(
        `
        id,
        created_at,
        refund_amount_cfa,
        sales!inner(receipt_number, customer_id),
        sale_return_items(
          quantity_in_unit,
          refund_amount_cfa,
          sale_items(
            unit_level,
            products!product_id(
              name,
              product_units(unit_level, unit_name, serial_number)
            )
          )
        )
        `,
      )
      .eq('sales.customer_id', customerId)
      .order('created_at', { ascending: true })
      .range(from, to),
  )

  const returns: CustomerReturnExportRow[] = []
  for (const header of returnHeaders as Record<string, unknown>[]) {
    const sale = embedOne(header.sales as Record<string, unknown> | Record<string, unknown>[] | null)
    const returnId = String(header.id ?? '')
    const transactionTotal = Number(header.refund_amount_cfa ?? 0)
    const items = Array.isArray(header.sale_return_items) ? header.sale_return_items : []
    for (const itemRaw of items) {
      const item = (itemRaw ?? {}) as Record<string, unknown>
      const saleItem = embedOne(item.sale_items as Record<string, unknown> | Record<string, unknown>[] | null)
      const product = embedOne(saleItem?.products as Record<string, unknown> | Record<string, unknown>[] | null)
      const units = Array.isArray(product?.product_units) ? product!.product_units : []
      const level = Number(saleItem?.unit_level ?? 0)
      const unitRow = units.find((u: { unit_level?: number }) => Number(u.unit_level) === level) as
        | { unit_name?: string; serial_number?: string }
        | undefined

      returns.push({
        date: String(header.created_at ?? ''),
        receiptNumber: String(sale?.receipt_number ?? ''),
        returnId,
        serialNumber: (unitRow?.serial_number ?? '').trim() || '—',
        productName: String(product?.name ?? 'Unknown Product'),
        unitName: (unitRow?.unit_name ?? '').trim() || unitFallback(level),
        quantity: Number(item.quantity_in_unit ?? 0),
        returnLineTotalCfa: Number(item.refund_amount_cfa ?? 0),
        returnTransactionTotalCfa: transactionTotal,
      })
    }
  }

  const paymentRows = await fetchAllPages(async (from, to) =>
    supabase
      .from('payments')
      .select('id, amount_cfa, recorded_at, note, is_reversed')
      .eq('customer_id', customerId)
      .eq('payment_type', 'customer_payment')
      .eq('is_reversed', false)
      .order('recorded_at', { ascending: true })
      .range(from, to),
  )

  const payments: CustomerPaymentExportRow[] = (paymentRows as Record<string, unknown>[]).map((p) => ({
    date: String(p.recorded_at ?? ''),
    reference: String(p.id ?? '').slice(0, 8).toUpperCase(),
    amountCfa: Number(p.amount_cfa ?? 0),
    note: typeof p.note === 'string' && p.note.trim() ? p.note.trim() : 'Balance payment',
  }))

  const totalSalesCfa = [...saleMeta.values()].reduce((s, m) => s + m.final, 0)
  const returnTxnSeen = new Set<string>()
  let totalReturnsCfa = 0
  for (const r of returns) {
    if (returnTxnSeen.has(r.returnId)) continue
    returnTxnSeen.add(r.returnId)
    totalReturnsCfa += r.returnTransactionTotalCfa
  }
  const totalPaymentsCfa = payments.reduce((s, p) => s + p.amountCfa, 0)

  return {
    customerId: String(customer.id),
    customerName: String(customer.name),
    sales,
    returns,
    payments,
    totalSalesCfa,
    totalReturnsCfa,
    totalPaymentsCfa,
    currentBalanceCfa: Number(customer.balance_owed_cfa ?? 0),
    generatedAt: new Date().toISOString(),
  }
}

export function customerAccountSheetAoa(dataset: CustomerAccountExportDataset): unknown[][] {
  const aoa: unknown[][] = [
    ['Rapport de compte client'],
    ['Client', dataset.customerName],
    ['Généré', formatDateTime(dataset.generatedAt)],
    ['Devise', 'CFA'],
    [],
    ['Résumé'],
    ['Nom du client', dataset.customerName],
    ['Total des ventes', dataset.totalSalesCfa],
    ['Total des retours', dataset.totalReturnsCfa],
    ['Total des paiements', dataset.totalPaymentsCfa],
    ['Solde restant', dataset.currentBalanceCfa],
    [],
    ['Ventes'],
    [
      'Date',
      'N° ticket',
      'N° série',
      'Produit',
      'Unité',
      'Quantité',
      'Prix unitaire',
      'Total ligne',
    ],
  ]

  const saleGroups = groupCustomerSaleRows(dataset.sales)
  if (saleGroups.length === 0) {
    aoa.push(['Aucune vente', '', '', '', '', '', '', ''])
  } else {
    for (const group of saleGroups) {
      for (const row of group.lines) {
        aoa.push([
          formatDate(row.date),
          row.receiptNumber,
          row.serialNumber,
          row.productName,
          row.unitName,
          row.quantity,
          row.unitPriceCfa,
          row.lineTotalCfa,
        ])
      }
      const label = group.hasOverride
        ? `Total vente (ajusté admin) — ${group.receiptNumber}`
        : `Total de la vente — ${group.receiptNumber}`
      aoa.push(['', '', '', '', '', '', label, group.finalSaleTotalCfa])
    }
  }
  aoa.push(['Total des ventes client', '', '', '', '', '', '', dataset.totalSalesCfa])
  aoa.push([])

  aoa.push(['Retours'])
  aoa.push([
    'Date',
    'Réf. retour / vente',
    'N° série',
    'Produit',
    'Unité',
    'Quantité',
    'Total ligne retour',
  ])
  const returnGroups = groupCustomerReturnRows(dataset.returns)
  if (returnGroups.length === 0) {
    aoa.push(['Aucun retour', '', '', '', '', '', ''])
  } else {
    for (const group of returnGroups) {
      for (const row of group.lines) {
        aoa.push([
          formatDate(row.date),
          row.receiptNumber,
          row.serialNumber,
          row.productName,
          row.unitName,
          row.quantity,
          row.returnLineTotalCfa,
        ])
      }
      aoa.push([
        '',
        '',
        '',
        '',
        '',
        `Total du retour — ${group.receiptNumber}`,
        group.returnTransactionTotalCfa,
      ])
    }
  }
  aoa.push(['Total des retours', '', '', '', '', '', dataset.totalReturnsCfa])
  aoa.push([])

  aoa.push(['Paiements'])
  aoa.push(['Date', 'Référence paiement', 'Montant', 'Notes'])
  if (dataset.payments.length === 0) {
    aoa.push(['Aucun paiement', '', '', ''])
  } else {
    for (const row of dataset.payments) {
      aoa.push([formatDate(row.date), row.reference, row.amountCfa, row.note])
    }
  }
  aoa.push(['Total des paiements', '', dataset.totalPaymentsCfa, ''])
  aoa.push([])

  aoa.push(['Solde final'])
  aoa.push(['Total des ventes', dataset.totalSalesCfa])
  aoa.push(['Total des retours', dataset.totalReturnsCfa])
  aoa.push(['Total des paiements', dataset.totalPaymentsCfa])
  aoa.push(['SOLDE RESTANT', dataset.currentBalanceCfa])

  return aoa
}

export function downloadCustomerAccountXlsx(dataset: CustomerAccountExportDataset): void {
  downloadXlsx(customerAccountFilename(dataset.customerName, 'xlsx'), [
    {
      name: 'Compte',
      headers: [],
      rows: customerAccountSheetAoa(dataset),
      rawAoa: true,
      colWidths: ACCOUNT_COL_WIDTHS,
      wrapText: true,
      boldFirstColLabels: true,
    },
  ])
}

export function customerAccountPrintHtml(dataset: CustomerAccountExportDataset): string {
  const saleGroups = groupCustomerSaleRows(dataset.sales)
  const returnGroups = groupCustomerReturnRows(dataset.returns)

  const saleRows: string[] = []
  for (const group of saleGroups) {
    for (const row of group.lines) {
      saleRows.push(`<tr>
        <td>${escape(formatDate(row.date))}</td>
        <td>${escape(row.receiptNumber)}</td>
        <td>${escape(row.serialNumber)}</td>
        <td>${escape(row.productName)}</td>
        <td>${escape(row.unitName)}</td>
        <td class="num">${escape(String(row.quantity))}</td>
        <td class="num">${escape(formatCFA(row.unitPriceCfa))}</td>
        <td class="num">${escape(formatCFA(row.lineTotalCfa))}</td>
      </tr>`)
    }
    const overrideNote = group.hasOverride
      ? ` <span class="muted">(ajusté admin · calculé ${escape(formatCFA(group.calculatedSaleTotalCfa))})</span>`
      : ''
    saleRows.push(`<tr class="sale-total">
      <td colspan="7">Total de la vente — ${escape(group.receiptNumber)}${overrideNote}</td>
      <td class="num">${escape(formatCFA(group.finalSaleTotalCfa))}</td>
    </tr>`)
  }

  const returnRows: string[] = []
  for (const group of returnGroups) {
    for (const row of group.lines) {
      returnRows.push(`<tr>
        <td>${escape(formatDate(row.date))}</td>
        <td>${escape(row.receiptNumber)}</td>
        <td>${escape(row.serialNumber)}</td>
        <td>${escape(row.productName)}</td>
        <td>${escape(row.unitName)}</td>
        <td class="num">${escape(String(row.quantity))}</td>
        <td class="num">${escape(formatCFA(row.returnLineTotalCfa))}</td>
      </tr>`)
    }
    returnRows.push(`<tr class="sale-total">
      <td colspan="6">Total du retour — ${escape(group.receiptNumber)}</td>
      <td class="num">${escape(formatCFA(group.returnTransactionTotalCfa))}</td>
    </tr>`)
  }

  const paymentRows = dataset.payments
    .map(
      (p) => `<tr>
      <td>${escape(formatDate(p.date))}</td>
      <td>${escape(p.reference)}</td>
      <td class="num">${escape(formatCFA(p.amountCfa))}</td>
      <td>${escape(p.note)}</td>
    </tr>`,
    )
    .join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Compte client — ${escape(dataset.customerName)}</title>
<style>
  @page { margin: 12mm; }
  body { font-family: system-ui, sans-serif; color: #111; font-size: 11px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 8px; border-bottom: 1px solid #d0d5dd; padding-bottom: 4px; }
  .sub { color: #667085; margin: 0 0 12px; font-size: 11px; }
  .summary { width: 100%; max-width: 420px; border-collapse: collapse; margin-bottom: 8px; }
  .summary td { padding: 4px 0; border-bottom: 1px solid #f2f4f7; }
  .summary td:last-child { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  table.data { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; color: #667085; }
  thead { display: table-header-group; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sale-total td { font-weight: 700; background: #f9fafb; border-top: 1px solid #d0d5dd; }
  .total-row td { font-weight: 700; border-top: 2px solid #111; padding-top: 8px; }
  .muted { font-weight: 400; color: #667085; font-size: 10px; }
  .balance { font-size: 14px; font-weight: 700; margin-top: 12px; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>Rapport de compte client</h1>
  <p class="sub">${escape(dataset.customerName)} · Généré : ${escape(formatDateTime(dataset.generatedAt))} · Devise : CFA</p>

  <h2>Résumé</h2>
  <table class="summary">
    <tr><td>Total des ventes</td><td>${escape(formatCFA(dataset.totalSalesCfa))}</td></tr>
    <tr><td>Total des retours</td><td>${escape(formatCFA(dataset.totalReturnsCfa))}</td></tr>
    <tr><td>Total des paiements</td><td>${escape(formatCFA(dataset.totalPaymentsCfa))}</td></tr>
    <tr><td>Solde restant</td><td>${escape(formatCFA(dataset.currentBalanceCfa))}</td></tr>
  </table>

  <h2>Ventes</h2>
  <table class="data">
    <thead>
      <tr>
        <th>Date</th><th>N° ticket</th><th>N° série</th><th>Produit</th><th>Unité</th>
        <th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Total ligne</th>
      </tr>
    </thead>
    <tbody>${saleRows.join('') || '<tr><td colspan="8">Aucune vente</td></tr>'}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="7">Total des ventes client</td>
        <td class="num">${escape(formatCFA(dataset.totalSalesCfa))}</td>
      </tr>
    </tfoot>
  </table>

  <h2>Retours</h2>
  <table class="data">
    <thead>
      <tr>
        <th>Date</th><th>Référence</th><th>N° série</th><th>Produit</th><th>Unité</th>
        <th class="num">Qté</th><th class="num">Total ligne retour</th>
      </tr>
    </thead>
    <tbody>${returnRows.join('') || '<tr><td colspan="7">Aucun retour</td></tr>'}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="6">Total des retours</td>
        <td class="num">${escape(formatCFA(dataset.totalReturnsCfa))}</td>
      </tr>
    </tfoot>
  </table>

  <h2>Paiements</h2>
  <table class="data">
    <thead>
      <tr><th>Date</th><th>Référence paiement</th><th class="num">Montant</th><th>Notes</th></tr>
    </thead>
    <tbody>${paymentRows || '<tr><td colspan="4">Aucun paiement</td></tr>'}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="2">Total des paiements</td>
        <td class="num">${escape(formatCFA(dataset.totalPaymentsCfa))}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <p class="balance">SOLDE RESTANT : ${escape(formatCFA(dataset.currentBalanceCfa))}</p>
</body></html>`
}

export function printCustomerAccountPdf(dataset: CustomerAccountExportDataset): void {
  printHtmlDocument(customerAccountPrintHtml(dataset))
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
