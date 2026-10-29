import { localizedUnitLabel } from '@/lib/localizedUnits'
/**
 * Shared Soft Gestion-style commercial HTML/PDF shell.
 * UTF-8 + HTML escape so product names never become "??".
 * fr-FR CFA integers; dates dd/mm/yyyy (Africa/Abidjan).
 */

import { DISPLAY_TIME_ZONE, formatCFA, formatReportDate, formatReportDateTime } from '@/lib/formatters'
import { arreteeProformaSentence } from '@/lib/amountInWordsFr'

export function escapeDocHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** dd/mm/yyyy in Africa/Abidjan from an ISO timestamp. */
export function formatDocDate(iso: string | null | undefined): string {
  if (!iso) return '\u2014'
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
  return formatReportDate(ymd)
}

export function formatDocDateTime(iso: string | null | undefined): string {
  return formatReportDateTime(iso)
}

export function formatDocCfa(amount: number | null | undefined): string {
  return formatCFA(amount)
}

export interface CommercialHeaderContext {
  businessName: string
  logoUrl?: string | null
  depotName?: string | null
  /** Depot location / address line */
  depotAddress?: string | null
  /** Full business phone when known (optional until settings gain a phone field) */
  phone?: string | null
}

export interface CommercialClientBlock {
  name: string
  phone?: string | null
  address?: string | null
}

export interface CommercialDocMeta {
  title: string
  numberLabel?: string
  number?: string
  dateLabel?: string
  date?: string
  extraLines?: Array<{ label: string; value: string }>
}

const BASE_CSS = `
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #111; font-size: 11px; margin: 0; padding: 8px; }
  h1 { font-size: 16px; margin: 0 0 4px; letter-spacing: 0.02em; text-transform: uppercase; }
  h2 { font-size: 12px; margin: 0 0 8px; font-weight: 600; }
  .muted { color: #667085; }
  .header { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
  .brand { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
  .brand img { width: 56px; height: 56px; object-fit: contain; }
  .brand-text p { margin: 2px 0; }
  .meta { text-align: right; min-width: 11rem; }
  .meta p { margin: 2px 0; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .party { border: 1px solid #d0d5dd; border-radius: 6px; padding: 8px 10px; }
  .party h3 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #667085; }
  .party p { margin: 2px 0; }
  table.doc { width: 100%; border-collapse: collapse; margin: 8px 0 12px; }
  table.doc th, table.doc td { border-bottom: 1px solid #e5e7eb; padding: 6px 6px; vertical-align: top; }
  table.doc th { font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; color: #667085; text-align: left; }
  table.doc .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.doc thead { display: table-header-group; }
  .totals { width: 100%; max-width: 280px; margin-left: auto; border-collapse: collapse; }
  .totals td { padding: 4px 0; }
  .totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .totals .net td { border-top: 2px solid #111; padding-top: 8px; font-size: 12px; }
  .words { margin: 12px 0; font-style: italic; }
  .note { margin: 8px 0; color: #667085; font-size: 10px; }
  .sign { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .sign-box { border: 1px dashed #98a2b3; min-height: 72px; border-radius: 6px; padding: 8px; }
  .sign-box span { font-size: 10px; color: #667085; text-transform: uppercase; letter-spacing: 0.04em; }
  @media print { body { padding: 0; } }
`

export function wrapCommercialDocument(opts: {
  title: string
  bodyHtml: string
}): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${escapeDocHtml(opts.title)}</title>
<style>${BASE_CSS}</style></head><body>${opts.bodyHtml}</body></html>`
}

export function renderCommercialHeader(
  header: CommercialHeaderContext,
  meta: CommercialDocMeta,
): string {
  const logo = header.logoUrl
    ? `<img src="${escapeDocHtml(header.logoUrl)}" alt="" />`
    : ''
  const phone = header.phone?.trim()
    ? `<p>T\u00e9l. : ${escapeDocHtml(header.phone.trim())}</p>`
    : ''
  const depot = header.depotName
    ? `<p>${escapeDocHtml(header.depotName)}${header.depotAddress ? ` \u2014 ${escapeDocHtml(header.depotAddress)}` : ''}</p>`
    : header.depotAddress
      ? `<p>${escapeDocHtml(header.depotAddress)}</p>`
      : ''
  const metaLines: string[] = []
  if (meta.number) {
    metaLines.push(`<p><strong>${escapeDocHtml(meta.numberLabel ?? 'N\u00b0')}</strong> ${escapeDocHtml(meta.number)}</p>`)
  }
  if (meta.date) {
    metaLines.push(`<p><strong>${escapeDocHtml(meta.dateLabel ?? 'Date')}</strong> ${escapeDocHtml(meta.date)}</p>`)
  }
  for (const line of meta.extraLines ?? []) {
    metaLines.push(`<p><strong>${escapeDocHtml(line.label)}</strong> ${escapeDocHtml(line.value)}</p>`)
  }
  return `<div class="header">
  <div class="brand">${logo}<div class="brand-text">
    <h1>${escapeDocHtml(header.businessName)}</h1>
    ${depot}${phone}
  </div></div>
  <div class="meta">
    <h2>${escapeDocHtml(meta.title)}</h2>
    ${metaLines.join('')}
  </div>
</div>`
}

export function renderClientBlock(client: CommercialClientBlock): string {
  const phone = client.phone?.trim()
    ? `<p>T\u00e9l. : ${escapeDocHtml(client.phone.trim())}</p>`
    : ''
  const address = client.address?.trim()
    ? `<p>${escapeDocHtml(client.address.trim())}</p>`
    : ''
  return `<div class="party">
  <h3>Client</h3>
  <p><strong>${escapeDocHtml(client.name)}</strong></p>
  ${phone}${address}
</div>`
}

export function renderSignatureBoxes(left: string, right: string): string {
  return `<div class="sign">
  <div class="sign-box"><span>${escapeDocHtml(left)}</span></div>
  <div class="sign-box"><span>${escapeDocHtml(right)}</span></div>
</div>`
}

/** Line-item table for proforma / BL / A4 receipt (shared column order). */
export function renderLineTable(opts: {
  showPrices: boolean
  rows: Array<{
    index: number
    code: string
    designation: string
    unit: string
    qty: string
    unitPrice?: string
    discount?: string
    amount?: string
  }>
}): string {
  const headPrices = opts.showPrices
    ? `<th class="num">P.U.</th><th class="num">Remise</th><th class="num">Montant</th>`
    : ''
  const body = opts.rows
    .map((r) => {
      const prices = opts.showPrices
        ? `<td class="num">${escapeDocHtml(r.unitPrice ?? '')}</td>
           <td class="num">${escapeDocHtml(r.discount ?? '')}</td>
           <td class="num">${escapeDocHtml(r.amount ?? '')}</td>`
        : ''
      return `<tr>
        <td class="num">${r.index}</td>
        <td>${escapeDocHtml(r.code)}</td>
        <td>${escapeDocHtml(r.designation)}</td>
        <td>${escapeDocHtml((() => { const u = localizedUnitLabel(r.unit); return u ? u.charAt(0).toUpperCase() + u.slice(1) : u })())}</td>
        <td class="num">${escapeDocHtml(r.qty)}</td>
        ${prices}
      </tr>`
    })
    .join('')
  return `<table class="doc">
  <thead><tr>
    <th class="num">N\u00b0</th><th>Code</th><th>D\u00e9signation</th><th>Unit\u00e9</th><th class="num">Qt\u00e9</th>
    ${headPrices}
  </tr></thead>
  <tbody>${body}</tbody>
</table>`
}

export function renderMoneyTotals(opts: {
  total: number
  discount: number
  net: number
}): string {
  return `<table class="totals">
  <tr><td>Total</td><td>${escapeDocHtml(formatDocCfa(opts.total))}</td></tr>
  <tr><td>Remise</td><td>${escapeDocHtml(formatDocCfa(opts.discount))}</td></tr>
  <tr class="net"><td>Net \u00e0 payer</td><td>${escapeDocHtml(formatDocCfa(opts.net))}</td></tr>
</table>
<p class="words">${escapeDocHtml(arreteeProformaSentence(opts.net))}</p>`
}

export function buildProformaDocumentHtml(opts: {
  header: CommercialHeaderContext
  client: CommercialClientBlock
  number: string
  date: string
  rows: Array<{
    code: string
    designation: string
    unit: string
    qty: string
    unitPrice: string
    discount: string
    amount: string
  }>
  total: number
  discount: number
  net: number
  conditions?: string
}): string {
  const lineRows = opts.rows.map((r, i) => ({ index: i + 1, ...r }))
  const body = `
    ${renderCommercialHeader(opts.header, {
      title: 'Proforma',
      numberLabel: 'N\u00b0',
      number: opts.number,
      dateLabel: 'Date',
      date: opts.date,
    })}
    <div class="parties">
      ${renderClientBlock(opts.client)}
      <div class="party"><h3>Conditions</h3><p class="muted">${escapeDocHtml(opts.conditions ?? 'Document sans valeur comptable.')}</p></div>
    </div>
    ${renderLineTable({ showPrices: true, rows: lineRows })}
    ${renderMoneyTotals({ total: opts.total, discount: opts.discount, net: opts.net })}
    ${renderSignatureBoxes('Cachet / Signature', 'Client')}
  `
  return wrapCommercialDocument({ title: `Proforma ${opts.number}`, bodyHtml: body })
}

export function buildDeliveryNoteDocumentHtml(opts: {
  header: CommercialHeaderContext
  client: CommercialClientBlock
  number: string
  date: string
  showPrices: boolean
  receiptNumber: string
  receivedByName?: string | null
  rows: Array<{
    code: string
    designation: string
    unit: string
    qty: string
    unitPrice?: string
    discount?: string
    amount?: string
  }>
}): string {
  const lineRows = opts.rows.map((r, i) => ({ index: i + 1, ...r }))
  const received = opts.receivedByName?.trim()
    ? `<p>Re\u00e7u par : <strong>${escapeDocHtml(opts.receivedByName.trim())}</strong></p>`
    : ''
  const body = `
    ${renderCommercialHeader(opts.header, {
      title: 'Bon de livraison',
      numberLabel: 'N\u00b0',
      number: opts.number,
      dateLabel: 'Date',
      date: opts.date,
      extraLines: [{ label: 'Vente', value: opts.receiptNumber }],
    })}
    <div class="parties">
      ${renderClientBlock(opts.client)}
      <div class="party">
        <h3>Livraison</h3>
        <p class="muted">Document sans mouvement de stock (pr\u00e9paration d\u00e9p\u00f4t s\u00e9par\u00e9e).</p>
        ${received}
      </div>
    </div>
    ${renderLineTable({ showPrices: opts.showPrices, rows: lineRows })}
    ${renderSignatureBoxes('Cachet / Signature', 'Client / Re\u00e7u')}
  `
  return wrapCommercialDocument({ title: `BL ${opts.number}`, bodyHtml: body })
}

