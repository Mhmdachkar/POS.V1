/**
 * Replay of QA client "testing" (80203f64-6d56-4bba-b896-c1c7a9af3f8c).
 * Events are the production customer_ledger rows, ordered as the RPC does
 * (occurred_at, then sale / cash_payment / return / cash_refund / account_payment).
 */

import { describe, expect, it } from 'vitest'
import {
  incrementalOwedCfa,
  ledgerRunningCfa,
  payableDebtFromDisplayedCfa,
  syncedOwedCfa,
  type TestingClientLedgerEvent,
} from '@/lib/customerBalanceSync'

const TESTING_CLIENT_EVENTS: TestingClientLedgerEvent[] = [
  { occurredAt: '2026-10-26T15:25:43.849723+00', kind: 'sale', reference: 'MAIN-00000003', amountCfa: 8000 },
  { occurredAt: '2026-10-26T15:25:43.849723+00', kind: 'cash_payment', reference: 'MAIN-00000003', amountCfa: -5000 },
  { occurredAt: '2026-10-26T15:26:32.561428+00', kind: 'return', reference: 'MAIN-00000003', amountCfa: -2250 },
  { occurredAt: '2026-10-26T15:27:25.560284+00', kind: 'account_payment', reference: 'MAIN-REG-00000003', amountCfa: -50 },
  { occurredAt: '2026-10-26T15:30:30.737026+00', kind: 'return', reference: 'MAIN-00000003', amountCfa: -6750 },
  { occurredAt: '2026-10-26T15:30:30.737026+00', kind: 'cash_refund', reference: 'MAIN-00000003', amountCfa: 6050 },
  { occurredAt: '2026-10-26T20:06:27.000893+00', kind: 'sale', reference: 'MAIN-00000004', amountCfa: 8000 },
  { occurredAt: '2026-10-26T20:06:27.000893+00', kind: 'cash_payment', reference: 'MAIN-00000004', amountCfa: -5000 },
  { occurredAt: '2026-10-26T20:07:40.836814+00', kind: 'return', reference: 'MAIN-00000004', amountCfa: -2000 },
  { occurredAt: '2026-10-26T20:08:27.104279+00', kind: 'return', reference: 'MAIN-00000004', amountCfa: -6000 },
  { occurredAt: '2026-10-26T20:08:27.104279+00', kind: 'cash_refund', reference: 'MAIN-00000004', amountCfa: 5000 },
  { occurredAt: '2026-10-26T20:09:48.230689+00', kind: 'account_payment', reference: 'MAIN-REG-00000001', amountCfa: -100 },
  { occurredAt: '2026-10-26T20:31:37.716609+00', kind: 'sale', reference: 'MAIN-00000007', amountCfa: 8000 },
  { occurredAt: '2026-10-26T20:31:37.716609+00', kind: 'cash_payment', reference: 'MAIN-00000007', amountCfa: -8000 },
  { occurredAt: '2026-10-26T20:32:50.376100+00', kind: 'return', reference: 'MAIN-00000007', amountCfa: -2000 },
  { occurredAt: '2026-10-26T20:32:50.376100+00', kind: 'cash_refund', reference: 'MAIN-00000007', amountCfa: 2000 },
  { occurredAt: '2026-10-28T21:45:39.352486+00', kind: 'sale', reference: 'MAIN-00000013', amountCfa: 2500 },
  { occurredAt: '2026-10-28T21:45:39.352486+00', kind: 'cash_payment', reference: 'MAIN-00000013', amountCfa: -2500 },
  { occurredAt: '2026-10-28T21:46:29.018808+00', kind: 'sale', reference: 'MAIN-00000014', amountCfa: 7500 },
  { occurredAt: '2026-10-28T21:46:29.018808+00', kind: 'cash_payment', reference: 'MAIN-00000014', amountCfa: -7500 },
  { occurredAt: '2026-10-28T21:47:22.013200+00', kind: 'return', reference: 'MAIN-00000014', amountCfa: -2500 },
  { occurredAt: '2026-10-28T21:47:22.013200+00', kind: 'cash_refund', reference: 'MAIN-00000014', amountCfa: 2500 },
  { occurredAt: '2026-10-28T21:50:43.342587+00', kind: 'sale', reference: 'MAIN-00000015', amountCfa: 1900 },
  { occurredAt: '2026-10-28T21:50:43.342587+00', kind: 'cash_payment', reference: 'MAIN-00000015', amountCfa: -1900 },
  { occurredAt: '2026-10-28T23:12:50.058619+00', kind: 'sale', reference: 'MAIN-00000016', amountCfa: 155000 },
  { occurredAt: '2026-10-28T23:12:50.058619+00', kind: 'cash_payment', reference: 'MAIN-00000016', amountCfa: -155000 },
  { occurredAt: '2026-10-28T23:15:44.426914+00', kind: 'sale', reference: 'MAIN-00000017', amountCfa: 2500 },
  { occurredAt: '2026-10-28T23:15:44.426914+00', kind: 'cash_payment', reference: 'MAIN-00000017', amountCfa: -2500 },
  { occurredAt: '2026-10-29T13:28:50.931692+00', kind: 'sale', reference: 'MAIN-00000018', amountCfa: 6750 },
  { occurredAt: '2026-10-29T13:28:50.931692+00', kind: 'cash_payment', reference: 'MAIN-00000018', amountCfa: -6750 },
  { occurredAt: '2026-10-29T13:30:39.201947+00', kind: 'return', reference: 'MAIN-00000018', amountCfa: -2250 },
  { occurredAt: '2026-10-29T13:30:39.201947+00', kind: 'cash_refund', reference: 'MAIN-00000018', amountCfa: 2250 },
  { occurredAt: '2026-10-29T13:37:04.583328+00', kind: 'sale', reference: 'MAIN-00000020', amountCfa: 5000 },
  { occurredAt: '2026-10-29T13:37:04.583328+00', kind: 'cash_payment', reference: 'MAIN-00000020', amountCfa: -5000 },
  { occurredAt: '2026-10-30T15:28:30.930180+00', kind: 'sale', reference: 'MAIN-00000021', amountCfa: 2500 },
  { occurredAt: '2026-10-30T15:28:30.930180+00', kind: 'cash_payment', reference: 'MAIN-00000021', amountCfa: -2500 },
  { occurredAt: '2026-10-30T15:29:33.366702+00', kind: 'sale', reference: 'MAIN-00000022', amountCfa: 2500 },
  { occurredAt: '2026-10-30T15:30:29.113670+00', kind: 'account_payment', reference: 'MAIN-REG-00000003', amountCfa: -1000 },
  { occurredAt: '2026-10-30T15:32:00.000190+00', kind: 'return', reference: 'MAIN-00000021', amountCfa: -2500 },
  { occurredAt: '2026-10-30T15:32:00.000190+00', kind: 'cash_refund', reference: 'MAIN-00000021', amountCfa: 2500 },
  { occurredAt: '2026-10-30T15:34:30.378613+00', kind: 'sale', reference: 'MAIN-00000023', amountCfa: 2500 },
  { occurredAt: '2026-10-30T15:34:30.378613+00', kind: 'cash_payment', reference: 'MAIN-00000023', amountCfa: -2500 },
  { occurredAt: '2026-11-02T14:28:28.291163+00', kind: 'sale', reference: 'MAIN-00000024', amountCfa: 4500 },
  { occurredAt: '2026-11-02T14:28:28.291163+00', kind: 'cash_payment', reference: 'MAIN-00000024', amountCfa: -4500 },
  { occurredAt: '2026-11-02T14:30:18.788734+00', kind: 'return', reference: 'MAIN-00000024', amountCfa: -1000 },
  { occurredAt: '2026-11-02T14:30:18.788734+00', kind: 'cash_refund', reference: 'MAIN-00000024', amountCfa: 1000 },
  { occurredAt: '2026-11-02T14:30:40.232687+00', kind: 'return', reference: 'MAIN-00000024', amountCfa: -2250 },
  { occurredAt: '2026-11-02T14:30:40.232687+00', kind: 'cash_refund', reference: 'MAIN-00000024', amountCfa: 2250 },
]

function throughReference(kind: TestingClientLedgerEvent['kind'], reference: string) {
  const idx = TESTING_CLIENT_EVENTS.findIndex(
    (event) => event.kind === kind && event.reference === reference,
  )
  if (idx < 0) throw new Error(`missing ${kind} ${reference}`)
  return TESTING_CLIENT_EVENTS.slice(0, idx + 1)
}

describe('testing client balance replay', () => {
  it('ends at ledger 1400; incremental owed stays 100 CFA high', () => {
    expect(ledgerRunningCfa(TESTING_CLIENT_EVENTS)).toBe(1400)
    expect(incrementalOwedCfa(TESTING_CLIENT_EVENTS)).toBe(1500)
    expect(syncedOwedCfa(TESTING_CLIENT_EVENTS)).toBe(1400)
  })

  it('MAIN-REG-00000001 after zeroed sales creates ledger credit the CHECK cannot store', () => {
    const throughPay100 = throughReference('account_payment', 'MAIN-REG-00000001')
    expect(ledgerRunningCfa(throughPay100)).toBe(-100)
    expect(incrementalOwedCfa(throughPay100)).toBe(0)
  })

  it('MAIN-00000022 credit sale resurfaces the 100 CFA gap because owed += ignores credit', () => {
    const throughCreditSale = throughReference('sale', 'MAIN-00000022')
    expect(ledgerRunningCfa(throughCreditSale)).toBe(2400)
    expect(incrementalOwedCfa(throughCreditSale)).toBe(2500)
    expect(syncedOwedCfa(throughCreditSale)).toBe(2400)
  })

  it('MAIN-REG-00000003 QA payment of 1000 subtracts from both; gap stays 100', () => {
    // Receipt MAIN-REG-00000003 was reused; the 1000 CFA QA payment is the later one.
    const lastPayIdx = [...TESTING_CLIENT_EVENTS]
      .map((event, i) => ({ event, i }))
      .filter(({ event }) => event.kind === 'account_payment' && event.reference === 'MAIN-REG-00000003')
      .at(-1)!.i
    const throughLastQaPay = TESTING_CLIENT_EVENTS.slice(0, lastPayIdx + 1)
    expect(throughLastQaPay.at(-1)?.amountCfa).toBe(-1000)
    expect(ledgerRunningCfa(throughLastQaPay)).toBe(1400)
    expect(incrementalOwedCfa(throughLastQaPay)).toBe(1500)
    expect(syncedOwedCfa(throughLastQaPay)).toBe(1400)
  })

  it('payment and return caps match the UI (never more than displayed debt)', () => {
    expect(payableDebtFromDisplayedCfa(1400)).toBe(1400)
    expect(payableDebtFromDisplayedCfa(-100)).toBe(0)
    expect(1450 > payableDebtFromDisplayedCfa(1400)).toBe(true)
    expect(1000 > payableDebtFromDisplayedCfa(1400)).toBe(false)
  })
})
