/**
 * VHM POS — Typed wrappers for all Phase 4 SECURITY DEFINER RPCs.
 *
 * All business mutations go through these wrappers.
 * The wrappers call supabase.rpc() and parse any errors into VhmError.
 *
 * Usage:
 *   const result = await rpc.completeSale({ ... })
 *   if (result.error) { handleVhmError(result.error); return }
 *   const { sale_id, receipt_number } = result.data
 */

import { supabase } from '@/lib/supabase'
import { parseError } from '@/lib/errors'
import type { VhmError } from '@/lib/errors'
import type {
  CompleteSaleParams,
  CompleteSaleResult,
  RecordPaymentParams,
  RecordPaymentResult,
  ProcessReturnParams,
  ProcessReturnResult,
  VoidSaleParams,
  VoidSaleResult,
  AdjustInventoryParams,
  AdjustInventoryResult,
  RestockProductParams,
  RestockProductResult,
  CreateTransferDraftParams,
  CreateTransferDraftResult,
  CompleteTransferParams,
  CompleteTransferResult,
  OpenShiftParams,
  OpenShiftResult,
  CloseShiftParams,
  CloseShiftResult,
} from '@/types/rpc'

// ─── Internal helper ────────────────────────────────────────────

interface RpcSuccess<T> { data: T; error: null }
interface RpcFailure    { data: null; error: VhmError }
type RpcResult<T> = RpcSuccess<T> | RpcFailure

/**
 * Calls supabase.rpc() and normalizes errors into VhmError.
 * On success, casts the jsonb return value to T.
 */
async function callRpc<TResult>(
  fnName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any,
): Promise<RpcResult<TResult>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(fnName, params)
    if (error) {
      return { data: null, error: parseError(error) }
    }
    return { data: data as TResult, error: null }
  } catch (err) {
    return { data: null, error: parseError(err) }
  }
}

// ─── RPC wrappers ────────────────────────────────────────────────

export const rpc = {
  /**
   * Create a completed sale atomically.
   * All financials computed server-side. Idempotent via p_idempotency_key.
   */
  completeSale: (params: CompleteSaleParams): Promise<RpcResult<CompleteSaleResult>> =>
    callRpc<CompleteSaleResult>('complete_sale', params),

  /**
   * Record a standalone customer debt payment.
   * Reduces customer.balance_owed_cfa.
   */
  recordPayment: (params: RecordPaymentParams): Promise<RpcResult<RecordPaymentResult>> =>
    callRpc<RecordPaymentResult>('record_payment', params),

  /**
   * Process a partial or full sale return.
   * Restores stock, adjusts customer balance per pooled-balance rule.
   */
  processReturn: (params: ProcessReturnParams): Promise<RpcResult<ProcessReturnResult>> =>
    callRpc<ProcessReturnResult>('process_return', params),

  /**
   * Void a completed sale.
   * Restores stock, reverses payment, adjusts customer balance.
   */
  voidSale: (params: VoidSaleParams): Promise<RpcResult<VoidSaleResult>> =>
    callRpc<VoidSaleResult>('void_sale', params),

  /**
   * Record a signed inventory adjustment (damage, loss, count correction, etc.)
   */
  adjustInventory: (params: AdjustInventoryParams): Promise<RpcResult<AdjustInventoryResult>> =>
    callRpc<AdjustInventoryResult>('adjust_inventory', params),

  /**
   * Add stock to a product via a named unit (restock).
   */
  restockProduct: (params: RestockProductParams): Promise<RpcResult<RestockProductResult>> =>
    callRpc<RestockProductResult>('restock_product', params),

  /**
   * Create a pending depot-to-depot stock transfer.
   * Stock is NOT moved until completeTransfer().
   */
  createTransferDraft: (params: CreateTransferDraftParams): Promise<RpcResult<CreateTransferDraftResult>> =>
    callRpc<CreateTransferDraftResult>('create_transfer_draft', params),

  /**
   * Atomically move stock for a pending transfer.
   * Revalidates product-depot ownership at completion time.
   */
  completeTransfer: (params: CompleteTransferParams): Promise<RpcResult<CompleteTransferResult>> =>
    callRpc<CompleteTransferResult>('complete_transfer', params),

  /**
   * Open a new cashier shift.
   */
  openShift: (params: OpenShiftParams): Promise<RpcResult<OpenShiftResult>> =>
    callRpc<OpenShiftResult>('open_shift', params),

  /**
   * Close an open shift. Computes expected_cash_cfa server-side.
   */
  closeShift: (params: CloseShiftParams): Promise<RpcResult<CloseShiftResult>> =>
    callRpc<CloseShiftResult>('close_shift', params),
} as const
