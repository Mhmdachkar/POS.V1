/**
 * DEPOT ORDER ticket HTML (80mm) — same thermal contract as customer receipt.
 */

import { formatCFA, formatDateTime } from '@/lib/formatters'
import { escapeReceiptText } from '@/lib/receiptHtml'
import type { PrintJobPayload } from '@/lib/printPayload'
import { DEPOT } from '@/lib/bilingual/depot'
import { bilingualCompactLabel } from '@/lib/bilingual/types'
import { APP_BUSINESS_FALLBACK } from '@/lib/formatters'

function kv(label: string, value: string, extraClass = ''): string {
  return `<div class="receipt-kv${extraClass ? ` ${extraClass}` : ''}"><span>${label}</span><span>${value}</span></div>`
}

export function buildDepotOrderHtml(payload: PrintJobPayload): string {
  const store = escapeReceiptText(payload.business_name?.trim() || APP_BUSINESS_FALLBACK)
  const depot = escapeReceiptText(payload.depot_name ?? '')
  const cashier = payload.cashier_name ? escapeReceiptText(payload.cashier_name) : ''
  const customer = escapeReceiptText(payload.customer_name?.trim() || DEPOT.walkInCustomer.fr)

  const itemRows = (payload.items ?? []).map((item) => {
    const name = escapeReceiptText(item.product_name)
    const unit = escapeReceiptText(item.unit_name)
    return `
      <div class="receipt-item">
        <div class="receipt-item-name">${name}</div>
        <div class="receipt-item-meta">
          <span>${item.quantity_in_unit} ${unit}</span>
          <span>${formatCFA(item.line_total_cfa)}</span>
        </div>
      </div>`
  }).join('')

  return `
    <div class="receipt-paper">
      <div class="receipt-header">
        <div class="receipt-store">${store}</div>
        ${depot ? `<div class="receipt-depot">${depot}</div>` : ''}
        <div class="receipt-paid">${DEPOT.orderTicketTitle.fr}</div>
        <div class="receipt-number">${escapeReceiptText(payload.receipt_number)}</div>
      </div>
      <div class="receipt-rule"></div>
      <div class="receipt-meta">
        ${kv(bilingualCompactLabel(DEPOT.printKvDate), escapeReceiptText(formatDateTime(payload.created_at)))}
        ${cashier ? kv(bilingualCompactLabel(DEPOT.printKvCashier), cashier) : ''}
        ${kv(bilingualCompactLabel(DEPOT.printKvCustomer), customer)}
      </div>
      <div class="receipt-rule"></div>
      <div class="receipt-items">${itemRows}</div>
      <div class="receipt-rule"></div>
      <div class="receipt-totals">
        ${kv(bilingualCompactLabel(DEPOT.printKvSubtotal), formatCFA(payload.subtotal_cfa))}
        ${kv(bilingualCompactLabel(DEPOT.printKvTotal), formatCFA(payload.total_cfa), 'receipt-total')}
      </div>
      <div class="receipt-rule"></div>
      <div class="receipt-thanks">${DEPOT.pickWhenReady.fr}</div>
    </div>
  `
}

/** Plain text for Windows spooler (print agent). */
export function buildDepotOrderPlainText(payload: PrintJobPayload): string {
  const lines: string[] = [
    `=== ${DEPOT.orderTicketTitle.fr} ===`,
    payload.business_name,
    payload.depot_name,
    payload.receipt_number,
    formatDateTime(payload.created_at),
    `${bilingualCompactLabel(DEPOT.printKvCashier)}: ${payload.cashier_name ?? '—'}`,
    `${bilingualCompactLabel(DEPOT.printKvCustomer)}: ${payload.customer_name ?? DEPOT.walkInCustomer.fr}`,
    '---',
  ]
  for (const item of payload.items ?? []) {
    lines.push(`${item.quantity_in_unit} ${item.unit_name} ${item.product_name}`)
  }
  lines.push('---', `${DEPOT.printKvTotal.fr} ${formatCFA(payload.total_cfa)}`)
  return lines.join('\n')
}
