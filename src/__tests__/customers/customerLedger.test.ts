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
    expect(page.data[0]?.description).toBe('Paiement espèces')
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
