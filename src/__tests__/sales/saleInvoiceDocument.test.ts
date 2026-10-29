import { describe, expect, it } from 'vitest'
import { buildSaleInvoicePrintHtml } from '@/lib/saleInvoiceDocument'
import { formatCFA } from '@/lib/formatters'
import type { SaleDetailData } from '@/hooks/useSales'

function baseSale(overrides: Partial<SaleDetailData> = {}): SaleDetailData {
  return {
    id: 's1',
    depot_id: 'd1',
    customer_id: 'c1',
    cashier_id: 'st1',
    shift_id: 'sh1',
    receipt_number: 'MAIN-00000099',
    status: 'completed',
    created_at: '2026-10-28T10:00:00Z',
    document_date: null,
    external_ref: null,
    subtotal_cfa: 10_000,
    discount_type: null,
    discount_value: null,
    discount_amount_cfa: 0,
    total_cfa: 10_000,
    admin_override_total_cfa: null,
    amount_tendered_cfa: 4_000,
    amount_applied_cfa: 4_000,
    change_given_cfa: 0,
    balance_added_cfa: 6_000,
    display_currency: 'CFA',
    cfa_to_usd_rate_used: 620,
    customer_name: 'Client Test',
    customer_phone: '0700000000',
    customer_balance_owed_cfa: 6_000,
    cashier_name: 'Caissier',
    cashier_role: 'cashier',
    fulfillment: null,
    items: [
      {
        id: 'si1',
        sale_id: 's1',
        product_id: 'p1',
        unit_level: 0,
        quantity_in_unit: 2,
        quantity_pieces: 2,
        unit_price_cfa: 5_000,
        cost_price_cfa: 3_000,
        line_discount_cfa: 0,
        line_total_cfa: 10_000,
        net_line_total_cfa: 10_000,
        product_name: 'Cafe',
        unit_name: 'Piece',
        serial_number: 'SKU-1',
      },
    ],
    returns: [],
    payments: [],
    ...overrides,
  } as SaleDetailData
}

describe('saleInvoiceDocument', () => {
  it('renders facture with Paye and Reste a payer from sale fields', () => {
    const html = buildSaleInvoicePrintHtml({
      sale: baseSale(),
      client: { name: 'Client Test', phone: null, address: null },
      header: { businessName: 'Aquilux' },
    })
    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('Facture')
    expect(html).toContain('MAIN-00000099')
    expect(html).toContain('Pay\u00e9')
    expect(html).toContain('Reste \u00e0 payer')
    expect(html).toContain(formatCFA(4_000))
    expect(html).toContain(formatCFA(6_000))
    expect(html).toContain(formatCFA(10_000))
    expect(html).not.toMatch(/TVA|ASDI|timbre/i)
  })

  it('lists returns under Avoir without reducing invoice Total', () => {
    const html = buildSaleInvoicePrintHtml({
      sale: baseSale({
        status: 'partially_returned',
        returns: [
          {
            id: 'r1',
            sale_id: 's1',
            shift_id: null,
            processed_by: 'st1',
            reason: null,
            refund_amount_cfa: 2_000,
            balance_adjustment_cfa: 2_000,
            cash_refunded_cfa: 0,
            created_at: '2026-10-29T10:00:00Z',
            sale_return_items: [
              {
                id: 'ri1',
                return_id: 'r1',
                sale_item_id: 'si1',
                quantity_in_unit: 1,
                quantity_pieces: 1,
                refund_amount_cfa: 2_000,
              },
            ],
          },
        ],
      }),
      client: { name: 'Client Test', phone: null, address: null },
      header: { businessName: 'Aquilux' },
    })
    expect(html).toContain('Avoir')
    expect(html).toContain(formatCFA(2_000))
    expect(html).toContain('indicatifs')
    expect(html).toMatch(/>\s*Total\s*</)
    expect(html).toContain(formatCFA(10_000))
  })

  it('uses proforma column order on line table', () => {
    const html = buildSaleInvoicePrintHtml({
      sale: baseSale(),
      client: { name: 'Client Test', phone: null, address: null },
      header: { businessName: 'Aquilux' },
    })
    expect(html.indexOf('N\u00b0')).toBeGreaterThan(-1)
    expect(html).toMatch(/N\u00b0[\s\S]*Code[\s\S]*D\u00e9signation[\s\S]*Unit\u00e9[\s\S]*Qt\u00e9[\s\S]*P\.U\.[\s\S]*Remise[\s\S]*Montant/)
  })
})
