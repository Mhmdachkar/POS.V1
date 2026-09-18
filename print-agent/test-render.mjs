import assert from 'node:assert/strict'
import { buildCustomerReceiptText, buildDepotOrderText, renderJobText } from './render.mjs'

const sample = {
  business_name: 'VHM',
  depot_name: 'Dakar',
  receipt_number: 'DKR-00000001',
  created_at: '2026-01-01T12:00:00Z',
  cashier_name: 'Ali',
  customer_name: 'Walk-in',
  subtotal_cfa: 1000,
  total_cfa: 1000,
  amount_tendered_cfa: 1000,
  change_given_cfa: 0,
  items: [
    {
      product_name: 'Water',
      unit_name: 'Piece',
      quantity_in_unit: 2,
      line_total_cfa: 1000,
    },
  ],
}

assert.match(buildCustomerReceiptText(sample), /CUSTOMER RECEIPT/)
assert.match(buildDepotOrderText(sample), /DEPOT ORDER/)
assert.match(renderJobText({ document_type: 'customer_receipt', payload: sample }), /TOTAL/)
assert.match(renderJobText({ document_type: 'depot_order', payload: sample }), /Pick/)

console.log('print-agent render tests ok')
