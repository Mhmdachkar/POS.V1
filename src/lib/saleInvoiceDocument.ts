/**
 * Facture A4 (completed sale) via commercial document kit.
 * Reste a payer = balance_added_cfa at sale time; returns listed under Avoir only.
 */

import {
  buildSaleInvoiceDocumentHtml,
  formatDocCfa,
  formatDocDate,
  type CommercialClientBlock,
  type CommercialHeaderContext,
} from '@/lib/commercialDocumentHtml'
import { printCommercialDocument } from '@/lib/reportExport'
import { APP_BUSINESS_FALLBACK } from '@/lib/formatters'
import { authoritativeFinalSaleTotal } from '@/lib/saleTotals'
import { receiptDisplayDate } from '@/lib/receiptHtml'
import type { SaleDetailData, SaleItemDetail, SaleReturnDetail } from '@/hooks/useSales'

export interface SaleInvoicePrintContext {
  sale: SaleDetailData
  client: CommercialClientBlock
  header?: Partial<CommercialHeaderContext>
}

function invoiceDateIso(sale: SaleDetailData): string {
  const ymd = sale.document_date?.slice(0, 10) || sale.created_at.slice(0, 10)
  return `${ymd}T12:00:00+00:00`
}

function returnDetailSummary(ret: SaleReturnDetail, items: SaleItemDetail[]): string {
  if (!ret.sale_return_items.length) return 'Retour marchandise'
  return ret.sale_return_items
    .map((ri) => {
      const line = items.find((it) => it.id === ri.sale_item_id)
      const name = line?.product_name?.trim() || 'Article'
      return `${ri.quantity_in_unit} x ${name}`
    })
    .join(', ')
}

export function buildSaleInvoicePrintHtml(ctx: SaleInvoicePrintContext): string {
  const sale = ctx.sale
  const header: CommercialHeaderContext = {
    businessName: ctx.header?.businessName ?? APP_BUSINESS_FALLBACK,
    logoUrl: ctx.header?.logoUrl ?? null,
    phone: ctx.header?.phone ?? null,
    businessAddress: ctx.header?.businessAddress ?? null,
    depotName: ctx.header?.depotName ?? null,
    depotAddress: ctx.header?.depotAddress ?? null,
  }
  const calculatedTotal = Number(sale.total_cfa ?? 0)
  const payableTotal = authoritativeFinalSaleTotal(sale)
  const amountPaid = Math.max(0, Number(sale.amount_applied_cfa ?? 0))
  const balanceAdded = Math.max(0, Number(sale.balance_added_cfa ?? 0))
  const dateLabel = receiptDisplayDate({
    documentDateYmd: sale.document_date?.slice(0, 10) || null,
    createdAt: sale.created_at,
  })

  const avoirRows =
    sale.returns.length > 0
      ? sale.returns.map((ret) => ({
          date: formatDocDate(ret.created_at),
          reference: sale.receipt_number,
          detail: returnDetailSummary(ret, sale.items),
          amount: formatDocCfa(ret.refund_amount_cfa),
        }))
      : undefined

  return buildSaleInvoiceDocumentHtml({
    header,
    client: ctx.client,
    receiptNumber: sale.receipt_number,
    date: dateLabel,
    externalRef: sale.external_ref,
    rows: sale.items.map((it) => ({
      code: it.serial_number?.trim() || '\u2014',
      designation: it.product_name,
      unit: it.unit_name,
      qty: String(it.quantity_in_unit),
      unitPrice: formatDocCfa(it.unit_price_cfa),
      discount: formatDocCfa(it.line_discount_cfa ?? 0),
      amount: formatDocCfa(it.line_total_cfa),
    })),
    subtotalCfa: Number(sale.subtotal_cfa ?? 0),
    discountCfa: Number(sale.discount_amount_cfa ?? 0),
    calculatedTotalCfa: calculatedTotal,
    payableTotalCfa: payableTotal,
    amountPaidCfa: amountPaid,
    balanceAddedCfa: balanceAdded,
    avoirRows,
  })
}

export function printSaleInvoicePdf(ctx: SaleInvoicePrintContext): void {
  printCommercialDocument(buildSaleInvoicePrintHtml(ctx))
}
