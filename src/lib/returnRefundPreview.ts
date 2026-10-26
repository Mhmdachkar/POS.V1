/**
 * Frontend mirror of process_return SQL refund math.
 *
 * Source of truth: supabase/migrations/20261026120001_process_return_payable_share.sql
 *
 * Payable / collected (B1):
 *   payable     = COALESCE(admin_override_total_cfa, total_cfa)
 *   taken       = amount_applied_cfa + balance_added_cfa
 *   refund_pool = min(payable, taken)
 *
 * Per-line refund basis:
 *   if total_cfa > 0:
 *     line_basis = round((net_line / total_cfa) * refund_pool, 2)
 *   elsif subtotal_cfa > 0:
 *     line_basis = round((line_total / subtotal_cfa) * refund_pool, 2)
 *   else:
 *     line_basis = 0
 *
 * Per-line refund (C3 / residual) against line_basis:
 *   returnable = original_qty - already_returned_qty
 *   if selected >= returnable (final chunk of this sale_item):
 *     item_refund = line_basis - already_refunded_cfa
 *   else:
 *     item_refund = round((selected / original_qty) * line_basis, 2)
 *   Then cap so SUM(refunds on the sale) <= refund_pool.
 *
 * C1 pooled-balance split (unchanged):
 *   remaining_credit = greatest(sale.balance_added_cfa - sum(prior return
 *                     balance_adjustment_cfa), 0)
 *   if customer_id is not null AND balance_added_cfa > 0:
 *     balance_adjustment = least(refund, remaining_credit, customer.balance_owed_cfa)
 *   else:
 *     balance_adjustment = 0
 *   cash_refund = refund - balance_adjustment
 *
 * This does not allocate customer payments to a sale. Only previous return
 * balance_adjustment_cfa values reduce remaining sale credit. Customer
 * balance_owed_cfa is the current pooled owed amount (null treated as 0).
 *
 * The server still computes the authoritative refund on submit.
 */

export interface ReturnRefundPreviewInput {
  refundAmountCfa: number
  customerId: string | null
  saleBalanceAddedCfa: number
  customerBalanceOwedCfa: number | null
  previousReturns: Array<{ balance_adjustment_cfa: number }>
}

export interface ReturnRefundPreview {
  refundAmountCfa: number
  previousBalanceAdjustmentCfa: number
  remainingCreditReversalCfa: number
  balanceAdjustmentCfa: number
  cashRefundCfa: number
}

export interface SaleRefundPoolInput {
  total_cfa: number
  admin_override_total_cfa?: number | null
  amount_applied_cfa: number
  balance_added_cfa: number
  subtotal_cfa?: number
}

export interface ReturnLineRefundInput {
  originalQty: number
  selectedQty: number
  netLineTotalCfa: number
  alreadyReturnedQty: number
  alreadyRefundedCfa: number
  /** Line share of the sale refund pool. Defaults to netLineTotalCfa. */
  refundBasisCfa?: number
}

/**
 * PostgreSQL round(numeric, 2) for non-negative CFA amounts.
 * PG numeric ROUND is half away from zero; for n >= 0 that is half-up.
 */
export function roundCfa2(amount: number): number {
  if (amount <= 0) return 0
  return Math.round(amount * 100) / 100
}

export function payableSaleTotalCfa(sale: {
  total_cfa: number
  admin_override_total_cfa?: number | null
}): number {
  if (sale.admin_override_total_cfa != null) {
    return roundCfa2(Number(sale.admin_override_total_cfa))
  }
  return roundCfa2(Number(sale.total_cfa) || 0)
}

export function collectedTakenCfa(
  amountAppliedCfa: number,
  balanceAddedCfa: number,
): number {
  return roundCfa2(Math.max(amountAppliedCfa, 0) + Math.max(balanceAddedCfa, 0))
}

/** Cash kept plus credit — never more than the payable total. */
export function saleRefundPoolCfa(sale: SaleRefundPoolInput): number {
  const payable = payableSaleTotalCfa(sale)
  const taken = collectedTakenCfa(sale.amount_applied_cfa, sale.balance_added_cfa)
  return Math.min(payable, taken)
}

export function remainingSaleRefundPool(
  refundPoolCfa: number,
  alreadyRefundedCfa: number,
): number {
  return Math.max(roundCfa2(refundPoolCfa - Math.max(alreadyRefundedCfa, 0)), 0)
}

/**
 * Per-line refund basis: share of COALESCE(override, total), capped at cash+credit.
 * When calculated total is 0, fall back to catalog line_total / subtotal.
 */
export function lineRefundBasisCfa(
  netLineTotalCfa: number,
  saleTotalCfa: number,
  refundPoolCfa: number,
  lineTotalCfa = 0,
  subtotalCfa = 0,
): number {
  const pool = Math.max(roundCfa2(refundPoolCfa), 0)
  if (pool <= 0) return 0
  if (saleTotalCfa > 0) {
    return roundCfa2((netLineTotalCfa / saleTotalCfa) * pool)
  }
  if (subtotalCfa > 0) {
    return roundCfa2((lineTotalCfa / subtotalCfa) * pool)
  }
  return 0
}

function lineBasis(input: ReturnLineRefundInput): number {
  return input.refundBasisCfa ?? input.netLineTotalCfa
}

/**
 * Per-sale-item refund matching process_return.
 * Final return of a line uses residual so SUM(refunds) = line_basis.
 */
export function computeReturnLineRefund(input: ReturnLineRefundInput): number {
  const originalQty = input.originalQty
  const selectedQty = input.selectedQty
  if (selectedQty <= 0 || originalQty <= 0) return 0

  const alreadyReturnedQty = Math.max(input.alreadyReturnedQty, 0)
  const alreadyRefundedCfa = Math.max(input.alreadyRefundedCfa, 0)
  const returnableQty = originalQty - alreadyReturnedQty
  if (returnableQty <= 0) return 0

  const basis = lineBasis(input)
  const remainingRefundable = Math.max(roundCfa2(basis - alreadyRefundedCfa), 0)
  const cappedSelected = Math.min(selectedQty, returnableQty)
  const isFinalReturn = cappedSelected >= returnableQty

  const itemRefund = isFinalReturn
    ? remainingRefundable
    : roundCfa2((cappedSelected / originalQty) * basis)

  return Math.min(itemRefund, remainingRefundable)
}

export function computeReturnRefundTotal(
  lines: ReturnLineRefundInput[],
  remainingSalePoolCfa?: number,
): number {
  let sum = 0
  const pool = remainingSalePoolCfa ?? Number.POSITIVE_INFINITY
  for (const line of lines) {
    const refund = Math.min(
      computeReturnLineRefund(line),
      Math.max(roundCfa2(pool - sum), 0),
    )
    sum += refund
  }
  return roundCfa2(sum)
}

/** Remaining CFA that can still be refunded on this sale line. */
export function remainingRefundableCfa(
  netLineTotalCfa: number,
  alreadyRefundedCfa: number,
): number {
  return Math.max(roundCfa2(netLineTotalCfa - Math.max(alreadyRefundedCfa, 0)), 0)
}

/**
 * Custom refund for a selected quantity: 0 up to the computed full value
 * of those units. Never above remaining refundable on the line.
 */
export function clampCustomRefund(amount: number, maxCfa: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  const max = Math.max(roundCfa2(maxCfa), 0)
  return Math.min(roundCfa2(amount), max)
}

export interface ResolveLineRefundInput extends ReturnLineRefundInput {
  /** When set, overrides the proportional/residual amount (still capped). */
  customRefundCfa?: number | null
}

/**
 * Refund used for preview and submit.
 * Stock restore is driven by selectedQty; money can be lower than the full line value.
 */
export function resolveLineRefund(
  input: ResolveLineRefundInput,
  remainingSalePoolCfa?: number,
): number {
  const computed = computeReturnLineRefund(input)
  const uncapped =
    input.customRefundCfa == null
      ? computed
      : clampCustomRefund(input.customRefundCfa, computed)
  if (remainingSalePoolCfa == null) return uncapped
  return Math.min(uncapped, Math.max(roundCfa2(remainingSalePoolCfa), 0))
}

export function computeReturnRefundPreview(
  input: ReturnRefundPreviewInput,
): ReturnRefundPreview {
  const refundAmountCfa = input.refundAmountCfa

  const previousBalanceAdjustmentCfa = input.previousReturns.reduce(
    (sum, ret) => sum + ret.balance_adjustment_cfa,
    0,
  )

  const remainingCreditReversalCfa = Math.max(
    input.saleBalanceAddedCfa - previousBalanceAdjustmentCfa,
    0,
  )

  const owedCfa = input.customerBalanceOwedCfa ?? 0

  const canReverseCredit =
    input.customerId != null && input.saleBalanceAddedCfa > 0

  const balanceAdjustmentCfa = canReverseCredit
    ? Math.min(refundAmountCfa, remainingCreditReversalCfa, owedCfa)
    : 0

  return {
    refundAmountCfa,
    previousBalanceAdjustmentCfa,
    remainingCreditReversalCfa,
    balanceAdjustmentCfa,
    cashRefundCfa: refundAmountCfa - balanceAdjustmentCfa,
  }
}
