/**
 * VHM POS — TypeScript types for all Phase 4 SECURITY DEFINER RPCs.
 *
 * These types mirror the PostgreSQL function signatures exactly.
 * Client NEVER supplies server-computed financials (totals, prices, pieces).
 */

// ─── complete_sale ──────────────────────────────────────────────

export interface CompleteSaleCartItem {
  product_id: string    // uuid
  unit_level: number    // 0=piece, 1=package, 2=carton
  quantity_in_unit: number
}

export interface CompleteSaleParams {
  p_depot_id?: string              // uuid — cashiers auto-set to their depot
  p_customer_id?: string | null    // uuid — null = walk-in
  p_cart_items: CompleteSaleCartItem[]
  p_amount_tendered_cfa: number    // >= 0
  p_display_currency?: 'CFA' | 'USD'
  p_discount_type?: 'flat' | 'percent' | null
  p_discount_value?: number | null
  p_shift_id?: string | null       // uuid — optional
  p_idempotency_key?: string | null // uuid — optional dedup key
}

export interface CompleteSaleResult {
  sale_id: string
  receipt_number: string
  subtotal_cfa: number
  discount_amount_cfa: number
  total_cfa: number
  amount_tendered_cfa: number
  amount_applied_cfa: number
  change_given_cfa: number
  balance_added_cfa: number
  customer_id: string | null
  payment_id: string | null
  idempotent: boolean
}

// ─── record_payment ─────────────────────────────────────────────

export interface RecordPaymentParams {
  p_customer_id: string    // uuid
  p_amount_cfa: number     // > 0
  p_shift_id?: string | null
  p_note?: string | null
}

export interface RecordPaymentResult {
  payment_id: string
  customer_id: string
  amount_cfa: number
  new_balance_owed_cfa: number
}

// ─── process_return ─────────────────────────────────────────────

export interface ProcessReturnItem {
  sale_item_id: string   // uuid
  quantity_in_unit: number
  // NOTE: NO quantity_pieces — server derives it from frozen sale data
}

export interface ProcessReturnParams {
  p_sale_id: string
  p_items: ProcessReturnItem[]
  p_reason?: string | null
  p_cash_refund_cfa: number    // proposed cash portion; server validates total
  p_shift_id?: string | null
}

export interface ProcessReturnResult {
  return_id: string
  sale_id: string
  new_sale_status: 'partially_returned' | 'returned'
  refund_amount_cfa: number
  balance_adjustment_cfa: number
  cash_refunded_cfa: number
}

// ─── void_sale ──────────────────────────────────────────────────

export interface VoidSaleParams {
  p_sale_id: string
  p_reason?: string | null
}

export interface VoidSaleResult {
  sale_id: string
  voided_at: string           // ISO timestamp
  stock_restored_items: Array<{
    product_id: string
    quantity_pieces: number
  }>
  balance_reversed_cfa: number
  payment_reversed: boolean
}

// ─── adjust_inventory ───────────────────────────────────────────

export type InventoryAdjustmentType =
  | 'DAMAGE'
  | 'LOSS'
  | 'COUNT_CORRECTION'
  | 'EXPIRY'
  | 'OTHER'

export interface AdjustInventoryParams {
  p_product_id: string
  p_adjustment_type: InventoryAdjustmentType
  p_quantity_pieces: number    // signed; server validates sign per type
  p_reason?: string | null     // required for OTHER
}

export interface AdjustInventoryResult {
  adjustment_id: string
  product_id: string
  adjustment_type: InventoryAdjustmentType
  quantity_pieces: number
  new_stock_pieces: number
}

// ─── restock_product ────────────────────────────────────────────

export interface RestockProductParams {
  p_product_id: string
  p_unit_level: number         // 0=piece, 1=package, 2=carton
  p_quantity_in_unit: number   // > 0
  p_note?: string | null
}

export interface RestockProductResult {
  entry_id: string
  product_id: string
  quantity_in_unit: number
  quantity_pieces: number
  new_stock_pieces: number
}

// ─── create_transfer_draft ──────────────────────────────────────

export interface TransferDraftItem {
  from_product_id: string    // uuid — must belong to from_depot
  to_product_id: string      // uuid — must belong to to_depot
  unit_level: number
  quantity_in_unit: number
}

export interface CreateTransferDraftParams {
  p_from_depot_id: string
  p_to_depot_id: string
  p_items: TransferDraftItem[]
  p_note?: string | null
}

export interface CreateTransferDraftResult {
  transfer_id: string
  from_depot_id: string
  to_depot_id: string
  status: 'pending'
}

// ─── complete_transfer ──────────────────────────────────────────

export interface CompleteTransferParams {
  p_transfer_id: string
}

export interface CompleteTransferResult {
  transfer_id: string
  status: 'completed'
  items_moved: number
}

// ─── open_shift ─────────────────────────────────────────────────

export interface OpenShiftParams {
  p_depot_id?: string       // uuid — cashiers auto-set to their depot
  p_opening_float_cfa?: number  // >= 0, default 0
}

export interface OpenShiftResult {
  shift_id: string
  depot_id: string
  opening_float_cfa: number
  opened_at: string          // ISO timestamp
}

// ─── close_shift ────────────────────────────────────────────────

export interface CloseShiftParams {
  p_shift_id: string
  p_actual_cash_cfa: number    // >= 0
}

export interface CloseShiftResult {
  shift_id: string
  expected_cash_cfa: number
  actual_cash_cfa: number
  discrepancy_cfa: number
  breakdown: {
    opening_float_cfa: number
    sales_cash_cfa: number
    customer_pmts_cfa: number
    return_cash_cfa: number
  }
}
