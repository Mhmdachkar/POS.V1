/**
 * Print job payload snapshot (matches private.build_print_payload_for_sale jsonb).
 */

import type { DiscountType, SaleStatus } from '@/types/database'

export interface PrintPayloadLine {
  product_id: string
  product_name: string
  unit_name: string
  unit_level: number
  quantity_in_unit: number
  quantity_pieces: number
  unit_price_cfa: number
  line_discount_cfa?: number
  line_total_cfa: number
  net_line_total_cfa: number
}

export interface PrintJobPayload {
  business_name: string
  depot_name: string
  depot_code: string
  sale_id: string
  receipt_number: string
  created_at: string
  status: SaleStatus
  cashier_name: string | null
  customer_name: string | null
  customer_phone: string | null
  display_currency: string
  subtotal_cfa: number
  discount_type: DiscountType | null
  discount_value: number | null
  discount_amount_cfa: number
  total_cfa: number
  amount_tendered_cfa: number
  amount_applied_cfa: number
  change_given_cfa: number
  balance_added_cfa: number
  items: PrintPayloadLine[]
}

export type PrintJobStatus = 'queued' | 'claimed' | 'sent' | 'failed'
export type PrintDestination = 'cashier' | 'depot'
export type PrintDocumentType = 'customer_receipt' | 'depot_order'

export interface PrintJobRow {
  id: string
  sale_id: string
  depot_id: string
  destination: PrintDestination
  document_type: PrintDocumentType
  status: PrintJobStatus
  payload: PrintJobPayload
  created_at: string
  claimed_at: string | null
  claimed_by_agent: string | null
  attempted_at: string | null
  printed_at: string | null
  error_detail: string | null
  attempt_count: number
}

export type FulfillmentStatus = 'pending' | 'released'

export interface SaleFulfillmentRow {
  sale_id: string
  depot_id: string
  status: FulfillmentStatus
  released_at: string | null
  released_by: string | null
  released_by_name: string | null
  created_at: string
}
