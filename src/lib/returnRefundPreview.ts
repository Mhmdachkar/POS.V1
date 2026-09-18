/**
 * Frontend mirror of process_return SQL refund math.
 *
 * Source of truth: supabase/migrations/20260912200005_rpc_return.sql
 *
 * Per-line refund (C3 / residual):
 *   returnable = original_qty - already_returned_qty
 *   if selected >= returnable (final chunk of this sale_item):
 *     item_refund = net_line_total_cfa - already_refunded_cfa
 *   else:
 *     item_refund = round((selected / original_qty) * net_line_total_cfa, 2)
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

export interface ReturnLineRefundInput {
  originalQty: number
  selectedQty: number
  netLineTotalCfa: number
  alreadyReturnedQty: number
  alreadyRefundedCfa: number
}

/**
 * PostgreSQL round(numeric, 2) for non-negative CFA amounts.
 * PG numeric ROUND is half away from zero; for n >= 0 that is half-up.
 */
export function roundCfa2(amount: number): number {
  if (amount <= 0) return 0
  return Math.round(amount * 100) / 100
}

/**
 * Per-sale-item refund matching process_return.
 * Final return of a line uses residual so SUM(refunds) = net_line_total_cfa.
 */
export function computeReturnLineRefund(input: ReturnLineRefundInput): number {
  const originalQty = input.originalQty
  const selectedQty = input.selectedQty
  if (selectedQty <= 0 || originalQty <= 0) return 0

  const alreadyReturnedQty = Math.max(input.alreadyReturnedQty, 0)
  const alreadyRefundedCfa = Math.max(input.alreadyRefundedCfa, 0)
  const returnableQty = originalQty - alreadyReturnedQty
  if (returnableQty <= 0) return 0

  const remainingRefundable = Math.max(
    roundCfa2(input.netLineTotalCfa - alreadyRefundedCfa),
    0,
  )
  const cappedSelected = Math.min(selectedQty, returnableQty)
  const isFinalReturn = cappedSelected >= returnableQty

  const itemRefund = isFinalReturn
    ? remainingRefundable
    : roundCfa2((cappedSelected / originalQty) * input.netLineTotalCfa)

  return Math.min(itemRefund, remainingRefundable)
}

export function computeReturnRefundTotal(lines: ReturnLineRefundInput[]): number {
  return lines.reduce((sum, line) => sum + computeReturnLineRefund(line), 0)
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
