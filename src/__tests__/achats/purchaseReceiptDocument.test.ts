import { describe, expect, it } from 'vitest'
import { buildPurchaseReceiptDocumentHtml } from '@/lib/purchaseReceiptDocument'
import { formatCFA } from '@/lib/formatters'
import type { PurchaseReceiptItemRow, PurchaseReceiptRow } from '@/hooks/useAchats'

const receipt: PurchaseReceiptRow = {
  id: 'br1',
  depot_id: 'd1',
  supplier_id: 's1',
  number: 'MAIN-BR-00000001',
  status: 'validated',
  document_date: '2026-01-10',
  external_ref: 'FAC-9',
  notes: null,
  subtotal_cfa: 50000,
  total_cfa: 50000,
  payment_mode: 'credit',
  payment_method: null,
  validated_at: '2026-01-10T12:00:00Z',
  cancelled_at: null,
  created_at: '2026-01-10T12:00:00Z',
  updated_at: '2026-01-10T12:00:00Z',
}

const items: PurchaseReceiptItemRow[] = [
  {
    id: 'i1',
    purchase_receipt_id: 'br1',
    product_id: 'p1',
    unit_level: 0,
    quantity_in_unit: 2,
    quantity_pieces: 2,
    unit_cost_cfa: 25000,
    line_total_cfa: 50000,
    product_name: 'Ciment',
    unit_name: 'Sac',
    sort_index: 0,
  },
]

describe('purchaseReceiptDocument', () => {
  it('renders BR A4 with fournisseur block, due date and En retard when overdue', () => {
    const html = buildPurchaseReceiptDocumentHtml({
      receipt,
      items,
      supplier: {
        name: 'Fournisseur Test',
        phone: '07000000',
        address: 'Abidjan',
        payment_term_days: 5,
      },
      header: { businessName: 'Aquilux' },
    })
    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('@page { size: A4; margin: 0; }')
    expect(html).toContain('Bon de réception')
    expect(html).toContain('MAIN-BR-00000001')
    expect(html).toContain('Fournisseur')
    expect(html).toContain('Fournisseur Test')
    expect(html).toContain('Échéance')
    expect(html).toContain('En retard')
    expect(html).toContain(formatCFA(50000))
    expect(html).toContain('Ciment')
  })

  it('prints a cancelled BR with ANNULÉ watermark', () => {
    const html = buildPurchaseReceiptDocumentHtml({
      receipt: { ...receipt, status: 'cancelled', cancelled_at: '2026-01-11T12:00:00Z' },
      items,
      supplier: { name: 'Fournisseur Test' },
      header: { businessName: 'Aquilux' },
    })
    expect(html).toContain('doc-watermark')
    expect(html).toContain('ANNULÉ')
    expect(html).toContain('Annulé')
  })
})
