/**
 * Thermal (80mm) POS receipt HTML + print helper.
 *
 * Built for a receipt printer, not a browser page: no URLs, no app chrome.
 */

import { formatCFA, formatDateTime, formatReportDate } from '@/lib/formatters'
import { APP_BUSINESS_FALLBACK } from '@/lib/formatters'
import type { DiscountType, SaleStatus } from '@/types/database'
import type { SaleDetailData } from '@/hooks/useSales'
import { authoritativeFinalSaleTotal } from '@/lib/saleTotals'
import { localizedUnitLabel } from '@/lib/localizedUnits'

export interface ReceiptLineItem {
  product_name: string
  unit_name: string
  quantity_in_unit: number
  unit_price_cfa: number
  line_discount_cfa: number
  line_total_cfa: number
}

export interface ReceiptData {
  businessName: string
  depotName: string | null
  receiptNumber: string
  createdAt: string
  /** Document date YYYY-MM-DD when set; print Date prefers this over createdAt. */
  documentDateYmd: string | null
  externalRef: string | null
  cashierName: string | null
  customerName: string | null
  status: SaleStatus
  items: ReceiptLineItem[]
  subtotal_cfa: number
  discount_type: DiscountType | null
  discount_value: number | null
  discount_amount_cfa: number
  total_cfa: number
  /** Payable total (override when set). Shown as receipt TOTAL. */
  payable_total_cfa: number
  /** total_cfa - payable_total_cfa when an admin adjustment applies. */
  adjustment_cfa: number
  amount_tendered_cfa: number
  change_given_cfa: number
  balance_added_cfa: number
  refund_amount_cfa?: number
}

/** Date shown on receipt / sale header: document_date when set, else created_at. */
export function receiptDisplayDate(data: Pick<ReceiptData, 'documentDateYmd' | 'createdAt'>): string {
  if (data.documentDateYmd) return formatReportDate(data.documentDateYmd)
  return formatDateTime(data.createdAt)
}

const STATUS_STAMP: Record<SaleStatus, string> = {
  completed: 'PAYÉ',
  voided: 'ANNULÉ',
  returned: 'RETOURNÉ',
  partially_returned: 'RETOUR PARTIEL',
}

export function escapeReceiptText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function lotFromReceipt(receiptNumber: string): string {
  return receiptNumber.split('-')[0] ?? ''
}

function discountLabel(data: ReceiptData): string {
  if (data.discount_type === 'percent' && data.discount_value != null) {
    return `Remise (${data.discount_value}%)`
  }
  if (data.discount_type === 'flat') return 'Remise fixe'
  return 'Remise'
}

function kv(label: string, value: string, extraClass = ''): string {
  return `<div class="receipt-kv${extraClass ? ` ${extraClass}` : ''}"><span>${label}</span><span>${value}</span></div>`
}

export function receiptDataFromSaleDetail(
  sale: SaleDetailData,
  businessName: string,
  depotName: string | null,
): ReceiptData {
  const calculatedTotal = sale.total_cfa
  const payableTotal = authoritativeFinalSaleTotal({
    total_cfa: calculatedTotal,
    admin_override_total_cfa: sale.admin_override_total_cfa,
  })
  const adjustmentCfa =
    payableTotal < calculatedTotal ? calculatedTotal - payableTotal : 0

  return {
    businessName,
    depotName,
    receiptNumber: sale.receipt_number,
    createdAt: sale.created_at,
    documentDateYmd: sale.document_date?.slice(0, 10) || null,
    externalRef: sale.external_ref?.trim() || null,
    cashierName: sale.cashier_name,
    customerName: sale.customer_name,
    status: sale.status,
    items: sale.items.map((item) => ({
      product_name: item.product_name,
      unit_name: item.unit_name,
      quantity_in_unit: item.quantity_in_unit,
      unit_price_cfa: item.unit_price_cfa,
      line_discount_cfa: item.line_discount_cfa ?? 0,
      line_total_cfa: item.line_total_cfa,
    })),
    subtotal_cfa: sale.subtotal_cfa,
    discount_type: sale.discount_type,
    discount_value: sale.discount_value,
    discount_amount_cfa: sale.discount_amount_cfa,
    total_cfa: calculatedTotal,
    payable_total_cfa: payableTotal,
    adjustment_cfa: adjustmentCfa,
    amount_tendered_cfa: sale.amount_tendered_cfa,
    change_given_cfa: sale.change_given_cfa,
    balance_added_cfa: sale.balance_added_cfa,
    refund_amount_cfa: sale.returns.reduce((sum, ret) => sum + ret.refund_amount_cfa, 0),
  }
}

/** Structured 80mm POS ticket HTML. */
export function buildReceiptHtml(data: ReceiptData): string {
  const lot = lotFromReceipt(data.receiptNumber)
  const store = escapeReceiptText(data.businessName.trim() || APP_BUSINESS_FALLBACK)
  const depot = data.depotName ? escapeReceiptText(data.depotName) : ''
  const cashier = data.cashierName ? escapeReceiptText(data.cashierName) : ''
  const customer = escapeReceiptText(data.customerName?.trim() || 'Client de passage')
  const stamp = STATUS_STAMP[data.status] ?? 'PAYÉ'

  const itemRows = data.items.map((item) => {
    const name = escapeReceiptText(item.product_name)
    const unit = escapeReceiptText(localizedUnitLabel(item.unit_name))
    const qty = item.quantity_in_unit
    return `
      <div class="receipt-item">
        <div class="receipt-item-name">${name}</div>
        <div class="receipt-item-meta">
          <span>${qty} ${unit} × ${formatCFA(item.unit_price_cfa)}${(item.line_discount_cfa ?? 0) > 0 ? ` (−${formatCFA(item.line_discount_cfa)})` : ''}</span>
          <span>${formatCFA(item.line_total_cfa)}</span>
        </div>
      </div>`
  }).join('')

  const discountRow = data.discount_amount_cfa > 0
    ? kv(discountLabel(data), `− ${formatCFA(data.discount_amount_cfa)}`)
    : ''

  const calculatedTotalRow =
    data.adjustment_cfa > 0
      ? kv('Total calculé', formatCFA(data.total_cfa))
      : ''

  const adjustmentRow =
    data.adjustment_cfa > 0
      ? kv('Ajustement', `− ${formatCFA(data.adjustment_cfa)}`)
      : ''

  const changeRow = data.change_given_cfa > 0
    ? kv('Monnaie', formatCFA(data.change_given_cfa))
    : ''

  const paidOnSaleCfa = Math.max(
    0,
    Math.round((data.payable_total_cfa - data.balance_added_cfa) * 100) / 100,
  )
  const paidRow =
    paidOnSaleCfa > 0 || data.balance_added_cfa > 0
      ? kv('Payé', formatCFA(paidOnSaleCfa))
      : ''
  const resteRow = data.balance_added_cfa > 0
    ? kv('Reste à payer', formatCFA(data.balance_added_cfa))
    : ''

  const refundRow = (data.refund_amount_cfa ?? 0) > 0
    ? kv('Remboursé', formatCFA(data.refund_amount_cfa ?? 0))
    : ''

  return `
    <div class="receipt-paper">
      <div class="receipt-header">
        <div class="receipt-store">${store}</div>
        ${depot ? `<div class="receipt-depot">${depot}</div>` : ''}
        <div class="receipt-lot">LOT: ${escapeReceiptText(lot)}</div>
        <div class="receipt-number">${escapeReceiptText(data.receiptNumber)}</div>
      </div>
      <div class="receipt-rule"></div>
      <div class="receipt-meta">
        ${kv('Date', escapeReceiptText(receiptDisplayDate(data)))}
        ${data.externalRef ? kv('R\u00e9f.', escapeReceiptText(data.externalRef)) : ''}
        ${cashier ? kv('Caissier', cashier) : ''}
        ${kv('Client', customer)}
      </div>
      <div class="receipt-rule"></div>
      <div class="receipt-items">${itemRows}</div>
      <div class="receipt-rule"></div>
      <div class="receipt-totals">
        ${kv('Sous-total', formatCFA(data.subtotal_cfa))}
        ${discountRow}
        ${calculatedTotalRow}
        ${adjustmentRow}
        ${kv('TOTAL', formatCFA(data.payable_total_cfa), 'receipt-total')}
        ${kv('Espèces', formatCFA(data.amount_tendered_cfa))}
        ${changeRow}
        ${paidRow}
        ${resteRow}
        ${refundRow}
      </div>
      <div class="receipt-rule"></div>
      <div class="receipt-paid">${stamp}</div>
      <div class="receipt-thanks">Merci</div>
    </div>
  `
}

/**
 * Inject receipt as a body-level print root, hide the page URL/title
 * chrome as far as CSS allows, then call window.print().
 */
export function printReceiptHtml(html: string, rootId: string): void {
  document.getElementById(rootId)?.remove()

  const root = document.createElement('div')
  root.id = rootId
  root.className = 'print-only'
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML = html
  document.body.appendChild(root)

  const previousTitle = document.title
  // Blank title so Chromium does not print "VHM POS" / the app name in the header.
  document.title = ''

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    document.title = previousTitle
    root.remove()
    window.removeEventListener('afterprint', cleanup)
  }

  window.addEventListener('afterprint', cleanup)
  window.print()
  window.setTimeout(cleanup, 2000)
}
