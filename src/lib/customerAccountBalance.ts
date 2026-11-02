/**
 * Displayed client solde comes from customer_ledger running balance (signed).
 * customers.balance_owed_cfa stays debt-only (CHECK >= 0). After money RPCs
 * it is synced to greatest(0, ledger). Caps use that same payable figure.
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

/** Non-zero displayed solde (due or credit) — used by the "with balance" filter. */
export function hasDisplayedClientBalance(balanceCfa: number): boolean {
  return Math.round(Number(balanceCfa) || 0) !== 0
}

/**
 * Amount the payment dialog may collect. Same displayed solde as every other
 * screen, floored at 0 (credit cannot be "paid").
 */
export function payableClientDebtCfa(
  ledgerBalanceCfa: number | null | undefined,
  balanceOwedCfa: number,
): number {
  const displayed = displayedAccountBalanceCfa(ledgerBalanceCfa, balanceOwedCfa)
  return Math.max(0, Math.round(Number(displayed) || 0))
}
