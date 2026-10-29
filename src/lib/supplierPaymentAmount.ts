/**
 * Client-side supplier payment amount checks (mirrors record_supplier_payment).
 */

export type SupplierPaymentAmountIssue = 'empty' | 'invalid' | 'exceeds'

export function supplierPaymentAmountIssue(
  amountStr: string,
  balanceOwedCfa: number,
): SupplierPaymentAmountIssue | null {
  const trimmed = amountStr.trim().replace(/\s/g, '').replace(',', '.')
  if (!trimmed) return 'empty'
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount <= 0) return 'invalid'
  if (amount > Number(balanceOwedCfa) + 0.01) return 'exceeds'
  return null
}
