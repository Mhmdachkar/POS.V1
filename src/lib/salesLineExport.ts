/**
 * Sales report line-item export — complete filtered dataset (not UI page).
 *
 * Line Total = catalog line amount (qty × unit price), never a whole-sale total.
 * Final Sale Total = COALESCE(admin_override_total_cfa, total_cfa), shown once per receipt.
 * Grand total = authoritative sales_activity_cfa from the Sales report RPC.
 */

import { supabase } from '@/lib/supabase'
import { formatCFA, formatDate, formatDateTime } from '@/lib/formatters'
import { printCommercialDocument } from '@/lib/reportExport'
import {
  buildTableExportAoa,
  downloadStyledWorkbook,
  exportCfaInt,
  resolveExportCompanyName,
  type ExportColumn,
} from '@/lib/tableExport'
import { salesReportFilename } from '@/lib/reportFilenames'
import {
  authoritativeFinalSaleTotal,
  lineTotalFromQtyPrice,
} from '@/lib/saleTotals'

export { authoritativeFinalSaleTotal, lineTotalFromQtyPrice } from '@/lib/saleTotals'

export interface SalesExportFilters {
  depotId?: string | null
  startDate: string
  endDate: string
  cashierId?: string | null
  shiftId?: string | null
  categoryId?: string | null
  productId?: string | null
}

export interface SalesExportLine {
  serialNumber: string
  productName: string
  unitName: string
  quantity: number
  unitPriceCfa: number
  /** Catalog line amount (qty × unit price). Not the whole-sale total. */
  lineTotalCfa: number
  saleId: string
  receiptNumber: string
  saleCreatedAt: string
  adminOverrideTotalCfa: number | null
  /** Authoritative final sale total (override when set). */
  finalSaleTotalCfa: number
  /** Original calculated sale total (sales.total_cfa). */
  calculatedSaleTotalCfa: number
}

export interface SalesExportDataset {
  lines: SalesExportLine[]
  /** Authoritative period total from admin sales report (sales_activity_cfa). */
  authoritativeTotalCfa: number
  startDate: string
  endDate: string
  generatedAt: string
}

export interface SalesExportSaleGroup {
  saleId: string
  receiptNumber: string
  saleCreatedAt: string
  lines: SalesExportLine[]
  lineSumCfa: number
  calculatedSaleTotalCfa: number
  finalSaleTotalCfa: number
  hasOverride: boolean
}

const PAGE_SIZE = 500

function unitFallback(level: number): string {
  if (level === 1) return 'Paquet'
  if (level === 2) return 'Carton'
  return 'Pièce'
}

export function groupSalesExportLines(lines: SalesExportLine[]): SalesExportSaleGroup[] {
  const order: string[] = []
  const map = new Map<string, SalesExportSaleGroup>()

  for (const line of lines) {
    let group = map.get(line.saleId)
    if (!group) {
      group = {
        saleId: line.saleId,
        receiptNumber: line.receiptNumber,
        saleCreatedAt: line.saleCreatedAt,
        lines: [],
        lineSumCfa: 0,
        calculatedSaleTotalCfa: line.calculatedSaleTotalCfa,
        finalSaleTotalCfa: line.finalSaleTotalCfa,
        hasOverride: line.adminOverrideTotalCfa != null,
      }
      map.set(line.saleId, group)
      order.push(line.saleId)
    }
    group.lines.push(line)
    group.lineSumCfa += line.lineTotalCfa
  }

  return order.map((id) => map.get(id)!)
}

/** Sum of final sale totals once per receipt — never per line. */
export function sumFinalSaleTotalsOnce(lines: SalesExportLine[]): number {
  return groupSalesExportLines(lines).reduce((sum, g) => sum + g.finalSaleTotalCfa, 0)
}

export function sumLineTotals(lines: SalesExportLine[]): number {
  return lines.reduce((sum, l) => sum + l.lineTotalCfa, 0)
}

function mapLine(row: Record<string, unknown>): SalesExportLine {
  const saleRaw = row.sales
  const sale = (Array.isArray(saleRaw) ? saleRaw[0] : saleRaw) as Record<string, unknown> | null
  const productRaw = row.products
  const product = (Array.isArray(productRaw) ? productRaw[0] : productRaw) as Record<string, unknown> | null
  const units = Array.isArray(product?.product_units) ? product!.product_units : []
  const level = Number(row.unit_level ?? 0)
  const unitRow = units.find((u: { unit_level?: number }) => Number(u.unit_level) === level) as
    | { unit_name?: string; serial_number?: string }
    | undefined

  const quantity = Number(row.quantity_in_unit ?? 0)
  const unitPriceCfa = Number(row.unit_price_cfa ?? 0)
  const storedLine = Number(row.line_total_cfa ?? NaN)
  const lineTotalCfa = Number.isFinite(storedLine)
    ? storedLine
    : lineTotalFromQtyPrice(quantity, unitPriceCfa)

  const override =
    sale?.admin_override_total_cfa == null || sale.admin_override_total_cfa === undefined
      ? null
      : Number(sale.admin_override_total_cfa)
  const calculatedSaleTotalCfa = Number(sale?.total_cfa ?? 0)

  return {
    serialNumber: (unitRow?.serial_number ?? '').trim() || '—',
    productName: String(product?.name ?? 'Unknown Product'),
    unitName: (unitRow?.unit_name ?? '').trim() || unitFallback(level),
    quantity,
    unitPriceCfa,
    lineTotalCfa,
    saleId: String(sale?.id ?? ''),
    receiptNumber: String(sale?.receipt_number ?? ''),
    saleCreatedAt: String(sale?.created_at ?? ''),
    adminOverrideTotalCfa: override,
    calculatedSaleTotalCfa,
    finalSaleTotalCfa: authoritativeFinalSaleTotal({
      total_cfa: calculatedSaleTotalCfa,
      admin_override_total_cfa: override,
    }),
  }
}

/**
 * Fetch every completed sale line in range. Pages until exhausted — never limited
 * to the on-screen sales table page size.
 */
export async function fetchSalesExportLines(
  filters: SalesExportFilters,
): Promise<SalesExportLine[]> {
  const lines: SalesExportLine[] = []
  let from = 0

  for (;;) {
    let q = supabase
      .from('sale_items')
      .select(
        `
        id,
        unit_level,
        quantity_in_unit,
        unit_price_cfa,
        line_total_cfa,
        net_line_total_cfa,
        product_id,
        products!inner(
          name,
          category_id,
          product_units(unit_level, unit_name, serial_number)
        ),
        sales!inner(
          id,
          created_at,
          status,
          receipt_number,
          depot_id,
          cashier_id,
          shift_id,
          total_cfa,
          admin_override_total_cfa
        )
        `,
      )
      .eq('sales.status', 'completed')
      .gte('sales.created_at', `${filters.startDate}T00:00:00.000Z`)
      .lte('sales.created_at', `${filters.endDate}T23:59:59.999Z`)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (filters.depotId) q = q.eq('sales.depot_id', filters.depotId)
    if (filters.cashierId) q = q.eq('sales.cashier_id', filters.cashierId)
    if (filters.shiftId) q = q.eq('sales.shift_id', filters.shiftId)
    if (filters.productId) q = q.eq('product_id', filters.productId)
    if (filters.categoryId) q = q.eq('products.category_id', filters.categoryId)

    const { data, error } = await q
    if (error) throw error

    const batch = (data ?? []) as Record<string, unknown>[]
    for (const row of batch) lines.push(mapLine(row))

    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  lines.sort(
    (a, b) =>
      a.saleCreatedAt.localeCompare(b.saleCreatedAt)
      || a.receiptNumber.localeCompare(b.receiptNumber)
      || a.serialNumber.localeCompare(b.serialNumber),
  )
  return lines
}

export function buildSalesExportDataset(
  lines: SalesExportLine[],
  opts: {
    startDate: string
    endDate: string
    authoritativeTotalCfa: number
    generatedAt?: string
  },
): SalesExportDataset {
  return {
    lines,
    authoritativeTotalCfa: Number(opts.authoritativeTotalCfa ?? 0),
    startDate: opts.startDate,
    endDate: opts.endDate,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
  }
}

export function salesExportSheetAoa(dataset: SalesExportDataset): unknown[][] {
  const rangeLabel =
    dataset.startDate === dataset.endDate
      ? dataset.startDate
      : `${dataset.startDate} → ${dataset.endDate}`

  const groups = groupSalesExportLines(dataset.lines)
  const lineSum = sumLineTotals(dataset.lines)
  const finalSumOnce = sumFinalSaleTotalsOnce(dataset.lines)
  const overrideCount = groups.filter((g) => g.hasOverride).length

  const aoa: unknown[][] = [
    ['Rapport des ventes'],
    ['Période', rangeLabel],
    ['Généré', formatDateTime(dataset.generatedAt)],
    ['Devise', 'CFA'],
    [],
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

  for (const group of groups) {
    for (const line of group.lines) {
      aoa.push([
        line.saleCreatedAt,
        line.receiptNumber,
        line.serialNumber,
        line.productName,
        line.unitName,
        line.quantity,
        exportCfaInt(line.unitPriceCfa),
        exportCfaInt(line.lineTotalCfa),
      ])
    }
    const label = group.hasOverride
      ? `Total final (ajusté admin) — ${group.receiptNumber}`
      : `Total final de la vente — ${group.receiptNumber}`
    aoa.push(['', '', '', '', '', '', label, group.finalSaleTotalCfa])
    if (group.hasOverride) {
      aoa.push([
        '',
        '',
        '',
        '',
        '',
        '',
        `Total calculé (lignes inchangées) — ${group.receiptNumber}`,
        group.calculatedSaleTotalCfa,
      ])
    }
  }

  aoa.push([])
  aoa.push(['Somme des totaux de ligne', '', '', '', '', '', '', lineSum])
  aoa.push([
    'Somme des totaux finaux (1× par ticket)',
    '',
    '',
    '',
    '',
    '',
    '',
    finalSumOnce,
  ])
  if (overrideCount > 0) {
    aoa.push([
      `Ajustements admin : ${overrideCount}`,
      '',
      '',
      '',
      '',
      '',
      'Les totaux de ligne conservent les prix catalogue ; le total final fait foi par ticket.',
      '',
    ])
  }
  aoa.push([])
  aoa.push([
    'Total des ventes (période sélectionnée)',
    '',
    '',
    '',
    '',
    '',
    '',
    dataset.authoritativeTotalCfa,
  ])

  return aoa
}

const SALES_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Date', kind: 'date' },
  { header: 'N° ticket' },
  { header: 'N° série' },
  { header: 'Produit' },
  { header: 'Unité' },
  { header: 'Quantité', kind: 'qty', total: true },
  { header: 'Prix unitaire', kind: 'money' },
  { header: 'Total ligne', kind: 'money', total: true },
]

export async function downloadSalesExportXlsx(
  dataset: SalesExportDataset,
  opts?: { depotName?: string | null; companyName?: string | null },
): Promise<void> {
  const company = await resolveExportCompanyName(opts?.companyName)
  const rangeLabel =
    dataset.startDate === dataset.endDate
      ? dataset.startDate
      : `${dataset.startDate} → ${dataset.endDate}`
  const { aoa, headerRowIndex, dataEndRow } = buildTableExportAoa(
    SALES_EXPORT_COLUMNS,
    dataset.lines.map((line) => ({
      cells: [
        line.saleCreatedAt,
        line.receiptNumber,
        line.serialNumber,
        line.productName,
        line.unitName,
        line.quantity,
        exportCfaInt(line.unitPriceCfa),
        exportCfaInt(line.lineTotalCfa),
      ],
    })),
    {
      title: 'Rapport des ventes',
      sheetName: 'Ventes',
      basename: 'rapport-ventes',
      depotName: opts?.depotName,
      filterLines: [
        `Période : ${rangeLabel}`,
        `Total période (autoritatif) : ${exportCfaInt(dataset.authoritativeTotalCfa)} CFA`,
      ],
    },
    company,
  )
  downloadStyledWorkbook(salesReportFilename(dataset.startDate, dataset.endDate, 'xlsx'), [
    {
      name: 'Ventes',
      aoa,
      headerRowIndex,
      lastDataRow: dataEndRow,
      dateCols: [0],
      moneyCols: [6, 7],
      freeze: true,
    },
  ])
}

export function salesExportPrintHtml(dataset: SalesExportDataset): string {
  const rangeLabel =
    dataset.startDate === dataset.endDate
      ? dataset.startDate
      : `${dataset.startDate} → ${dataset.endDate}`

  const groups = groupSalesExportLines(dataset.lines)
  const bodyParts: string[] = []

  for (const group of groups) {
    for (const line of group.lines) {
      bodyParts.push(`<tr>
        <td>${escape(formatDate(line.saleCreatedAt))}</td>
        <td>${escape(line.receiptNumber)}</td>
        <td>${escape(line.serialNumber)}</td>
        <td>${escape(line.productName)}</td>
        <td>${escape(line.unitName)}</td>
        <td class="num">${escape(String(line.quantity))}</td>
        <td class="num">${escape(formatCFA(line.unitPriceCfa))}</td>
        <td class="num">${escape(formatCFA(line.lineTotalCfa))}</td>
      </tr>`)
    }
    const overrideNote = group.hasOverride
      ? ` <span class="muted">(ajusté admin · calculé ${escape(formatCFA(group.calculatedSaleTotalCfa))})</span>`
      : ''
    bodyParts.push(`<tr class="sale-total">
      <td colspan="7">Total final de la vente — ${escape(group.receiptNumber)}${overrideNote}</td>
      <td class="num">${escape(formatCFA(group.finalSaleTotalCfa))}</td>
    </tr>`)
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport des ventes</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: system-ui, sans-serif; color: #111; font-size: 11px; margin: 0; padding: 12mm; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #667085; margin: 0 0 14px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; color: #667085; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sale-total td { font-weight: 700; background: #f9fafb; border-top: 1px solid #d0d5dd; }
  .total-row td { font-weight: 700; border-top: 2px solid #111; padding-top: 10px; }
  .muted { font-weight: 400; color: #667085; font-size: 10px; }
</style></head><body>
  <h1>Rapport des ventes</h1>
  <p class="sub">Période : ${escape(rangeLabel)} · Généré : ${escape(formatDateTime(dataset.generatedAt))} · Devise : CFA</p>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>N° ticket</th><th>N° série</th><th>Produit</th><th>Unité</th>
        <th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Total ligne</th>
      </tr>
    </thead>
    <tbody>${bodyParts.join('') || '<tr><td colspan="8">Aucune vente sur la période sélectionnée</td></tr>'}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="7">Total des ventes (période sélectionnée)</td>
        <td class="num">${escape(formatCFA(dataset.authoritativeTotalCfa))}</td>
      </tr>
    </tfoot>
  </table>
</body></html>`
}

export function printSalesExportPdf(dataset: SalesExportDataset): void {
  // Same window.open('') path as facture/relevé — avoids Chrome blob: URL header/footer.
  printCommercialDocument(salesExportPrintHtml(dataset))
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
