import { describe, expect, it } from 'vitest'
import { buildDepotOrderHtml, buildDepotOrderPlainText } from '@/lib/depotOrderHtml'
import type { PrintJobPayload } from '@/lib/printPayload'

const payload: PrintJobPayload = {
  business_name: 'VHM',
  depot_name: 'Dakar',
  depot_code: 'DKR',
  sale_id: '00000000-0000-0000-0000-000000000099',
  receipt_number: 'DKR-00000001',
  created_at: '2026-01-01T12:00:00.000Z',
  status: 'completed',
  cashier_name: 'Cashier',
  customer_name: null,
  customer_phone: null,
  display_currency: 'CFA',
  subtotal_cfa: 500,
  discount_type: null,
  discount_value: null,
  discount_amount_cfa: 0,
  total_cfa: 500,
  amount_tendered_cfa: 500,
  amount_applied_cfa: 500,
  change_given_cfa: 0,
  balance_added_cfa: 0,
  items: [
    {
      product_id: 'p1',
      product_name: 'Water',
      unit_name: 'Piece',
      unit_level: 0,
      quantity_in_unit: 1,
      quantity_pieces: 1,
      unit_price_cfa: 500,
      line_total_cfa: 500,
      net_line_total_cfa: 500,
    },
  ],
}

describe('depotOrderHtml', () => {
  it('builds DEPOT ORDER html', () => {
    const html = buildDepotOrderHtml(payload)
    expect(html).toContain('COMMANDE DÉPÔT')
    expect(html).toContain('DKR-00000001')
    expect(html).toContain('Water')
  })

  it('builds plain text for agent', () => {
    const text = buildDepotOrderPlainText(payload)
    expect(text).toContain('COMMANDE DÉPÔT')
    expect(text).toContain('Water')
  })
})
