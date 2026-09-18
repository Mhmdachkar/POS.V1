// Re-export all database types for convenient import
export * from './database'

// ─────────────────────────────────────────────────────────────────
// Application-level types (not direct DB rows)
// ─────────────────────────────────────────────────────────────────

import type { Product, ProductUnit, Customer, StaffRole } from './database'

/** A product with its units pre-loaded (used in POS product grid) */
export interface ProductWithUnits extends Product {
  units: ProductUnit[]
  category_name?: string
}

/**
 * A single item in the POS cart.
 *
 * NOTE: Prices are stored from the product_units row at the time
 * the item is added to the cart. They are DISPLAY-ONLY previews.
 * The authoritative prices used in the actual transaction are
 * re-read by the Edge Function from the database at commit time.
 */
export interface CartItem {
  product_id: string
  product_name: string
  product_photo_url: string
  unit_level: 0 | 1 | 2
  unit_name: string
  quantity_in_unit: number
  unit_price_cfa: number
  cost_price_cfa: number
  conversion_to_base: number
  /** quantity_in_unit * unit_price_cfa — display only */
  line_total_cfa: number
}

/**
 * Checkout totals computed client-side for display preview.
 * The server re-computes and returns the authoritative values.
 */
export interface CheckoutTotals {
  subtotal_cfa: number
  discount_amount_cfa: number
  total_cfa: number
  amount_tendered_cfa: number
  amount_applied_cfa: number
  change_given_cfa: number
  balance_added_cfa: number
}

/** Pagination cursor for list queries */
export interface PaginationParams {
  page: number
  pageSize: number
}

/** Generic paginated result */
export interface PaginatedResult<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
  hasMore: boolean
}

/** Stock status derived from current_stock_pieces + optional per-product tracking. */
export type StockStatus = 'out_of_stock' | 'low_stock' | 'healthy'

/**
 * Suggested default when an admin turns tracking on.
 * Not a global warning rule — untracked products are never Low Stock.
 */
export const LOW_STOCK_THRESHOLD_PIECES = 10

export interface StockStatusTracking {
  trackLowStock?: boolean | null
  threshold?: number | null
}

/** Derive stock status from authoritative current_stock_pieces. */
export function getStockStatus(
  pieces: number,
  tracking?: StockStatusTracking,
): StockStatus {
  if (pieces <= 0) return 'out_of_stock'
  if (
    tracking?.trackLowStock === true &&
    tracking.threshold != null &&
    pieces <= tracking.threshold
  ) {
    return 'low_stock'
  }
  return 'healthy'
}

export function getProductStockStatus(product: {
  current_stock_pieces: number
  track_low_stock?: boolean | null
  low_stock_threshold?: number | null
}): StockStatus {
  return getStockStatus(product.current_stock_pieces, {
    trackLowStock: product.track_low_stock,
    threshold: product.low_stock_threshold,
  })
}

/** Inventory list filters — all applied at the query layer before pagination. */
export interface InventoryListFilters {
  page: number
  pageSize: number
  search: string
  categoryId: string | null
  stockStatus: StockStatus | 'all'
  /** null = All Depots (admin viewing scope only) */
  depotId: string | null
}

/** Auth context stored in Zustand */
export interface AuthUser {
  supabase_id: string
  staff: import('./database').Staff
}

/** Depot selector option */
export interface DepotOption {
  id: string
  name: string
  code: string
  is_active: boolean
}

/** Sale return item draft (used in return workflow) */
export interface ReturnItemDraft {
  sale_item_id: string
  product_name: string
  unit_name: string
  original_quantity_in_unit: number
  already_returned_quantity: number
  returnable_quantity: number
  selected_quantity: number
  unit_price_cfa: number
  /** Computed display refund for this item, server is authoritative */
  estimated_refund_cfa: number
}
