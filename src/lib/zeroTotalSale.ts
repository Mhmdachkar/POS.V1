/**
 * B2 checkout helpers: percent must stay 0–100, and a payable total of 0
 * is admin + reason only. Server complete_sale is authoritative.
 */

export function isDiscountOutOfRange(
  discountType: 'flat' | 'percent' | null,
  discountValue: number,
  subtotalCfa: number,
): boolean {
  if (discountType === 'flat') {
    return discountValue < 0 || discountValue > subtotalCfa
  }
  if (discountType === 'percent') {
    return discountValue < 0 || discountValue > 100
  }
  return false
}

export function isZeroPayableTotal(payableCfa: number): boolean {
  return Number.isFinite(payableCfa) && payableCfa <= 0
}

export function zeroTotalReasonOk(reason: string | null | undefined): boolean {
  return (reason ?? '').trim().length > 0
}

export function canCompleteZeroPayable(
  isAdmin: boolean,
  reason: string | null | undefined,
): boolean {
  return isAdmin && zeroTotalReasonOk(reason)
}
