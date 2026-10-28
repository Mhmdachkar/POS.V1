import { describe, it, expect, vi } from 'vitest'
import {
  buildProformaPrintHtml,
  proformaWhatsAppText,
} from '@/lib/proformaDocument'
import type { ProformaItemRow, ProformaRow } from '@/hooks/useProformas'

const proforma: ProformaRow = {
  id: 'pf-1',
  depot_id: 'd1',
  number: 'MAIN-PRO-00000001',
  status: 'draft',
  customer_id: null,
  document_date: '2026-10-28',
  external_ref: null,
  notes: null,
  subtotal_cfa: 2000,
  discount_type: null,
  discount_value: null,
  discount_amount_cfa: 0,
  total_cfa: 2000,
  converted_sale_id: null,
  created_by: 's1',
  created_at: '2026-10-28T10:00:00Z',
  updated_at: '2026-10-28T10:00:00Z',
}

const items: ProformaItemRow[] = [
  {
    id: 'i1',
    proforma_id: 'pf-1',
    product_id: 'p1',
    unit_level: 0,
    quantity_in_unit: 2,
    unit_price_cfa: 1000,
    line_discount_cfa: 0,
    line_total_cfa: 2000,
    cost_price_cfa: 500,
    product_name: 'Caf\u00e9',
    unit_name: 'Pi\u00e8ce',
    serial_number: 'ABC',
    sort_index: 1,
  },
]

describe('proformaDocument', () => {
  it('builds utf-8 proforma html with Soft Gestion columns', () => {
    const html = buildProformaPrintHtml({
      proforma,
      items,
      client: { name: 'Client Test', phone: null, address: null },
      header: { businessName: 'Aquilux' },
    })
    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('MAIN-PRO-00000001')
    expect(html).toContain('Caf\u00e9')
    expect(html).toMatch(/P\.U\.[\s\S]*Remise[\s\S]*Montant/)
    expect(html).not.toMatch(/TVA|ASDI|timbre/i)
  })

  it('whatsapp text includes number and total', () => {
    const text = proformaWhatsAppText({
      proforma,
      items,
      client: { name: 'Client Test', phone: null, address: null },
    })
    expect(text).toContain('MAIN-PRO-00000001')
    expect(text).toContain('Client Test')
  })
})

describe('proformaHasPriceDrift', () => {
  it('detects catalog vs quote price difference', async () => {
    const { proformaHasPriceDrift } = await import('@/lib/loadProformaToCart')
    const catalog = new Map([
      [
        'p1:0',
        {
          product_id: 'p1',
          unit_level: 0,
          selling_price_cfa: 1200,
          cost_price_cfa: 500,
          conversion_to_base: 1,
          unit_name: 'Piece',
          product_name: 'Cafe',
          product_photo_url: '',
        },
      ],
    ])
    expect(proformaHasPriceDrift(items, catalog)).toBe(true)
    catalog.set('p1:0', { ...catalog.get('p1:0')!, selling_price_cfa: 1000 })
    expect(proformaHasPriceDrift(items, catalog)).toBe(false)
  })
})
