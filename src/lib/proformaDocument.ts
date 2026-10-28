/**
 * Proforma PDF / WhatsApp via commercial document kit (PR-F).
 */

import {
  buildProformaDocumentHtml,
  formatDocCfa,
  formatDocDate,
  type CommercialClientBlock,
  type CommercialHeaderContext,
} from '@/lib/commercialDocumentHtml'
import { printHtmlDocument } from '@/lib/reportExport'
import type { ProformaItemRow, ProformaRow } from '@/hooks/useProformas'
import { APP_BUSINESS_FALLBACK } from '@/lib/formatters'

export interface ProformaPrintContext {
  proforma: ProformaRow
  items: ProformaItemRow[]
  client: CommercialClientBlock
  header?: Partial<CommercialHeaderContext>
}

export function buildProformaPrintHtml(ctx: ProformaPrintContext): string {
  const header: CommercialHeaderContext = {
    businessName: ctx.header?.businessName ?? APP_BUSINESS_FALLBACK,
    logoUrl: ctx.header?.logoUrl ?? null,
    depotName: ctx.header?.depotName ?? null,
    depotAddress: ctx.header?.depotAddress ?? null,
    phone: ctx.header?.phone ?? null,
  }
  const dateIso = `${ctx.proforma.document_date}T12:00:00+00:00`
  return buildProformaDocumentHtml({
    header,
    client: ctx.client,
    number: ctx.proforma.number,
    date: formatDocDate(dateIso),
    rows: ctx.items.map((it) => ({
      code: it.serial_number?.trim() || '\u2014',
      designation: it.product_name,
      unit: it.unit_name,
      qty: String(it.quantity_in_unit),
      unitPrice: formatDocCfa(it.unit_price_cfa),
      discount: formatDocCfa(it.line_discount_cfa),
      amount: formatDocCfa(it.line_total_cfa),
    })),
    total: Number(ctx.proforma.subtotal_cfa),
    discount: Number(ctx.proforma.discount_amount_cfa),
    net: Number(ctx.proforma.total_cfa),
    conditions: ctx.proforma.notes?.trim() || undefined,
  })
}

export function printProformaPdf(ctx: ProformaPrintContext): void {
  printHtmlDocument(buildProformaPrintHtml(ctx))
}

export function proformaWhatsAppText(ctx: ProformaPrintContext): string {
  const name = ctx.client.name
  const total = formatDocCfa(ctx.proforma.total_cfa)
  return `Proforma ${ctx.proforma.number} — ${name}\nNet a payer : ${total}`
}

export function openProformaWhatsApp(ctx: ProformaPrintContext): void {
  const url = `https://wa.me/?text=${encodeURIComponent(proformaWhatsAppText(ctx))}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function exportProforma(
  ctx: ProformaPrintContext,
  mode: 'pdf' | 'whatsapp',
): void {
  printProformaPdf(ctx)
  if (mode === 'whatsapp') openProformaWhatsApp(ctx)
}
