import { describe, expect, it } from 'vitest'
import { buildSupplierPaymentSlipHtml } from '@/lib/supplierPaymentDocument'
import { formatCFA } from '@/lib/formatters'

describe('supplierPaymentDocument', () => {
  it('renders short A4 RGF slip', () => {
    const html = buildSupplierPaymentSlipHtml({
      receiptNumber: 'MAIN-RGF-00000001',
      amountCfa: 40000,
      methodLabel: 'Espèces',
      recordedAt: '2026-01-15T10:00:00Z',
      note: 'Acompte',
      newBalanceOwedCfa: 10000,
      supplier: { name: 'Fournisseur Test', phone: '0700', address: null },
      header: { businessName: 'Aquilux' },
    })
    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('@page { size: A4; margin: 0; }')
    expect(html).toContain('Reçu de règlement fournisseur')
    expect(html).toContain('MAIN-RGF-00000001')
    expect(html).toContain(formatCFA(40000))
    expect(html).toContain(formatCFA(10000))
    expect(html).toContain('Acompte')
    expect(html).not.toMatch(/@page \{ size: A5/)
  })
})
