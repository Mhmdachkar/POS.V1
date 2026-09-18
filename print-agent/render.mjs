/** Plain-text tickets for Windows spooler (mirrors app receipt / depot order). */

function formatCfa(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0 CFA'
  return `${Math.round(v).toLocaleString('fr-FR')} CFA`
}

export function buildCustomerReceiptText(payload) {
  const lines = [
    '=== CUSTOMER RECEIPT ===',
    payload.business_name ?? 'VHM POS',
    payload.depot_name ?? '',
    payload.receipt_number ?? '',
    payload.created_at ?? '',
    `Cashier: ${payload.cashier_name ?? '—'}`,
    `Customer: ${payload.customer_name ?? 'Walk-in'}`,
    '---',
  ]
  for (const item of payload.items ?? []) {
    lines.push(
      `${item.quantity_in_unit} ${item.unit_name} ${item.product_name}  ${formatCfa(item.line_total_cfa)}`,
    )
  }
  lines.push(
    '---',
    `Subtotal ${formatCfa(payload.subtotal_cfa)}`,
    `TOTAL ${formatCfa(payload.total_cfa)}`,
    `Cash ${formatCfa(payload.amount_tendered_cfa)}`,
  )
  if (Number(payload.change_given_cfa) > 0) {
    lines.push(`Change ${formatCfa(payload.change_given_cfa)}`)
  }
  return lines.join('\r\n')
}

export function buildDepotOrderText(payload) {
  const lines = [
    '=== DEPOT ORDER ===',
    payload.business_name ?? 'VHM POS',
    payload.depot_name ?? '',
    payload.receipt_number ?? '',
    payload.created_at ?? '',
    `Cashier: ${payload.cashier_name ?? '—'}`,
    `Customer: ${payload.customer_name ?? 'Walk-in'}`,
    '---',
  ]
  for (const item of payload.items ?? []) {
    lines.push(`${item.quantity_in_unit} ${item.unit_name} ${item.product_name}`)
  }
  lines.push('---', `TOTAL ${formatCfa(payload.total_cfa)}`, 'Pick & release when ready')
  return lines.join('\r\n')
}

export function renderJobText(job) {
  if (job.document_type === 'depot_order') {
    return buildDepotOrderText(job.payload)
  }
  return buildCustomerReceiptText(job.payload)
}
