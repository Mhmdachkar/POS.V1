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
import { assertKnownRpc, type RpcName } from '@/lib/rpcSignatures'
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
  ReleaseSaleFulfillmentParams,
  ReleaseSaleFulfillmentResult,
  RequeuePrintJobParams,
  RequeuePrintJobResult,
  AdjustInventoryParams,
  AdjustInventoryResult,
  RestockProductParams,
  RestockProductResult,
  CreateTransferDraftParams,
  CreateTransferDraftResult,
  CompleteTransferParams,
  CompleteTransferResult,
  CancelTransferParams,
  CancelTransferResult,
  OpenShiftParams,
  OpenShiftResult,
  CloseShiftParams,
  CloseShiftResult,
  CreateCustomerParams,
  CreateCustomerResult,
  UpdateCustomerParams,
  UpdateCustomerResult,
  DeactivateCustomerParams,
  DeactivateCustomerResult,
  ReactivateCustomerParams,
  ReactivateCustomerResult,
  AdminInsertStaffParams,
  AdminUpdateStaffParams,
  StaffRowResult,
  CreateDepotParams,
  UpdateDepotParams,
  CreateCategoryParams,
  UpdateCategoryParams,
  CreateProductParams,
  UpdateProductParams,
  UpdateBusinessSettingsParams,
  AdminDashboardSummary,
  AdminReportParams,
  AdminSalesReport,
  AdminInventoryReport,
  AdminCustomersReport,
  AdminCashReport,
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
  fnName: RpcName | string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any,
): Promise<RpcResult<TResult>> {
  try {
    assertKnownRpc(fnName)
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

  createProforma: (params: {
    p_depot_id: string
    p_customer_id?: string | null
    p_document_date?: string | null
    p_external_ref?: string | null
    p_notes?: string | null
    p_discount_type?: 'flat' | 'percent' | null
    p_discount_value?: number | null
    p_items: Array<{
      product_id: string
      unit_level: number
      quantity_in_unit: number
      unit_price_cfa?: number
      line_discount_cfa?: number
    }>
  }): Promise<RpcResult<{ id: string; number: string; total_cfa: number; status: string }>> =>
    callRpc('create_proforma', params),

  updateProforma: (params: {
    p_proforma_id: string
    p_customer_id?: string | null
    p_document_date?: string | null
    p_external_ref?: string | null
    p_notes?: string | null
    p_discount_type?: 'flat' | 'percent' | null
    p_discount_value?: number | null
    p_items?: Array<{
      product_id: string
      unit_level: number
      quantity_in_unit: number
      unit_price_cfa?: number
      line_discount_cfa?: number
    }> | null
    p_clear_customer?: boolean
  }): Promise<RpcResult<{ id: string; number: string; ok: boolean }>> =>
    callRpc('update_proforma', params),

  setProformaStatus: (params: {
    p_proforma_id: string
    p_status: 'sent' | 'cancelled'
  }): Promise<RpcResult<{ id: string; status: string }>> =>
    callRpc('set_proforma_status', params),

  duplicateProforma: (proformaId: string): Promise<RpcResult<{ id: string; number: string; status: string }>> =>
    callRpc('duplicate_proforma', { p_proforma_id: proformaId }),

  getProforma: (proformaId: string): Promise<RpcResult<unknown>> =>
    callRpc('get_proforma', { p_proforma_id: proformaId }),

  listProformas: (params: {
    p_depot_id?: string | null
    p_status?: string | null
    p_limit?: number
    p_offset?: number
  }): Promise<RpcResult<unknown>> =>
    callRpc('list_proformas', params),

  createSupplier: (params: {
    p_name: string
    p_phone?: string | null
    p_address?: string | null
  }): Promise<RpcResult<{ id: string }>> =>
    callRpc('create_supplier', params),

  updateSupplier: (params: {
    p_supplier_id: string
    p_name?: string | null
    p_phone?: string | null
    p_address?: string | null
    p_is_active?: boolean | null
  }): Promise<RpcResult<unknown>> =>
    callRpc('update_supplier', params),

  listSuppliers: (params: {
    p_active_only?: boolean
    p_limit?: number
    p_offset?: number
  }): Promise<RpcResult<unknown>> =>
    callRpc('list_suppliers', params),

  upsertPurchaseReceipt: (params: {
    p_depot_id: string
    p_supplier_id: string
    p_items: Array<{
      product_id: string
      unit_level: number
      quantity_in_unit: number
      unit_cost_cfa: number
    }>
    p_purchase_receipt_id?: string | null
    p_document_date?: string | null
    p_external_ref?: string | null
    p_notes?: string | null
  }): Promise<RpcResult<{ id: string; number: string; total_cfa: number; status: string }>> =>
    callRpc('upsert_purchase_receipt', params),

  validatePurchaseReceipt: (params: {
    p_purchase_receipt_id: string
    p_payment_mode: 'paid' | 'credit'
    p_payment_method?: 'cash' | 'mobile' | 'bank' | null
  }): Promise<RpcResult<unknown>> =>
    callRpc('validate_purchase_receipt', params),

  cancelPurchaseReceipt: (id: string): Promise<RpcResult<unknown>> =>
    callRpc('cancel_purchase_receipt', { p_purchase_receipt_id: id }),

  getPurchaseReceipt: (id: string): Promise<RpcResult<unknown>> =>
    callRpc('get_purchase_receipt', { p_purchase_receipt_id: id }),

  listPurchaseReceipts: (params: {
    p_depot_id?: string | null
    p_supplier_id?: string | null
    p_status?: string | null
    p_limit?: number
    p_offset?: number
  }): Promise<RpcResult<unknown>> =>
    callRpc('list_purchase_receipts', params),

  recordSupplierPayment: (params: {
    p_supplier_id: string
    p_amount_cfa: number
    p_method: 'cash' | 'mobile' | 'bank'
    p_note?: string | null
    p_depot_id?: string | null
  }): Promise<RpcResult<unknown>> =>
    callRpc('record_supplier_payment', params),

  listSupplierPayments: (params: {
    p_supplier_id?: string | null
    p_limit?: number
    p_offset?: number
  }): Promise<RpcResult<unknown>> =>
    callRpc('list_supplier_payments', params),

  adminReportPurchases: (params: {
    p_depot_id?: string | null
    p_start_date?: string | null
    p_end_date?: string | null
    p_supplier_id?: string | null
  }): Promise<RpcResult<unknown>> =>
    callRpc('admin_report_purchases', params),

  saleDeliveryRemaining: (saleId: string): Promise<RpcResult<unknown>> =>
    callRpc('sale_delivery_remaining', { p_sale_id: saleId }),

  createDeliveryNote: (params: {
    p_sale_id: string
    p_show_prices?: boolean
    p_received_by_name?: string | null
    p_items: Array<{ sale_item_id: string; quantity_in_unit: number }>
  }): Promise<RpcResult<{ id: string; number: string; sale_id: string }>> =>
    callRpc('create_delivery_note', params),

  getDeliveryNote: (deliveryNoteId: string): Promise<RpcResult<unknown>> =>
    callRpc('get_delivery_note', { p_delivery_note_id: deliveryNoteId }),

  listDeliveryNotesForSale: (saleId: string): Promise<RpcResult<unknown>> =>
    callRpc('list_delivery_notes_for_sale', { p_sale_id: saleId }),

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

  releaseSaleFulfillment: (
    params: ReleaseSaleFulfillmentParams,
  ): Promise<RpcResult<ReleaseSaleFulfillmentResult>> =>
    callRpc<ReleaseSaleFulfillmentResult>('release_sale_fulfillment', params),

  requeuePrintJob: (params: RequeuePrintJobParams): Promise<RpcResult<RequeuePrintJobResult>> =>
    callRpc<RequeuePrintJobResult>('requeue_print_job', params),

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
   * Cancel a pending transfer. No stock or ledger writes.
   * Pending only. Admin any accessible; depot_staff source depot only.
   */
  cancelTransfer: (params: CancelTransferParams): Promise<RpcResult<CancelTransferResult>> =>
    callRpc<CancelTransferResult>('cancel_transfer', params),

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

  // ── Customer management (Phase 6) ──────────────────────────────

  /**
   * Create a new customer. Roles: cashier, admin.
   * balance_owed_cfa is always 0 at creation — never supplied by client.
   * No idempotency key: protect against double-submit via UI isSubmitting guard.
   */
  createCustomer: (params: CreateCustomerParams): Promise<RpcResult<CreateCustomerResult>> =>
    callRpc<CreateCustomerResult>('create_customer', params),

  /**
   * Update customer name, phone, address. Roles: cashier, admin.
   * Does NOT update balance_owed_cfa, is_active, or deactivated_at.
   */
  updateCustomer: (params: UpdateCustomerParams): Promise<RpcResult<UpdateCustomerResult>> =>
    callRpc<UpdateCustomerResult>('update_customer', params),

  /**
   * Soft-deactivate a customer. Admin only.
   * Outstanding balance is preserved; record_payment() still works on inactive customers.
   * Idempotent: already-inactive returns current state.
   */
  deactivateCustomer: (params: DeactivateCustomerParams): Promise<RpcResult<DeactivateCustomerResult>> =>
    callRpc<DeactivateCustomerResult>('deactivate_customer', params),

  /**
   * Restore is_active=true on a deactivated customer. Admin only.
   * Immediately eligible for new POS credit sales.
   * Idempotent: already-active returns current state.
   */
  reactivateCustomer: (params: ReactivateCustomerParams): Promise<RpcResult<ReactivateCustomerResult>> =>
    callRpc<ReactivateCustomerResult>('reactivate_customer', params),

  adminInsertStaff: (params: AdminInsertStaffParams): Promise<RpcResult<StaffRowResult>> =>
    callRpc<StaffRowResult>('admin_insert_staff', params),

  adminUpdateStaffRow: (params: AdminUpdateStaffParams): Promise<RpcResult<StaffRowResult>> =>
    callRpc<StaffRowResult>('admin_update_staff_row', params),

  adminDeactivateStaffRow: (staffId: string): Promise<RpcResult<StaffRowResult>> =>
    callRpc<StaffRowResult>('admin_deactivate_staff_row', { p_staff_id: staffId }),

  adminReactivateStaffRow: (staffId: string): Promise<RpcResult<StaffRowResult>> =>
    callRpc<StaffRowResult>('admin_reactivate_staff_row', { p_staff_id: staffId }),

  adminGetStaffRow: (staffId: string): Promise<RpcResult<StaffRowResult>> =>
    callRpc<StaffRowResult>('admin_get_staff_row', { p_staff_id: staffId }),

  createDepot: (params: CreateDepotParams): Promise<RpcResult<import('@/types/database').Depot>> =>
    callRpc('create_depot', params),

  updateDepot: (params: UpdateDepotParams): Promise<RpcResult<import('@/types/database').Depot>> =>
    callRpc('update_depot', params),

  deactivateDepot: (depotId: string): Promise<RpcResult<import('@/types/database').Depot>> =>
    callRpc('deactivate_depot', { p_depot_id: depotId }),

  reactivateDepot: (depotId: string): Promise<RpcResult<import('@/types/database').Depot>> =>
    callRpc('reactivate_depot', { p_depot_id: depotId }),

  createCategory: (params: CreateCategoryParams): Promise<RpcResult<import('@/types/database').Category>> =>
    callRpc('create_category', params),

  updateCategory: (params: UpdateCategoryParams): Promise<RpcResult<import('@/types/database').Category>> =>
    callRpc('update_category', params),

  deactivateCategory: (categoryId: string): Promise<RpcResult<import('@/types/database').Category>> =>
    callRpc('deactivate_category', { p_category_id: categoryId }),

  reactivateCategory: (categoryId: string): Promise<RpcResult<import('@/types/database').Category>> =>
    callRpc('reactivate_category', { p_category_id: categoryId }),

  createProduct: (params: CreateProductParams): Promise<RpcResult<import('@/types').ProductWithUnits>> =>
    callRpc('create_product', params),

  updateProduct: (params: UpdateProductParams): Promise<RpcResult<import('@/types').ProductWithUnits>> =>
    callRpc('update_product', params),

  deactivateProduct: (productId: string): Promise<RpcResult<import('@/types/database').Product>> =>
    callRpc('deactivate_product', { p_product_id: productId }),

  reactivateProduct: (productId: string): Promise<RpcResult<import('@/types/database').Product>> =>
    callRpc('reactivate_product', { p_product_id: productId }),

  updateBusinessSettings: (
    params: UpdateBusinessSettingsParams,
  ): Promise<RpcResult<import('@/types/database').BusinessSettings>> =>
    callRpc('update_business_settings', params),

  adminDashboardSummary: (depotId: string | null): Promise<RpcResult<AdminDashboardSummary>> =>
    callRpc<AdminDashboardSummary>('admin_dashboard_summary', { p_depot_id: depotId }),

  adminReportSales: (params: AdminReportParams): Promise<RpcResult<AdminSalesReport>> =>
    callRpc<AdminSalesReport>('admin_report_sales', params),

  adminReportInventory: (params: AdminReportParams): Promise<RpcResult<AdminInventoryReport>> =>
    callRpc<AdminInventoryReport>('admin_report_inventory', params),

  adminReportCustomers: (params: AdminReportParams): Promise<RpcResult<AdminCustomersReport>> =>
    callRpc<AdminCustomersReport>('admin_report_customers', params),

  adminReportCash: (params: AdminReportParams): Promise<RpcResult<AdminCashReport>> =>
    callRpc<AdminCashReport>('admin_report_cash', params),

  adminReportCostDetail: (params: AdminCostReportParams): Promise<RpcResult<AdminCostReport>> =>
    callRpc<AdminCostReport>('admin_report_cost_detail', params),

  adminReportCollections: (params: AdminReportParams): Promise<RpcResult<unknown>> =>
    callRpc('admin_report_collections', params),

  adminReportSalesByHour: (params: AdminReportParams): Promise<RpcResult<unknown>> =>
    callRpc('admin_report_sales_by_hour', params),

  adminReportShiftLines: (params: AdminReportParams): Promise<RpcResult<unknown>> =>
    callRpc('admin_report_shift_lines', params),

  adminReportDiscounts: (params: AdminReportParams): Promise<RpcResult<unknown>> =>
    callRpc('admin_report_discounts', params),

  adminReportCustomerAgeing: (params: { p_depot_id: string | null; p_as_of: string }): Promise<RpcResult<unknown>> =>
    callRpc('admin_report_customer_ageing', params),

  adminReportStockMovements: (params: AdminReportParams): Promise<RpcResult<unknown>> =>
    callRpc('admin_report_stock_movements', params),

  adminReportLowStock: (params: { p_depot_id: string | null }): Promise<RpcResult<unknown>> =>
    callRpc('admin_report_low_stock', params),

  adminRefundsOverPayable: (): Promise<RpcResult<Array<{ sale_id: string; receipt_number: string; payable_cfa: number; refunds_cfa: number }>>> =>
    callRpc('admin_refunds_over_payable', {}),

  customerLedger: (customerId: string): Promise<RpcResult<CustomerLedgerRpcRow[]>> =>
    callRpc('customer_ledger', { p_customer_id: customerId }),
} as const

export interface CustomerLedgerRpcRow {
  id: string
  kind: 'sale' | 'cash_payment' | 'return' | 'account_payment' | 'cash_refund'
  occurred_at: string
  reference: string | null
  item_summary: string | null
  note: string | null
  amount_cfa: number
  running_balance_cfa: number
  sale_id: string | null
  adds_credit: boolean
  cash_refunded_cfa?: number | null
}

// ─── Cost report types (CEO Notes) ─────────────────────────────
export interface AdminCostReportParams {
  p_depot_id?: string | null
  p_start_date?: string | null
  p_end_date?: string | null
  p_category_id?: string | null
  p_product_id?: string | null
}

export interface AdminCostInventoryRow {
  product_id: string
  product_name: string
  photo_url: string
  depot_id: string
  depot_name: string
  category_id: string
  category_name: string
  current_stock_pieces: number
  serial_number: string | null
  cost_price_cfa: number
  selling_price_cfa: number
  inventory_value_at_cost: number
  inventory_value_at_selling: number
  /** Null when selling price is 0/null or cost price is missing. */
  potential_profit: number | null
  is_active: boolean
}

export interface AdminCostRestockRow {
  stock_entry_id: string
  entered_at: string
  depot_id: string
  depot_name: string
  product_id: string
  product_name: string
  category_name: string
  unit_level: number
  unit_name: string | null
  serial_number: string | null
  quantity_in_unit: number
  quantity_pieces: number
  unit_cost_price_cfa: number
  total_cost_cfa: number
  note: string | null
  entered_by_name: string | null
}

export interface AdminCostReport {
  inventory_cost: AdminCostInventoryRow[]
  inventory_totals: {
    total_inventory_value_at_cost: number
    total_inventory_value_at_selling: number
    total_potential_profit: number
  }
  restock_log: AdminCostRestockRow[]
  period_totals: {
    total_restock_quantity_pieces: number
    total_restock_cost_cfa: number
  }
  filters: {
    depot_id: string | null
    start_date: string | null
    end_date: string | null
    category_id: string | null
    product_id: string | null
  }
}
