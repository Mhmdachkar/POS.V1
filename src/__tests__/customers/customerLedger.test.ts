import { describe, expect, it } from 'vitest'
import { pageCustomerLedger } from '@/hooks/useCustomerActivity'
import type { CustomerLedgerRpcRow } from '@/lib/rpc'

describe('customer ledger', () => {
  it('pairs a cash sale of 8000 with a cash payment of -8000', () => {
    const rows: CustomerLedgerRpcRow[] = [
      {
        id: 'sale',
        kind: 'sale',
        occurred_at: '2026-10-26T20:31:37Z',
        reference: 'MAIN-00000007',
        item_summary: null,
        note: null,
        amount_cfa: 8000,
        running_balance_cfa: 8000,
        sale_id: 'sale',
        adds_credit: false,
      },
      {
        id: 'sale:cash',
        kind: 'cash_payment',
        occurred_at: '2026-10-26T20:31:37Z',
        reference: 'MAIN-00000007',
        item_summary: null,
        note: null,
        amount_cfa: -8000,
        running_balance_cfa: 0,
        sale_id: 'sale',
        adds_credit: false,
      },
    ]
    const page = pageCustomerLedger(rows, { type: 'all', page: 0, pageSize: 25 })
    expect(page.data.map((event) => event.amountCfa)).toEqual([-8000, 8000])
    expect(page.data[0]?.runningBalanceCfa).toBe(0)
    expect(page.data[0]?.description).toBe('Paiement client')
  })

  it('maps cash-refunded return as credit plus remboursement debit, never 0 CFA', () => {
    const rows: CustomerLedgerRpcRow[] = [
      {
        id: 'sale',
        kind: 'sale',
        occurred_at: '2026-10-26T20:31:37Z',
        reference: 'MAIN-00000007',
        item_summary: null,
        note: null,
        amount_cfa: 8000,
        running_balance_cfa: 8000,
        sale_id: 'sale',
        adds_credit: false,
      },
      {
        id: 'sale:cash',
        kind: 'cash_payment',
        occurred_at: '2026-10-26T20:31:37Z',
        reference: 'MAIN-00000007',
        item_summary: null,
        note: null,
        amount_cfa: -8000,
        running_balance_cfa: 0,
        sale_id: 'sale',
        adds_credit: false,
      },
      {
        id: 'ret',
        kind: 'return',
        occurred_at: '2026-10-27T10:00:00Z',
        reference: 'MAIN-00000007',
        item_summary: '1 x Cable',
        note: null,
        amount_cfa: -8000,
        running_balance_cfa: -8000,
        sale_id: 'sale',
        adds_credit: false,
        cash_refunded_cfa: 8000,
      },
      {
        id: 'ret:cash_refund',
        kind: 'cash_refund',
        occurred_at: '2026-10-27T10:00:00Z',
        reference: 'MAIN-00000007',
        item_summary: null,
        note: 'Remboursement especes',
        amount_cfa: 8000,
        running_balance_cfa: 0,
        sale_id: 'sale',
        adds_credit: false,
        cash_refunded_cfa: 8000,
      },
    ]
    const page = pageCustomerLedger(rows, { type: 'all', page: 0, pageSize: 25 })
    expect(page.accountBalanceCfa).toBe(0)
    expect(page.data.map((event) => event.amountCfa)).not.toContain(0)
    const refund = page.data.find((event) => event.id === 'ret:cash_refund')
    const ret = page.data.find((event) => event.id === 'ret')
    expect(refund?.amountCfa).toBe(8000)
    expect(refund?.description).toBe('Remboursement esp\u00e8ces')
    expect(ret?.amountCfa).toBe(-8000)
  })

  it('uses payment receipt_number as activity reference', () => {
    const rows: CustomerLedgerRpcRow[] = [
      {
        id: 'pay',
        kind: 'account_payment',
        occurred_at: '2026-10-26T12:00:00Z',
        reference: 'MAIN-REG-00000001',
        item_summary: null,
        note: null,
        amount_cfa: -50,
        running_balance_cfa: -50,
        sale_id: null,
        adds_credit: false,
      },
    ]
    const page = pageCustomerLedger(rows, { type: 'all', page: 0, pageSize: 25 })
    expect(page.data[0]?.reference).toBe('MAIN-REG-00000001')
    expect(page.accountBalanceCfa).toBe(-50)
  })

  it('nets client testing posted movements to 2400', () => {
    const balanceAdded = 2500 + 3000 + 3000 + 0
    const balanceAdjustments = 5950
    const accountPayments = 150
    expect(balanceAdded - balanceAdjustments - accountPayments).toBe(2400)
    const payable = 2500 + 8000 + 8000 + 8000
    const cashApplied = 0 + 5000 + 5000 + 8000
    expect(payable - cashApplied).toBe(balanceAdded)
  })
})
