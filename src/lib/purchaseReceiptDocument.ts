/**
 * Bon de réception A4 via commercial document kit.
 */

import {
  escapeDocHtml,
  formatDocCfa,
  formatDocDate,
  renderCommercialHeader,
  renderLineTable,
  renderPartyBlock,
  renderSignatureBoxes,
  wrapCommercialDocument,
  type CommercialClientBlock,
  type CommercialHeaderContext,
} from '@/lib/commercialDocumentHtml'
import { printCommercialDocument } from '@/lib/reportExport'
import { APP_BUSINESS_FALLBACK, formatReportDate } from '@/lib/formatters'
import { amountInWordsFrCfa } from '@/lib/amountInWordsFr'
import { creditDueDateYmd, isCreditOverdue } from '@/lib/supplierDueDate'
import type { PurchaseReceiptItemRow, PurchaseReceiptRow } from '@/hooks/useAchats'

export interface PurchaseReceiptPrintSupplier {
  name: string
  phone?: string | null
  address?: string | null
  payment_term_days?: number | null
}

export interface PurchaseReceiptPrintContext {
  receipt: PurchaseReceiptRow
  items: PurchaseReceiptItemRow[]
  supplier: PurchaseReceiptPrintSupplier
  header?: Partial<CommercialHeaderContext>
}

export function buildPurchaseReceiptDocumentHtml(ctx: PurchaseReceiptPrintContext): string {
  const receipt = ctx.receipt
  const header: CommercialHeaderContext = {
    businessName: ctx.header?.businessName ?? APP_BUSINESS_FALLBACK,
    logoUrl: ctx.header?.logoUrl ?? null,
    phone: ctx.header?.phone ?? null,
    businessAddress: ctx.header?.businessAddress ?? null,
    depotName: ctx.header?.depotName ?? null,
    depotAddress: ctx.header?.depotAddress ?? null,
  }
  const party: CommercialClientBlock = {
    name: ctx.supplier.name,
    phone: ctx.supplier.phone,
    address: ctx.supplier.address,
  }
  const dateLabel = formatReportDate(receipt.document_date)
  const dueYmd = creditDueDateYmd(receipt.document_date, ctx.supplier.payment_term_days)
  const overdue = isCreditOverdue(
    receipt.document_date,
    ctx.supplier.payment_term_days,
    receipt.payment_mode,
  )
  const extraLines: Array<{ label: string; value: string }> = []
  if (receipt.external_ref?.trim()) {
    extraLines.push({ label: 'Réf.', value: receipt.external_ref.trim() })
  }
  if (receipt.payment_mode === 'paid') {
    extraLines.push({ label: 'Paiement', value: 'Payé' })
  } else if (receipt.payment_mode === 'credit') {
    extraLines.push({ label: 'Paiement', value: 'À crédit' })
    if (dueYmd) {
      extraLines.push({
        label: 'Échéance',
        value: overdue ? `${formatReportDate(dueYmd)} — En retard` : formatReportDate(dueYmd),
      })
    }
  }
  if (receipt.status === 'cancelled') {
    extraLines.push({ label: 'Statut', value: 'Annulé' })
  }

  const lineRows = ctx.items.map((it, i) => ({
    index: i + 1,
    code: '\u2014',
    designation: it.product_name,
    unit: it.unit_name,
    qty: String(it.quantity_in_unit),
    unitPrice: formatDocCfa(it.unit_cost_cfa),
    discount: formatDocCfa(0),
    amount: formatDocCfa(it.line_total_cfa),
  }))

  const body = `
    ${renderCommercialHeader(header, {
      title: 'Bon de réception',
      numberLabel: 'N\u00b0',
      number: receipt.number,
      dateLabel: 'Date',
      date: dateLabel,
      extraLines,
    })}
    <div class="parties">
      ${renderPartyBlock('Fournisseur', party)}
      <div class="party">
        <h3>Document</h3>
        <p class="muted">Bon de réception fournisseur (entrée stock).</p>
        ${receipt.notes?.trim() ? `<p>${escapeDocHtml(receipt.notes.trim())}</p>` : ''}
      </div>
    </div>
    ${renderLineTable({ showPrices: true, rows: lineRows })}
    <table class="totals">
      <tr class="net"><td>Total</td><td>${escapeDocHtml(formatDocCfa(receipt.total_cfa))}</td></tr>
    </table>
    <p class="words">${escapeDocHtml(
      `Arrêté le présent bon de réception à la somme de : ${amountInWordsFrCfa(receipt.total_cfa)}.`,
    )}</p>
    ${renderSignatureBoxes('Cachet / Signature', 'Fournisseur')}
  `
  return wrapCommercialDocument({
    title: `BR ${receipt.number}`,
    bodyHtml: body,
    watermark: receipt.status === 'cancelled' ? 'ANNUL\u00c9' : null,
  })
}

export function printPurchaseReceiptPdf(ctx: PurchaseReceiptPrintContext): void {
  printCommercialDocument(buildPurchaseReceiptDocumentHtml(ctx))
}
