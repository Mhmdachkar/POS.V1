import { describe, it, expect } from 'vitest'
import { buildDeliveryNotePrintHtml } from '@/lib/deliveryNoteDocument'
import { buildDeliveryNoteDocumentHtml } from '@/lib/commercialDocumentHtml'
import { formatCFA } from '@/lib/formatters'

describe('delivery note document', () => {
  it('builds BL without prices (no PU/Remise/Montant columns)', () => {
    const html = buildDeliveryNoteDocumentHtml({
      header: { businessName: 'Aquilux' },
      client: { name: 'Client', phone: null, address: null },
      number: 'MAIN-BL-00000001',
      date: '28/10/2026',
      showPrices: false,
      receiptNumber: 'MAIN-00000042',
      receivedByName: 'Amadou',
      rows: [
        {
          code: 'ABC',
          designation: 'Caf\u00e9',
          unit: 'Pi\u00e8ce',
          qty: '2',
        },
      ],
    })
    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('Bon de livraison')
    expect(html).toContain('MAIN-BL-00000001')
    expect(html).toContain('Caf\u00e9')
    expect(html).toContain('Amadou')
    expect(html).not.toMatch(/>\s*P\.U\.\s*</)
    expect(html).not.toMatch(/TVA|ASDI|timbre/i)
  })

  it('builds BL with prices when showPrices is true', () => {
    const html = buildDeliveryNotePrintHtml({
      number: 'MAIN-BL-00000002',
      documentDate: '2026-10-28',
      showPrices: true,
      receivedByName: null,
      receiptNumber: 'MAIN-00000042',
      client: { name: 'Client', phone: null, address: null },
      items: [
        {
          product_name: 'Caf\u00e9',
          unit_name: 'Pi\u00e8ce',
          serial_number: 'ABC',
          quantity_in_unit: 2,
          unit_price_cfa: 1000,
          line_discount_cfa: 0,
          line_total_cfa: 2000,
        },
      ],
      header: { businessName: 'Aquilux' },
    })
    expect(html).toContain('P.U.')
    expect(html).toContain('Montant')
    expect(html).toContain('Pi\u00e8ce')
    expect(html).toContain(formatCFA(2000))
    expect(html).toMatch(/>\s*Total\s*</)
  })

  it('prorates line discount on partial BL and shows total', () => {
    const html = buildDeliveryNotePrintHtml({
      number: 'MAIN-BL-00000003',
      documentDate: '2026-10-28',
      showPrices: true,
      receivedByName: null,
      receiptNumber: 'MAIN-00000042',
      client: { name: 'Client', phone: null, address: null },
      items: [
        {
          product_name: 'Caf\u00e9',
          unit_name: 'Pi\u00e8ce',
          serial_number: null,
          quantity_in_unit: 1,
          sale_quantity_in_unit: 2,
          unit_price_cfa: 1000,
          line_discount_cfa: 100,
          line_total_cfa: 900,
          sale_line_discount_cfa: 200,
        },
      ],
      header: { businessName: 'Aquilux' },
    })
    expect(html).toContain(formatCFA(900))
    expect(html).toContain(formatCFA(100))
  })
})
