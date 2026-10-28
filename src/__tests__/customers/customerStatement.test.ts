import { describe, expect, it } from 'vitest'
import type { CustomerLedgerRpcRow } from '@/lib/rpc'
import {
  buildCustomerStatementDataset,
  buildCustomerStatementHtml,
  buildStatementLines,
  statementMatchesBalance,
} from '@/lib/customerStatement'

function row(
  partial: Partial<CustomerLedgerRpcRow> & Pick<CustomerLedgerRpcRow, 'id' | 'kind' | 'occurred_at' | 'amount_cfa' | 'running_balance_cfa'>,
): CustomerLedgerRpcRow {
  return {
    reference: 'MAIN-1',
    item_summary: null,
    note: null,
    sale_id: null,
    adds_credit: false,
    ...partial,
  }
}

const header = { businessName: 'Aquilux' }
const client = { name: 'Client Test', phone: '0700000000', address: 'Abidjan' }

describe('customerStatement', () => {
  const ledger: CustomerLedgerRpcRow[] = [
    row({
      id: '1',
      kind: 'sale',
      occurred_at: '2026-01-10T10:00:00Z',
      amount_cfa: 100_000,
      running_balance_cfa: 100_000,
      adds_credit: true,
      reference: 'MAIN-00000001',
    }),
    row({
      id: '2',
      kind: 'account_payment',
      occurred_at: '2026-01-15T10:00:00Z',
      amount_cfa: -40_000,
      running_balance_cfa: 60_000,
      reference: null,
    }),
    row({
      id: '3',
      kind: 'return',
      occurred_at: '2026-02-01T10:00:00Z',
      amount_cfa: -10_000,
      running_balance_cfa: 50_000,
      reference: 'MAIN-00000001',
    }),
  ]

  it('full-range final solde equals balance_owed_cfa', () => {
    const ds = buildCustomerStatementDataset({
      customerId: 'c1',
      client,
      header,
      ledgerOldestFirst: ledger,
      balanceOwedCfa: 50_000,
    })
    expect(ds.soldeInitialCfa).toBe(0)
    expect(ds.soldeFinalCfa).toBe(50_000)
    expect(statementMatchesBalance(ds)).toBe(true)
  })

  it('period sets solde initial from prior running balance', () => {
    const { soldeInitialCfa, lines } = buildStatementLines(ledger, '2026-01-12', '2026-01-31')
    expect(soldeInitialCfa).toBe(100_000)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.libelle).toBe('Reglement')
    expect(lines[0]!.creditCfa).toBe(40_000)
  })

  it('PDF has Soft Gestion column order and UTF-8 meta', () => {
    const ds = buildCustomerStatementDataset({
      customerId: 'c1',
      client,
      header,
      ledgerOldestFirst: ledger,
      balanceOwedCfa: 50_000,
    })
    const html = buildCustomerStatementHtml(ds)
    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('<th>Date</th><th>N\u00b0</th><th>Libell\u00e9</th>')
    expect(html).toContain('D\u00e9bit')
    expect(html).toContain('Cr\u00e9dit')
    expect(html).toContain('Solde')
    expect(html).toContain('Vente')
    expect(html).toContain('R\u00e8glement')
    expect(html).toContain('Retour')
    expect(html).toContain('Solde d\u00fb au')
  })

  it('proforma kit column order helper is N Code Designation Unite Qte PU Remise Montant', async () => {
    const { buildProformaDocumentHtml } = await import('@/lib/commercialDocumentHtml')
    const html = buildProformaDocumentHtml({
      header,
      client,
      number: 'MAIN-PRO-00000001',
      date: '28/10/2026',
      rows: [
        {
          code: 'ABC',
          designation: 'Caf\u00e9',
          unit: 'Pi\u00e8ce',
          qty: '2',
          unitPrice: '1 000 CFA',
          discount: '0 CFA',
          amount: '2 000 CFA',
        },
      ],
      total: 2000,
      discount: 0,
      net: 2000,
    })
    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('Caf\u00e9')
    expect(html.indexOf('N\u00b0')).toBeGreaterThan(-1)
    expect(html).toMatch(/N\u00b0[\s\S]*Code[\s\S]*D\u00e9signation[\s\S]*Unit\u00e9[\s\S]*Qt\u00e9[\s\S]*P\.U\.[\s\S]*Remise[\s\S]*Montant/)
    expect(html).toContain('Arr\u00eat\u00e9e la pr\u00e9sente proforma')
    expect(html).not.toMatch(/TVA|ASDI|timbre/i)
  })
})