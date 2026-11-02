/**
 * Server-side owed/ledger sync rules (mirrored for tests).
 *
 * customers.balance_owed_cfa is debt-only (CHECK >= 0).
 * customer_ledger running balance is signed (credit can go negative).
 *
 * After every money event the server sets:
 *   owed = greatest(0, round(ledger_running, 2))
 * Caps (payment collection, return credit reversal) use that same payable
 * figure so the server cannot collect more than the UI shows.
 */

export function syncOwedFromLedgerCfa(ledgerRunningCfa: number): number {
  return Math.max(0, Math.round(Number(ledgerRunningCfa) || 0))
}

export function payableDebtFromDisplayedCfa(displayedCfa: number): number {
  return Math.max(0, Math.round(Number(displayedCfa) || 0))
}

export type TestingClientLedgerKind =
  | 'sale'
  | 'cash_payment'
  | 'return'
  | 'cash_refund'
  | 'account_payment'

export interface TestingClientLedgerEvent {
  occurredAt: string
  kind: TestingClientLedgerKind
  reference: string
  amountCfa: number
}

const SORT_KIND: Record<TestingClientLedgerKind, number> = {
  sale: 1,
  cash_payment: 2,
  return: 3,
  cash_refund: 4,
  account_payment: 5,
}

export function sortLedgerEvents(
  events: TestingClientLedgerEvent[],
): TestingClientLedgerEvent[] {
  return [...events].sort((a, b) => {
    const time = a.occurredAt.localeCompare(b.occurredAt)
    if (time !== 0) return time
    return SORT_KIND[a.kind] - SORT_KIND[b.kind]
  })
}

export function ledgerRunningCfa(events: TestingClientLedgerEvent[]): number {
  return sortLedgerEvents(events).reduce((sum, event) => sum + event.amountCfa, 0)
}

/**
 * Incremental owed updates (the bug): sale credit adds to owed; payments and
 * return balance_adjustment subtract; cash_refund is ignored; owed floors at 0.
 * Does not re-read the signed ledger, so leftover credit resurfaces on the
 * next credit sale.
 */
export function incrementalOwedCfa(events: TestingClientLedgerEvent[]): number {
  let owed = 0
  const remainingCredit = new Map<string, number>()
  const sorted = sortLedgerEvents(events)

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i]!
    if (event.kind === 'sale') {
      const cash = sorted[i + 1]?.kind === 'cash_payment' &&
        sorted[i + 1]?.occurredAt === event.occurredAt &&
        sorted[i + 1]?.reference === event.reference
        ? sorted[i + 1]!.amountCfa
        : 0
      const added = Math.max(event.amountCfa + cash, 0)
      owed += added
      remainingCredit.set(event.reference, added)
      continue
    }
    if (event.kind === 'account_payment') {
      owed = Math.max(0, owed + event.amountCfa)
      continue
    }
    if (event.kind === 'return') {
      const refund = -event.amountCfa
      const remaining = remainingCredit.get(event.reference) ?? 0
      const adj = Math.min(refund, remaining, owed)
      owed = Math.max(0, owed - adj)
      remainingCredit.set(event.reference, Math.max(0, remaining - adj))
    }
  }
  return owed
}

export function syncedOwedCfa(events: TestingClientLedgerEvent[]): number {
  return syncOwedFromLedgerCfa(ledgerRunningCfa(events))
}
