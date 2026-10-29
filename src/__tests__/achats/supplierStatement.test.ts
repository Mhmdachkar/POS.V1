import { describe, expect, it } from 'vitest'
import type { SupplierLedgerRpcRow } from '@/lib/supplierLedger'
import {
  supplierLedgerAccountBalanceCfa,
  supplierLedgerMatchesOwed,
  withFlooredSupplierRunningBalances,
} from '@/lib/supplierLedger'
import {
  buildSupplierStatementDataset,
  buildSupplierStatementHtml,
  buildSupplierStatementLines,
  statementMatchesBalance,
} from '@/lib/supplierStatement'

function row(
  partial: Partial<SupplierLedgerRpcRow> &
    Pick<SupplierLedgerRpcRow, 'id' | 'kind' | 'occurred_at' | 'amount_cfa' | 'running_balance_cfa'>,
): SupplierLedgerRpcRow {
  return {
    reference: 'MAIN-BR-00000001',
    detail: null,
    purchase_receipt_id: null,
    supplier_payment_id: null,
    ...partial,
  }
}

const header = { businessName: 'Aquilux' }
const party = { name: 'Fournisseur Test', phone: '0700000000', address: 'Abidjan' }

describe('supplier ledger floor', () => {
  it('floors running balance at 0 when a credit BR is cancelled after a payment', () => {
    const events = [
      { amount_cfa: 100_000 },
      { amount_cfa: -40_000 },
      { amount_cfa: -100_000 },
    ]
    const floored = withFlooredSupplierRunningBalances(events)
    expect(floored.map((e) => e.running_balance_cfa)).toEqual([100_000, 60_000, 0])
    expect(supplierLedgerAccountBalanceCfa(floored)).toBe(0)
    expect(supplierLedgerMatchesOwed(0, 0)).toBe(true)
  })

  it('keeps a later BR at the floored zero instead of an unfloored negative carry', () => {
    const events = [
      { amount_cfa: 100 },
      { amount_cfa: -40 },
      { amount_cfa: -100 },
      { amount_cfa: 50 },
    ]
    const floored = withFlooredSupplierRunningBalances(events)
    expect(floored[2]!.running_balance_cfa).toBe(0)
    expect(floored[3]!.running_balance_cfa).toBe(50)
  })
})

describe('supplierStatement', () => {
  const floorCase = withFlooredSupplierRunningBalances([
    row({
      id: '1',
      kind: 'purchase',
      occurred_at: '2026-01-10T10:00:00Z',
      amount_cfa: 100_000,
      running_balance_cfa: 0,
      detail: 'BR à crédit',
      reference: 'MAIN-BR-00000001',
    }),
    row({
      id: '2',
      kind: 'payment',
      occurred_at: '2026-01-15T10:00:00Z',
      amount_cfa: -40_000,
      running_balance_cfa: 0,
      detail: 'Règlement fournisseur',
      reference: null,
    }),
    row({
      id: '3',
      kind: 'purchase_cancel',
      occurred_at: '2026-02-01T10:00:00Z',
      amount_cfa: -100_000,
      running_balance_cfa: 0,
      detail: 'Annulation BR',
      reference: 'MAIN-BR-00000001',
    }),
  ])

  it('full-range final solde equals Solde dû after credit-BR cancel floor', () => {
    const ds = buildSupplierStatementDataset({
      supplierId: 's1',
      party,
      header,
      ledgerOldestFirst: floorCase,
      balanceOwedCfa: 0,
    })
    expect(ds.soldeFinalCfa).toBe(0)
    expect(ds.accountBalanceCfa).toBe(0)
    expect(ds.balanceOwedCfa).toBe(0)
    expect(statementMatchesBalance(ds)).toBe(true)

    const withoutFloor = [
      floorCase[0]!,
      { ...floorCase[1]!, running_balance_cfa: 60_000 },
      { ...floorCase[2]!, running_balance_cfa: -40_000 },
    ]
    const mismatch = buildSupplierStatementDataset({
      supplierId: 's1',
      party,
      header,
      ledgerOldestFirst: withoutFloor,
      balanceOwedCfa: 0,
    })
    expect(mismatch.soldeFinalCfa).toBe(-40_000)
    expect(statementMatchesBalance(mismatch)).toBe(false)
  })

  it('maps BR to crédit and règlement to débit', () => {
    const { lines } = buildSupplierStatementLines(floorCase, null, null)
    expect(lines[0]!.type).toBe('BR')
    expect(lines[0]!.creditCfa).toBe(100_000)
    expect(lines[0]!.debitCfa).toBe(0)
    expect(lines[1]!.type).toBe('Reglement')
    expect(lines[1]!.debitCfa).toBe(40_000)
    expect(lines[1]!.creditCfa).toBe(0)
    expect(lines[2]!.type).toBe('Annulation')
    expect(lines[2]!.debitCfa).toBe(100_000)
  })

  it('PDF has Soft Gestion column order, fournisseur block, and Édité le', () => {
    const owedLedger = withFlooredSupplierRunningBalances([
      row({
        id: '1',
        kind: 'purchase',
        occurred_at: '2026-01-10T10:00:00Z',
        amount_cfa: 50_000,
        running_balance_cfa: 0,
        detail: 'BR à crédit',
      }),
    ])
    const ds = buildSupplierStatementDataset({
      supplierId: 's1',
      party,
      header,
      ledgerOldestFirst: owedLedger,
      balanceOwedCfa: 50_000,
    })
    expect(statementMatchesBalance(ds)).toBe(true)
    const html = buildSupplierStatementHtml(ds)
    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('@page { size: A4; margin: 0; }')
    expect(html).toContain('Relev\u00e9 de compte fournisseur')
    expect(html).toContain('<h3>Fournisseur</h3>')
    expect(html).toContain('<th>Date</th><th>N\u00b0</th><th>Type</th><th>Libell\u00e9</th>')
    expect(html).toContain('D\u00e9bit')
    expect(html).toContain('Cr\u00e9dit')
    expect(html).toContain('Solde')
    expect(html).toContain('Solde d\u00fb')
    expect(html).toContain('Arr\u00eat\u00e9 le pr\u00e9sent relev\u00e9')
    expect(html).toContain('\u00c9dit\u00e9 le')
    expect(html).toContain('table.doc.statement')
    expect(html).toContain('border: 1px solid #d0d5dd')
    expect(html).not.toContain('statement-page-footer')
    expect(html).not.toMatch(/TVA|ASDI|timbre/i)
  })

  it('period sets solde initial from prior running balance', () => {
    const { soldeInitialCfa, lines } = buildSupplierStatementLines(
      floorCase,
      '2026-01-12',
      '2026-01-31',
    )
    expect(soldeInitialCfa).toBe(100_000)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.type).toBe('Reglement')
    expect(lines[0]!.debitCfa).toBe(40_000)
  })

  it('includes opening balance row in dataset', () => {
    const ds = buildSupplierStatementDataset({
      supplierId: 's1',
      party,
      header,
      ledgerOldestFirst: floorCase,
      balanceOwedCfa: 0,
      periodFromYmd: '2026-01-12',
      periodToYmd: '2026-01-31',
    })
    expect(ds.lines[0]?.isOpening).toBe(true)
    expect(ds.lines[0]?.soldeCfa).toBe(100_000)
    expect(statementMatchesBalance(ds)).toBe(true)
  })
})
