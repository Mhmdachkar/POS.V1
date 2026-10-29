/**
 * Bon de livraison PDF via commercial document kit (avec / sans prix).
 */

import {
  buildDeliveryNoteDocumentHtml,
  formatDocCfa,
  formatDocDate,
  type CommercialClientBlock,
  type CommercialHeaderContext,
} from '@/lib/commercialDocumentHtml'
import {
  deliveryNoteLineTotalCfa,
  proratedLineDiscountCfa,
} from '@/lib/deliveryNoteAmounts'
import { printHtmlDocument } from '@/lib/reportExport'
import { APP_BUSINESS_FALLBACK } from '@/lib/formatters'

export interface DeliveryNotePrintItem {
  product_name: string
  unit_name: string
  serial_number: string | null
  quantity_in_unit: number
  unit_price_cfa: number
  line_discount_cfa: number
  line_total_cfa: number
  /** Sale line qty when BL is partial; defaults to quantity_in_unit. */
  sale_quantity_in_unit?: number
  /** Full sale line discount (when joined from sale_items). */
  sale_line_discount_cfa?: number
}

export interface DeliveryNotePrintContext {
  number: string
  documentDate: string
  showPrices: boolean
  receivedByName: string | null
  receiptNumber: string
  client: CommercialClientBlock
  items: DeliveryNotePrintItem[]
  header?: Partial<CommercialHeaderContext>
}

export function buildDeliveryNotePrintHtml(ctx: DeliveryNotePrintContext): string {
  const header: CommercialHeaderContext = {
    businessName: ctx.header?.businessName ?? APP_BUSINESS_FALLBACK,
    logoUrl: ctx.header?.logoUrl ?? null,
    depotName: ctx.header?.depotName ?? null,
    depotAddress: ctx.header?.depotAddress ?? null,
    phone: ctx.header?.phone ?? null,
  }
  const dateIso = `${ctx.documentDate}T12:00:00+00:00`
  let totalCfa = 0
  const rows = ctx.items.map((it) => {
    const saleQty = it.sale_quantity_in_unit ?? it.quantity_in_unit
    const fullLineDiscount = it.sale_line_discount_cfa ?? it.line_discount_cfa
    const lineTotal = deliveryNoteLineTotalCfa({
      quantityInUnit: it.quantity_in_unit,
      unitPriceCfa: it.unit_price_cfa,
      lineDiscountCfa: fullLineDiscount,
      saleQuantityInUnit: saleQty,
    })
    if (ctx.showPrices) totalCfa += lineTotal
    const discountDisplay = proratedLineDiscountCfa(
      fullLineDiscount,
      it.quantity_in_unit,
      saleQty,
    )
    return {
      code: it.serial_number?.trim() || '\u2014',
      designation: it.product_name,
      unit: it.unit_name,
      qty: String(it.quantity_in_unit),
      unitPrice: formatDocCfa(it.unit_price_cfa),
      discount: formatDocCfa(discountDisplay),
      amount: formatDocCfa(lineTotal),
    }
  })
  return buildDeliveryNoteDocumentHtml({
    header,
    client: ctx.client,
    number: ctx.number,
    date: formatDocDate(dateIso),
    showPrices: ctx.showPrices,
    receiptNumber: ctx.receiptNumber,
    receivedByName: ctx.receivedByName,
    rows,
    totalAmount: ctx.showPrices ? formatDocCfa(totalCfa) : undefined,
  })
}

export function printDeliveryNotePdf(ctx: DeliveryNotePrintContext): void {
  printHtmlDocument(buildDeliveryNotePrintHtml(ctx))
}
