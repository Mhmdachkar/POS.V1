/**
 * Per-product low-stock evaluation.
 *
 * Tracking is opt-in. Stock is always products.current_stock_pieces.
 * This module does not persist alerts or notification rows.
 */

export const DEFAULT_LOW_STOCK_THRESHOLD_PIECES = 10

export type StockAlertKind = 'low_stock' | 'out_of_stock'

export interface LowStockSettings {
  track_low_stock: boolean
  low_stock_threshold: number | null
  current_stock_pieces: number
}

export function validateLowStockSettings(
  trackLowStock: boolean,
  threshold: number | null,
): string | null {
  if (trackLowStock) {
    if (threshold == null || Number.isNaN(threshold)) {
      return 'Enter a low-stock threshold when tracking is on.'
    }
    if (threshold < 0) {
      return 'Low-stock threshold must be 0 or greater.'
    }
    return null
  }
  if (threshold != null && threshold < 0) {
    return 'Low-stock threshold must be 0 or greater.'
  }
  return null
}

export function parseLowStockThreshold(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  return value
}

/**
 * Warning kind for tracked products only.
 * Untracked products never produce a low-stock or dashboard out-of-stock alert.
 * Operational out-of-stock (stock = 0) is handled separately by getStockStatus.
 */
export function evaluateTrackedStockAlert(input: LowStockSettings): StockAlertKind | null {
  if (!input.track_low_stock) return null
  if (input.current_stock_pieces <= 0) return 'out_of_stock'
  if (
    input.low_stock_threshold != null &&
    input.current_stock_pieces <= input.low_stock_threshold
  ) {
    return 'low_stock'
  }
  return null
}

export function isTrackedLowStock(input: LowStockSettings): boolean {
  return evaluateTrackedStockAlert(input) === 'low_stock'
}

export function isTrackedOutOfStock(input: LowStockSettings): boolean {
  return evaluateTrackedStockAlert(input) === 'out_of_stock'
}

/** Mirrors private.product_stock_status. Untracked zero stock is non_suivi. */
export type ProductStockStatusCode = 'ok' | 'faible' | 'rupture' | 'non_suivi'

export function productStockStatus(input: LowStockSettings): ProductStockStatusCode {
  if (!input.track_low_stock && input.current_stock_pieces <= 0) return 'non_suivi'
  if (!input.track_low_stock) return 'ok'
  if (input.current_stock_pieces <= 0) return 'rupture'
  if (
    input.low_stock_threshold != null &&
    input.current_stock_pieces <= input.low_stock_threshold
  ) {
    return 'faible'
  }
  return 'ok'
}
