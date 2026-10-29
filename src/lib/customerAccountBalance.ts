/**
 * Displayed client solde comes from customer_ledger running balance (signed).
 * customers.balance_owed_cfa stays debt-only (CHECK >= 0) for credit/RPC caps.
 */

export function ledgerAccountBalanceCfa(
  rows: Array<{ running_balance_cfa: number | string | null | undefined }>,
): number {
  if (rows.length === 0) return 0
  return Number(rows[rows.length - 1]!.running_balance_cfa) || 0
}

export type ClientSoldeKind = 'due' | 'credit' | 'settled'

export function clientSoldeKind(balanceCfa: number): ClientSoldeKind {
  const rounded = Math.round(Number(balanceCfa) || 0)
  if (rounded > 0) return 'due'
  if (rounded < 0) return 'credit'
  return 'settled'
}

export function clientSoldeDisplayAmount(balanceCfa: number): number {
  return Math.abs(Math.round(Number(balanceCfa) || 0))
}

/** Prefer ledger running balance when loaded; otherwise debt-only owed. */
export function displayedAccountBalanceCfa(
  ledgerBalanceCfa: number | null | undefined,
  balanceOwedCfa: number,
): number {
  return ledgerBalanceCfa ?? balanceOwedCfa
}
