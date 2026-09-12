/**
 * VHM POS — Database type definitions.
 *
 * These types mirror the confirmed PostgreSQL schema (vhm-schema v2.md)
 * plus the Phase 2 schema corrections documented in the master blueprint.
 *
 * They will be REPLACED by Supabase CLI-generated types once the
 * Supabase project is initialized in Phase 2. Keep this file as the
 * reference until then.
 *
 * Payment allocation model: POOLED BALANCE ACCOUNTING.
 * payments.sale_id is informational (identifies the originating sale for
 * sale_payment mirrors) — it does NOT mean the payment is allocated to
 * that sale. Standalone customer_payment records reduce the pooled balance.
 */

// ─────────────────────────────────────────────────────────────────
// Enums / Literal types
// ─────────────────────────────────────────────────────────────────

export type StaffRole = 'admin' | 'cashier' | 'depot_staff'

export type SaleStatus = 'completed' | 'voided' | 'partially_returned' | 'returned'

export type TransferStatus = 'pending' | 'completed' | 'cancelled'

export type AdjustmentType = 'DAMAGE' | 'LOSS' | 'COUNT_CORRECTION' | 'EXPIRY' | 'OTHER'

export type DisplayCurrency = 'CFA' | 'USD'

export type DiscountType = 'flat' | 'percent'

/** payment_type distinguishes a mirrored sale payment from a standalone customer payment. */
export type PaymentType = 'sale_payment' | 'customer_payment'

// ─────────────────────────────────────────────────────────────────
// Table row types (match DB columns exactly)
// ─────────────────────────────────────────────────────────────────

export interface BusinessSettings {
  id: true
  business_name: string
  logo_url: string | null
  cfa_to_usd_rate: number
  rate_updated_at: string
  rate_updated_by: string | null
  updated_at: string
}

export interface Depot {
  id: string
  name: string
  location: string
  /** Short code used in receipt numbers, e.g. 'DKR' */
  code: string
  is_active: boolean
  /** Next receipt sequence number — only readable by service role in RPCs */
  receipt_seq: number
  created_at: string
}

export interface Staff {
  id: string
  username: string
  full_name: string
  role: StaffRole
  /** null for admin */
  depot_id: string | null
  is_active: boolean
  deactivated_at: string | null
  created_at: string
}

export interface Category {
  id: string
  parent_id: string | null
  name: string
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  depot_id: string
  category_id: string
  name: string
  photo_url: string
  current_stock_pieces: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductUnit {
  id: string
  product_id: string
  /** 0 = piece (base), 1 = package, 2 = carton */
  unit_level: 0 | 1 | 2
  unit_name: string
  /** How many pieces = 1 of this unit. Piece row = 1. */
  conversion_to_base: number
  cost_price_cfa: number
  selling_price_cfa: number
  created_at: string
  updated_at: string
}

export interface StockEntry {
  id: string
  product_id: string
  /** Denormalized depot_id (added in Phase 2 correction) */
  depot_id: string
  unit_level: number
  quantity_in_unit: number
  /** Frozen piece count at entry time */
  quantity_pieces: number
  note: string | null
  entered_by: string
  entered_at: string
}

export interface InventoryAdjustment {
  id: string
  product_id: string
  /** Denormalized depot_id */
  depot_id: string
  adjustment_type: AdjustmentType
  /** Signed: negative for DAMAGE/LOSS/EXPIRY, either sign for COUNT_CORRECTION/OTHER */
  quantity_pieces: number
  reason: string | null
  created_by: string
  created_at: string
}

export interface StockTransfer {
  id: string
  from_depot_id: string
  to_depot_id: string
  status: TransferStatus
  created_by: string
  created_at: string
  completed_at: string | null
  /** Staff who completed the transfer (null until completed). Added in Phase 2 for audit. */
  completed_by: string | null
  note: string | null
}

export interface StockTransferItem {
  id: string
  transfer_id: string
  /** Must belong to from_depot_id */
  from_product_id: string
  /** Must belong to to_depot_id */
  to_product_id: string
  unit_level: number
  quantity_in_unit: number
  /** Frozen piece count at transfer creation time */
  quantity_pieces: number
}

export interface Shift {
  id: string
  depot_id: string
  cashier_id: string
  opening_float_cfa: number
  opened_at: string
  closed_at: string | null
  /** Staff who closed the shift (may differ from cashier_id if admin closed). Added in Phase 2. */
  closed_by: string | null
  expected_cash_cfa: number | null
  actual_cash_cfa: number | null
  discrepancy_cfa: number | null
  status: 'open' | 'closed'
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  address: string | null
  /**
   * Authoritative pooled outstanding balance.
   * Maintained transactionally by RPCs.
   * NEVER derived client-side; always read from server.
   */
  balance_owed_cfa: number
  /**
   * FALSE = deactivated. Cannot be used in new sales.
   * Existing balance remains payable via record_payment() without reactivation.
   * Historical sales/payments fully preserved.
   * Added in Phase 6 (migration 025).
   */
  is_active: boolean
  /**
   * Set when is_active = false. NULL while active.
   * Added in Phase 6 (migration 025).
   */
  deactivated_at: string | null
  created_by: string
  created_at: string
  /**
   * Auto-maintained by set_updated_at() trigger.
   * Added in Phase 6 (migration 025).
   */
  updated_at: string
}

export interface Sale {
  id: string
  depot_id: string
  cashier_id: string
  /** null for walk-in sales */
  customer_id: string | null
  shift_id: string | null
  receipt_number: string
  status: SaleStatus
  display_currency: DisplayCurrency
  cfa_to_usd_rate_used: number
  subtotal_cfa: number
  discount_type: DiscountType | null
  discount_value: number | null
  discount_amount_cfa: number
  total_cfa: number
  amount_tendered_cfa: number
  amount_applied_cfa: number
  change_given_cfa: number
  balance_added_cfa: number
  created_at: string
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  unit_level: number
  quantity_in_unit: number
  /** Frozen piece count at sale time */
  quantity_pieces: number
  /** Locked selling price at sale time */
  unit_price_cfa: number
  /** Locked cost price at sale time */
  cost_price_cfa: number
  line_total_cfa: number
}

export interface SaleReturn {
  id: string
  sale_id: string
  depot_id: string
  /** shift_id when the return was processed (added in Phase 2) */
  shift_id: string | null
  processed_by: string
  reason: string | null
  refund_amount_cfa: number
  /** How much of refund reverses the customer's outstanding balance */
  balance_adjustment_cfa: number
  /** How much of refund is physical cash handed back */
  cash_refunded_cfa: number
  created_at: string
}

export interface SaleReturnItem {
  id: string
  return_id: string
  sale_item_id: string
  quantity_in_unit: number
  /** Frozen piece count, mirrors sale_items pattern */
  quantity_pieces: number
  refund_amount_cfa: number
}

export interface Payment {
  id: string
  customer_id: string
  /**
   * For sale_payment: identifies the originating sale (informational).
   * For customer_payment: null (pooled payment, no specific sale allocation).
   *
   * IMPORTANT: sale_id on a customer_payment does NOT mean the payment
   * is allocated to that sale. See payment allocation model decision.
   */
  sale_id: string | null
  /**
   * shift_id added in Phase 2 correction.
   * Links payment to the shift in which it was physically received.
   */
  shift_id: string | null
  payment_type: PaymentType
  amount_cfa: number
  recorded_by: string
  recorded_at: string
  note: string | null
  /**
   * Reversal fields — used for:
   * 1. sale_payment mirrors when a sale is voided
   * 2. Explicit admin corrections
   * NOT used for normal return processing (pooled balance model).
   */
  is_reversed: boolean
  reversed_at: string | null
  reversed_by: string | null
  reversed_by_return_id: string | null
}

export interface AuditLog {
  id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  /** Denormalized for fast per-depot queries */
  depot_id: string | null
  before_value: Record<string, unknown> | null
  after_value: Record<string, unknown> | null
  occurred_at: string
}

export type InventoryTransactionType =
  | 'SALE'
  | 'RETURN'
  | 'VOID'
  | 'RESTOCK'
  | 'ADJUSTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'

export type InventoryReferenceType =
  | 'sale'
  | 'sale_return'
  | 'void'
  | 'stock_entry'
  | 'inventory_adjustment'
  | 'stock_transfer'

/** Unified append-only inventory ledger (migration 015). */
export interface InventoryTransaction {
  id: string
  depot_id: string
  product_id: string
  /** Signed: negative = stock out */
  quantity_pieces: number
  transaction_type: InventoryTransactionType
  reference_type: InventoryReferenceType
  reference_id: string
  created_by: string
  created_at: string
  metadata: Record<string, unknown> | null
}

// ─────────────────────────────────────────────────────────────────
// Database type (used by Supabase client generic)
// ─────────────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      business_settings: { Row: BusinessSettings }
      depots: { Row: Depot }
      staff: { Row: Staff }
      categories: { Row: Category }
      products: { Row: Product }
      product_units: { Row: ProductUnit }
      stock_entries: { Row: StockEntry }
      inventory_adjustments: { Row: InventoryAdjustment }
      stock_transfers: { Row: StockTransfer }
      stock_transfer_items: { Row: StockTransferItem }
      shifts: { Row: Shift }
      customers: { Row: Customer }
      sales: { Row: Sale }
      sale_items: { Row: SaleItem }
      sale_returns: { Row: SaleReturn }
      sale_return_items: { Row: SaleReturnItem }
      payments: { Row: Payment }
      audit_log: { Row: AuditLog }
      inventory_transactions: { Row: InventoryTransaction }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
