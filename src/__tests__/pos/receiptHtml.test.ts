import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildReceiptHtml, printReceiptHtml, escapeReceiptText, receiptDataFromSaleDetail } from '@/lib/receiptHtml'
import { formatCFA, formatDateTime } from '@/lib/formatters'
import type { ReceiptData } from '@/lib/receiptHtml'
import type { SaleDetailData } from '@/hooks/useSales'

function sample(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    businessName: 'VHM POS',
    depotName: 'Depot Dakar',
    receiptNumber: 'DKR-00000010',
    createdAt: '2026-09-16T01:45:00Z',
    cashierName: 'Cashier Dakar',
    customerName: 'Fatou Diallo',
    status: 'completed',
    items: [
      {
        product_name: 'Cola Can 33cl',
        unit_name: 'Can',
        quantity_in_unit: 2,
        unit_price_cfa: 350,
        line_total_cfa: 700,
      },
    ],
    subtotal_cfa: 700,
    discount_type: null,
    discount_value: null,
    discount_amount_cfa: 0,
    total_cfa: 700,
    amount_tendered_cfa: 1000,
    change_given_cfa: 300,
    balance_added_cfa: 0,
    ...overrides,
  }
}

describe('buildReceiptHtml', () => {
  it('renders a structured POS ticket with store, items, cash, and PAYÉ', () => {
    const html = buildReceiptHtml(sample())
    expect(html).toContain('VHM POS')
    expect(html).toContain('Depot Dakar')
    expect(html).toContain('LOT: DKR')
    expect(html).toContain('DKR-00000010')
    expect(html).toContain('Fatou Diallo')
    expect(html).toContain('Cashier Dakar')
    expect(html).toContain(formatDateTime('2026-09-16T01:45:00Z'))
    expect(html).toContain('Cola Can 33cl')
    expect(html).toContain('2 Can')
    expect(html).toContain(formatCFA(350))
    expect(html).toContain(formatCFA(700))
    expect(html).toContain('Sous-total')
    expect(html).toContain('TOTAL')
    expect(html).toContain('Espèces')
    expect(html).toContain(formatCFA(1000))
    expect(html).toContain('Monnaie')
    expect(html).toContain(formatCFA(300))
    expect(html).toContain('PAYÉ')
    expect(html).toContain('Merci')
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/localhost/i)
    expect(html).not.toMatch(/5173/)
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('labels walk-in sales and omits empty depot/cashier rows', () => {
    const html = buildReceiptHtml(sample({
      depotName: null,
      cashierName: null,
      customerName: null,
      change_given_cfa: 0,
      amount_tendered_cfa: 700,
    }))
    expect(html).toContain('Client de passage')
    expect(html).not.toContain('Depot Dakar')
    expect(html).not.toContain('Caissier')
    expect(html).not.toContain('Monnaie')
  })

  it('shows discount, balance, refund, and ANNULÉ stamp', () => {
    const html = buildReceiptHtml(sample({
      status: 'voided',
      discount_type: 'percent',
      discount_value: 10,
      discount_amount_cfa: 70,
      total_cfa: 630,
      change_given_cfa: 0,
      balance_added_cfa: 200,
      refund_amount_cfa: 100,
    }))
    expect(html).toContain('Remise (10%)')
    expect(html).toContain('Ajouté au solde')
    expect(html).toContain('Remboursé')
    expect(html).toContain('ANNULÉ')
    expect(html).not.toContain('PAYÉ')
  })

  it('escapes customer and product names', () => {
    const html = buildReceiptHtml(sample({
      customerName: '<script>x</script>',
      items: [{
        product_name: 'Rice & Beans',
        unit_name: 'Bag',
        quantity_in_unit: 1,
        unit_price_cfa: 700,
        line_total_cfa: 700,
      }],
    }))
    expect(html).toContain(escapeReceiptText('<script>x</script>'))
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('Rice &amp; Beans')
  })
})

describe('printReceiptHtml', () => {
  afterEach(() => {
    document.getElementById('vhm-receipt-drawer')?.remove()
    vi.restoreAllMocks()
  })

  it('prints from a body-level node and blanks the document title', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    document.title = 'VHM POS'
    printReceiptHtml(buildReceiptHtml(sample()), 'vhm-receipt-drawer')
    const root = document.getElementById('vhm-receipt-drawer')
    expect(root).toBeTruthy()
    expect(root?.className).toBe('print-only')
    expect(root?.parentElement).toBe(document.body)
    expect(print).toHaveBeenCalledTimes(1)
    expect(document.title).toBe('')
    expect(root?.innerHTML).not.toMatch(/localhost/i)
  })
})

describe('receiptDataFromSaleDetail', () => {
  it('maps DB sale fields including created_at and line items', () => {
    const sale: SaleDetailData = {
      id: 'sale-1',
      depot_id: 'depot-a',
      cashier_id: 'c1',
      customer_id: 'cust-1',
      shift_id: null,
      receipt_number: 'DKR-00000010',
      status: 'completed',
      display_currency: 'CFA',
      cfa_to_usd_rate_used: 620,
      subtotal_cfa: 700,
      discount_type: null,
      discount_value: null,
      discount_amount_cfa: 0,
      total_cfa: 700,
      amount_tendered_cfa: 1000,
      amount_applied_cfa: 700,
      change_given_cfa: 300,
      balance_added_cfa: 0,
      created_at: '2026-09-16T01:45:00Z',
      customer_name: 'Fatou Diallo',
      customer_phone: null,
      customer_balance_owed_cfa: 0,
      cashier_name: 'Cashier Dakar',
      items: [{
        id: 'si-1',
        sale_id: 'sale-1',
        product_id: 'p1',
        unit_level: 0,
        quantity_in_unit: 2,
        quantity_pieces: 2,
        unit_price_cfa: 350,
        cost_price_cfa: 200,
        line_total_cfa: 700,
        net_line_total_cfa: 700,
        product_name: 'Cola Can 33cl',
        unit_name: 'Can',
      }],
      returns: [{
        id: 'ret-1',
        sale_id: 'sale-1',
        shift_id: null,
        processed_by: 'c1',
        reason: null,
        refund_amount_cfa: 50,
        balance_adjustment_cfa: 0,
        cash_refunded_cfa: 50,
        created_at: '2026-09-16T02:00:00Z',
        sale_return_items: [],
      }],
      payments: [],
    }
    const data = receiptDataFromSaleDetail(sale, 'VHM POS', 'Depot Dakar')
    expect(data.createdAt).toBe('2026-09-16T01:45:00Z')
    expect(data.receiptNumber).toBe('DKR-00000010')
    expect(data.items[0].product_name).toBe('Cola Can 33cl')
    expect(data.refund_amount_cfa).toBe(50)
    expect(data.cashierName).toBe('Cashier Dakar')
    expect(data.customerName).toBe('Fatou Diallo')
  })
})
