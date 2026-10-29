/** Latest public RPC names and argument keys the app is allowed to call. */
export const RPC_SIGNATURES = {
  complete_sale: ['p_idempotency_key'],
  record_payment: ['p_customer_id', 'p_amount_cfa'],
  process_return: ['p_sale_id'],
  void_sale: ['p_sale_id'],
  release_sale_fulfillment: ['p_sale_id'],
  requeue_print_job: ['p_print_job_id'],
  adjust_inventory: ['p_product_id', 'p_quantity_pieces'],
  restock_product: ['p_product_id'],
  create_transfer_draft: ['p_source_depot_id', 'p_dest_depot_id'],
  complete_transfer: ['p_transfer_id'],
  cancel_transfer: ['p_transfer_id'],
  open_shift: ['p_depot_id'],
  close_shift: ['p_shift_id'],
  create_customer: ['p_name'],
  update_customer: ['p_customer_id'],
  deactivate_customer: ['p_customer_id'],
  reactivate_customer: ['p_customer_id'],
  admin_insert_staff: ['p_username'],
  admin_update_staff_row: ['p_staff_id'],
  admin_deactivate_staff_row: ['p_staff_id'],
  admin_reactivate_staff_row: ['p_staff_id'],
  admin_get_staff_row: ['p_staff_id'],
  create_depot: ['p_name'],
  update_depot: ['p_depot_id'],
  deactivate_depot: ['p_depot_id'],
  reactivate_depot: ['p_depot_id'],
  create_category: ['p_name'],
  update_category: ['p_category_id'],
  deactivate_category: ['p_category_id'],
  reactivate_category: ['p_category_id'],
  create_product: ['p_name', 'p_depot_id'],
  update_product: ['p_product_id'],
  deactivate_product: ['p_product_id'],
  reactivate_product: ['p_product_id'],
  update_business_settings: ['p_business_name'],
  admin_dashboard_summary: ['p_depot_id'],
  admin_report_sales: ['p_depot_id', 'p_start_date', 'p_end_date', 'p_cashier_id', 'p_category_id', 'p_product_id', 'p_shift_id'],
  admin_report_inventory: ['p_depot_id', 'p_start_date', 'p_end_date', 'p_category_id', 'p_product_id'],
  admin_report_customers: ['p_depot_id', 'p_start_date', 'p_end_date'],
  admin_report_cash: ['p_depot_id', 'p_start_date', 'p_end_date'],
  admin_report_cost_detail: ['p_depot_id', 'p_start_date', 'p_end_date', 'p_category_id', 'p_product_id'],
  admin_report_collections: ['p_depot_id', 'p_start_date', 'p_end_date', 'p_cashier_id'],
  admin_report_sales_by_hour: ['p_depot_id', 'p_start_date', 'p_end_date', 'p_cashier_id'],
  admin_report_shift_lines: ['p_depot_id', 'p_start_date', 'p_end_date', 'p_cashier_id'],
  admin_report_discounts: ['p_depot_id', 'p_start_date', 'p_end_date', 'p_cashier_id'],
  admin_report_customer_ageing: ['p_depot_id', 'p_as_of'],
  admin_report_stock_movements: ['p_depot_id', 'p_start_date', 'p_end_date', 'p_category_id', 'p_product_id'],
  admin_report_low_stock: ['p_depot_id'],
  admin_refunds_over_payable: [],
  staff_display_names: ['p_ids'],
  customer_ledger: ['p_customer_id'],
  create_proforma: ['p_depot_id', 'p_items'],
  update_proforma: ['p_proforma_id'],
  set_proforma_status: ['p_proforma_id', 'p_status'],
  duplicate_proforma: ['p_proforma_id'],
  get_proforma: ['p_proforma_id'],
  list_proformas: ['p_depot_id', 'p_status', 'p_limit', 'p_offset', 'p_search', 'p_start_at', 'p_end_at'],
  sale_delivery_remaining: ['p_sale_id'],
  create_delivery_note: ['p_sale_id', 'p_items'],
  get_delivery_note: ['p_delivery_note_id'],
  list_delivery_notes_for_sale: ['p_sale_id'],
  create_supplier: ['p_name', 'p_phone', 'p_address', 'p_email', 'p_notes', 'p_payment_term_days'],
  update_supplier: [
    'p_supplier_id',
    'p_name',
    'p_phone',
    'p_address',
    'p_is_active',
    'p_email',
    'p_notes',
    'p_payment_term_days',
  ],
  list_suppliers: ['p_active_only', 'p_limit', 'p_offset', 'p_search', 'p_sort_by', 'p_sort_dir'],
  get_supplier: ['p_supplier_id'],
  supplier_ledger: ['p_supplier_id'],
  upsert_purchase_receipt: ['p_depot_id', 'p_supplier_id', 'p_items'],
  validate_purchase_receipt: ['p_purchase_receipt_id', 'p_payment_mode'],
  cancel_purchase_receipt: ['p_purchase_receipt_id'],
  get_purchase_receipt: ['p_purchase_receipt_id'],
  list_purchase_receipts: [
    'p_depot_id',
    'p_supplier_id',
    'p_status',
    'p_limit',
    'p_offset',
    'p_search',
    'p_start_at',
    'p_end_at',
  ],
  record_supplier_payment: ['p_supplier_id', 'p_amount_cfa', 'p_method'],
  list_supplier_payments: ['p_supplier_id', 'p_limit', 'p_offset', 'p_search', 'p_start_at', 'p_end_at'],
  admin_report_purchases: [
    'p_depot_id',
    'p_start_date',
    'p_end_date',
    'p_supplier_id',
    'p_include_zero',
  ],
  admin_report_purchases_by_product: ['p_depot_id', 'p_start_date', 'p_end_date', 'p_supplier_id'],
  admin_report_purchases_by_period: ['p_depot_id', 'p_start_date', 'p_end_date', 'p_supplier_id'],
} as const

export type RpcName = keyof typeof RPC_SIGNATURES

export function assertKnownRpc(name: string): asserts name is RpcName {
  if (!(name in RPC_SIGNATURES)) {
    throw new Error(`Unknown RPC ${name}`)
  }
}

export function pickRpcArgs(name: RpcName, params: Record<string, unknown>): Record<string, unknown> {
  const allowed = RPC_SIGNATURES[name] as readonly string[]
  if (allowed.length === 0) return {}
  const next: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in params) next[key] = params[key]
  }
  return next
}
