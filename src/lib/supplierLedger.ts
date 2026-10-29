/**
 * Supplier payable ledger helpers.
 * Running balance is floored at 0 after each event (mirrors
 * cancel_purchase_receipt greatest(0, balance - total)).
 */

export type SupplierLedgerKind =
  | 'purchase'
  | 'purchase_cancel'
  | 'payment'
  | 'payment_reversal'

export interface SupplierLedgerRpcRow {
  id: string
  kind: SupplierLedgerKind
  occurred_at: string
  reference: string | null
  detail: string | null
  amount_cfa: number
  running_balance_cfa: number
  purchase_receipt_id: string | null
  supplier_payment_id: string | null
}

/** Same rounding as record_supplier_payment / supplier_ledger SQL. */
export function applySupplierLedgerFloor(prevRunningCfa: number, amountCfa: number): number {
  return Math.max(0, Math.round((Number(prevRunningCfa) + Number(amountCfa)) * 100) / 100)
}

export function withFlooredSupplierRunningBalances<T extends { amount_cfa: number }>(
  eventsOldestFirst: T[],
): Array<T & { running_balance_cfa: number }> {
  let running = 0
  return eventsOldestFirst.map((event) => {
    running = applySupplierLedgerFloor(running, Number(event.amount_cfa))
    return { ...event, running_balance_cfa: running }
  })
}

export function supplierLedgerAccountBalanceCfa(
  rowsOldestFirst: Array<{ running_balance_cfa: number }>,
): number {
  if (rowsOldestFirst.length === 0) return 0
  return Number(rowsOldestFirst[rowsOldestFirst.length - 1]!.running_balance_cfa) || 0
}

export function supplierLedgerMatchesOwed(
  lastRunningCfa: number,
  balanceOwedCfa: number,
): boolean {
  return Math.round(lastRunningCfa) === Math.round(balanceOwedCfa)
}

function isLedgerRow(value: unknown): value is SupplierLedgerRpcRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<SupplierLedgerRpcRow>
  return typeof row.id === 'string' && typeof row.kind === 'string'
}

/** Accepts RETURNS TABLE (array) or RETURNS jsonb `{ rows }`. */
export function asSupplierLedgerRows(data: unknown): SupplierLedgerRpcRow[] {
  if (Array.isArray(data)) return data.filter(isLedgerRow)
  if (data && typeof data === 'object') {
    const rows = (data as { rows?: unknown }).rows
    if (Array.isArray(rows)) return rows.filter(isLedgerRow)
  }
  return []
}
