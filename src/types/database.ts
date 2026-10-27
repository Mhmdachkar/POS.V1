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

export type ShiftStatus = 'open' | 'closed'

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
  /** Admin opt-in. Untracked products never appear in low-stock warnings. */
  track_low_stock: boolean
  /** Required when track_low_stock is true. Compared to current_stock_pieces. */
  low_stock_threshold: number | null
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
  /** Unique identifier for this unit definition. Required. Case-insensitive unique. */
  serial_number: string
  /** How many pieces = 1 of this unit. Piece row = 1. Server-derived. */
  conversion_to_base: number
  /** L0: null. L1: pieces per package. L2: packages per carton. */
  relative_quantity: number | null
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
  /** Cost per base piece at restock time. Null for pre-CEO Notes historical rows. */
  unit_cost_price_cfa: number | null
  /** Total acquisition cost for this restock. Null for pre-CEO Notes historical rows. */
  total_cost_cfa: number | null
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
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
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
  status: ShiftStatus
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
  /** Admin-only. When set, this is the authoritative revenue total. Null = use total_cfa. */
  admin_override_total_cfa: number | null
  /** Required when payable total is 0 (admin-only). Null on historical rows. */
  price_exception_reason?: string | null
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
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
    Functions: {
      ack_print_job: {
        Args: { p_job_id: string | null; p_ok: boolean; p_error?: string | null }
        Returns: Json
      }
      adjust_inventory: {
        Args: { p_product_id: string | null; p_adjustment_type: string; p_quantity_pieces: number; p_reason?: string | null }
        Returns: Json
      }
      admin_audit_staff_auth_reconcile: {
        Args: { p_staff_id: string | null; p_details: Json; p_staff_rpc_gate: string }
        Returns: Json
      }
      admin_dashboard_summary: {
        Args: { p_depot_id?: string | null }
        Returns: Json
      }
      admin_deactivate_staff_row: {
        Args: { p_staff_id: string | null; p_staff_rpc_gate: string }
        Returns: Json
      }
      admin_get_staff_row: {
        Args: { p_staff_id: string | null }
        Returns: Json
      }
      admin_insert_staff: {
        Args: { p_staff_id: string | null; p_username: string; p_full_name: string; p_role: string; p_depot_id: string | null; p_staff_rpc_gate: string }
        Returns: Json
      }
      admin_reactivate_staff_row: {
        Args: { p_staff_id: string | null; p_staff_rpc_gate: string }
        Returns: Json
      }
      admin_read_staff_rpc_gate: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      admin_refunds_over_payable: {
        Args: Record<PropertyKey, never>
        Returns: { sale_id: string | null; receipt_number: string; payable_cfa: number; refunds_cfa: number }[]
      }
      admin_report_cash: {
        Args: { p_depot_id: string | null; p_start_date: string; p_end_date: string }
        Returns: Json
      }
      admin_report_collections: {
        Args: { p_depot_id: string | null; p_start_date: string; p_end_date: string; p_cashier_id?: string | null }
        Returns: Json
      }
      admin_report_cost_detail: {
        Args: { p_depot_id?: string | null; p_start_date?: string | null; p_end_date?: string | null; p_category_id?: string | null; p_product_id?: string | null }
        Returns: Json
      }
      admin_report_customer_ageing: {
        Args: { p_depot_id: string | null; p_as_of: string }
        Returns: Json
      }
      admin_report_customers: {
        Args: { p_depot_id: string | null; p_start_date: string; p_end_date: string }
        Returns: Json
      }
      admin_report_discounts: {
        Args: { p_depot_id: string | null; p_start_date: string; p_end_date: string; p_cashier_id?: string | null }
        Returns: Json
      }
      admin_report_inventory: {
        Args: { p_depot_id: string | null; p_start_date: string; p_end_date: string; p_category_id?: string | null; p_product_id?: string | null }
        Returns: Json
      }
      admin_report_low_stock: {
        Args: { p_depot_id: string | null }
        Returns: Json
      }
      admin_report_sales: {
        Args: { p_depot_id: string | null; p_start_date: string; p_end_date: string; p_cashier_id?: string | null; p_category_id?: string | null; p_product_id?: string | null; p_shift_id?: string | null }
        Returns: Json
      }
      admin_report_sales_by_hour: {
        Args: { p_depot_id: string | null; p_start_date: string; p_end_date: string; p_cashier_id?: string | null }
        Returns: Json
      }
      admin_report_shift_lines: {
        Args: { p_depot_id: string | null; p_start_date: string; p_end_date: string; p_cashier_id?: string | null }
        Returns: Json
      }
      admin_report_stock_movements: {
        Args: { p_depot_id: string | null; p_start_date: string; p_end_date: string; p_category_id?: string | null; p_product_id?: string | null }
        Returns: Json
      }
      admin_update_staff_row: {
        Args: { p_staff_id: string | null; p_full_name: string; p_role: string; p_depot_id: string | null; p_staff_rpc_gate: string }
        Returns: Json
      }
      cancel_transfer: {
        Args: { p_transfer_id: string | null; p_reason?: string | null }
        Returns: Json
      }
      claim_print_jobs: {
        Args: { p_destination: string; p_depot_id: string | null; p_agent_id: string; p_limit?: number }
        Returns: Json[]
      }
      close_shift: {
        Args: { p_shift_id: string | null; p_actual_cash_cfa: number }
        Returns: Json
      }
      complete_sale: {
        Args: { p_depot_id: string | null; p_customer_id?: string | null; p_cart_items?: Json; p_amount_tendered_cfa?: number; p_display_currency?: string; p_discount_type?: string | null; p_discount_value?: number | null; p_shift_id?: string | null; p_idempotency_key?: string | null; p_override_total_cfa?: number | null; p_price_exception_reason?: string | null }
        Returns: Json
      }
      complete_transfer: {
        Args: { p_transfer_id: string | null }
        Returns: Json
      }
      create_category: {
        Args: { p_name: string; p_parent_id?: string | null }
        Returns: Json
      }
      create_customer: {
        Args: { p_name: string; p_phone?: string | null; p_address?: string | null }
        Returns: Json
      }
      create_depot: {
        Args: { p_name: string; p_location: string; p_code: string }
        Returns: Json
      }
      create_product: {
        Args: { p_depot_id: string | null; p_category_id: string | null; p_name: string; p_photo_url: string; p_units: Json; p_track_low_stock?: boolean; p_low_stock_threshold?: number | null }
        Returns: Json
      }
      create_transfer_draft: {
        Args: { p_from_depot_id: string | null; p_to_depot_id: string | null; p_items: Json; p_note?: string | null }
        Returns: Json
      }
      customer_ledger: {
        Args: { p_customer_id: string | null }
        Returns: { id: string; kind: string; occurred_at: string; reference: string; item_summary: string; note: string; amount_cfa: number; running_balance_cfa: number; sale_id: string | null; adds_credit: boolean }[]
      }
      deactivate_category: {
        Args: { p_category_id: string | null }
        Returns: Json
      }
      deactivate_customer: {
        Args: { p_customer_id: string | null; p_reason?: string | null }
        Returns: Json
      }
      deactivate_depot: {
        Args: { p_depot_id: string | null }
        Returns: Json
      }
      deactivate_product: {
        Args: { p_product_id: string | null }
        Returns: Json
      }
      get_current_staff_ctx: {
        Args: Record<PropertyKey, never>
        Returns: { staff_id: string | null; role: string; depot_id: string | null; is_active: boolean; full_name: string }[]
      }
      get_current_staff_depot_id: {
        Args: Record<PropertyKey, never>
        Returns: string | null
      }
      get_current_staff_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      is_current_staff_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_current_staff_cashier: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_current_staff_depot_staff: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      open_shift: {
        Args: { p_depot_id: string | null; p_opening_float_cfa?: number }
        Returns: Json
      }
      process_return: {
        Args: { p_sale_id: string | null; p_items: Json; p_reason?: string | null; p_cash_refund_cfa?: number; p_shift_id?: string | null }
        Returns: Json
      }
      reactivate_category: {
        Args: { p_category_id: string | null }
        Returns: Json
      }
      reactivate_customer: {
        Args: { p_customer_id: string | null }
        Returns: Json
      }
      reactivate_depot: {
        Args: { p_depot_id: string | null }
        Returns: Json
      }
      reactivate_product: {
        Args: { p_product_id: string | null }
        Returns: Json
      }
      record_payment: {
        Args: { p_customer_id: string | null; p_amount_cfa: number; p_shift_id?: string | null; p_note?: string | null }
        Returns: Json
      }
      release_sale_fulfillment: {
        Args: { p_sale_id: string | null }
        Returns: Json
      }
      requeue_print_job: {
        Args: { p_job_id: string | null }
        Returns: Json
      }
      restock_product: {
        Args: { p_product_id: string | null; p_unit_level: number; p_quantity_in_unit: number; p_note?: string | null }
        Returns: Json
      }
      staff_display_names: {
        Args: { p_ids: string[] }
        Returns: { id: string | null; full_name: string }[]
      }
      update_business_settings: {
        Args: { p_business_name: string; p_logo_url: string; p_cfa_to_usd_rate: number }
        Returns: Json
      }
      update_category: {
        Args: { p_category_id: string | null; p_name: string }
        Returns: Json
      }
      update_customer: {
        Args: { p_customer_id: string | null; p_name: string; p_phone?: string | null; p_address?: string | null }
        Returns: Json
      }
      update_depot: {
        Args: { p_depot_id: string | null; p_name: string; p_location: string }
        Returns: Json
      }
      update_product: {
        Args: { p_product_id: string | null; p_category_id: string | null; p_name: string; p_photo_url: string; p_units: Json; p_track_low_stock?: boolean; p_low_stock_threshold?: number | null }
        Returns: Json
      }
      validate_active_session: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      void_sale: {
        Args: { p_sale_id: string | null; p_reason?: string | null }
        Returns: Json
      }
    }
    Enums: Record<string, never>
  }

  private: {
    Tables: {}
    Views: {}
    Functions: {
      assert_low_stock_settings: {
        Args: { p_track_low_stock: boolean; p_low_stock_threshold: number }
        Returns: undefined
      }
      assert_not_last_active_admin: {
        Args: { p_staff_id: string | null }
        Returns: undefined
      }
      assert_report_depot: {
        Args: { p_depot_id: string | null }
        Returns: undefined
      }
      build_print_payload_for_sale: {
        Args: { p_sale_id: string | null }
        Returns: Json
      }
      create_print_jobs_for_sale: {
        Args: { p_sale_id: string | null }
        Returns: undefined
      }
      get_caller_ctx: {
        Args: { p_required_roles?: string[] }
        Returns: unknown
      }
      lock_active_admins: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      payment_matches_report_depot: {
        Args: { p_shift_id: string | null; p_recorded_by: string | null; p_depot_id: string | null }
        Returns: boolean
      }
      product_stock_status: {
        Args: { p_product_id: string | null; p_depot_id: string | null }
        Returns: string
      }
      product_with_units_json: {
        Args: { p_product: unknown }
        Returns: Json
      }
      raise_admin_unique_violation: {
        Args: { p_sqlerrm: string }
        Returns: undefined
      }
      raise_vhm_error: {
        Args: { p_code: string; p_details?: Json }
        Returns: undefined
      }
      require_https_url: {
        Args: { p_url: string; p_code: string }
        Returns: undefined
      }
      require_staff_rpc_gate: {
        Args: { p_token: string }
        Returns: undefined
      }
      sale_line_payable_share: {
        Args: { p_net_line: number; p_sale_total: number; p_override: number }
        Returns: number
      }
      sales_with_over_refund: {
        Args: Record<PropertyKey, never>
        Returns: { sale_id: string | null; receipt_number: string; payable_cfa: number; refunded_cfa: number }[]
      }
      staff_to_jsonb: {
        Args: { p_staff: unknown }
        Returns: Json
      }
      upsert_product_units: {
        Args: { p_product_id: string | null; p_units: Json }
        Returns: undefined
      }
      validate_product_units: {
        Args: { p_units: Json }
        Returns: undefined
      }
      validate_role_depot: {
        Args: { p_role: string; p_depot_id: string | null }
        Returns: undefined
      }
      validate_shift: {
        Args: { p_shift_id: string | null; p_depot_id: string | null }
        Returns: unknown
      }
      write_audit: {
        Args: { p_actor_id: string | null; p_action: string; p_entity_type: string; p_entity_id: string | null; p_depot_id: string | null; p_before_val?: Json | null; p_after_val?: Json | null }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
