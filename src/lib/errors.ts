/**
 * VHM POS — Business error codes and user-friendly messages.
 *
 * IMPORTANT: Raw Postgres/Supabase errors must NEVER be shown to users.
 * All Edge Functions return structured errors using these codes.
 * The frontend maps codes → human-readable messages here.
 */

export type VhmErrorCode =
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_PRICE'
  | 'INVALID_UNIT'
  | 'INVALID_CART'
  | 'INVALID_DISCOUNT'
  | 'INVALID_CURRENCY'
  | 'PRODUCT_NOT_IN_DEPOT'
  | 'PRODUCT_INACTIVE'
  | 'DEPOT_INACTIVE'
  | 'CUSTOMER_REQUIRED'
  | 'CUSTOMER_NOT_FOUND'
  | 'RETURN_QTY_EXCEEDED'
  | 'SALE_FULLY_RETURNED'
  | 'SALE_VOIDED'
  | 'SALE_NOT_FOUND'
  | 'PAYMENT_EXCEEDS_BALANCE'
  | 'TRANSFER_ALREADY_COMPLETED'
  | 'TRANSFER_CANCELLED'
  | 'TRANSFER_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'INVALID_DEPOT'
  | 'SHIFT_ALREADY_CLOSED'
  | 'SHIFT_NOT_FOUND'
  | 'SHIFT_NOT_OPEN'
  | 'CONCURRENT_UPDATE'
  | 'RECEIPT_GENERATION_FAILED'
  | 'INVALID_ADJUSTMENT_SIGN'
  | 'ADJUSTMENT_NEGATIVE_RESULT'
  | 'INVALID_QUANTITY'
  | 'INVALID_AMOUNT'
  | 'CART_EMPTY'
  | 'PRODUCT_NOT_FOUND'
  | 'UNIT_NOT_FOUND'
  | 'CATEGORY_NAME_CONFLICT'
  | 'DUPLICATE_PRODUCT_NAME'
  | 'STAFF_ALREADY_DEACTIVATED'
  | 'CANNOT_DEACTIVATE_SELF'
  | 'INVALID_INPUT'
  | 'UNKNOWN'

export const ERROR_MESSAGES: Record<VhmErrorCode, string> = {
  INSUFFICIENT_STOCK: 'Not enough stock available for this product.',
  INVALID_PRICE: 'Product has an invalid price configuration. Contact an administrator.',
  INVALID_UNIT: 'Product unit configuration is invalid. Contact an administrator.',
  INVALID_CART: 'Cart total must be greater than zero.',
  INVALID_DISCOUNT: 'Invalid discount value. Check the discount type and amount.',
  INVALID_CURRENCY: 'Invalid display currency. Use CFA or USD.',
  PRODUCT_NOT_IN_DEPOT: 'Product not found in this depot.',
  PRODUCT_INACTIVE: 'This product is no longer available.',
  DEPOT_INACTIVE: 'This depot is currently inactive.',
  CUSTOMER_REQUIRED: 'A customer must be selected for credit sales.',
  CUSTOMER_NOT_FOUND: 'Customer not found.',
  RETURN_QTY_EXCEEDED: 'Return quantity exceeds the remaining returnable amount.',
  SALE_FULLY_RETURNED: 'This sale has already been fully returned.',
  SALE_VOIDED: 'This sale has been voided and cannot be processed further.',
  SALE_NOT_FOUND: 'Sale not found.',
  PAYMENT_EXCEEDS_BALANCE: 'Payment amount exceeds the customer\'s outstanding balance.',
  TRANSFER_ALREADY_COMPLETED: 'This transfer has already been completed.',
  TRANSFER_CANCELLED: 'This transfer was cancelled.',
  TRANSFER_NOT_FOUND: 'Transfer not found.',
  UNAUTHORIZED: 'You don\'t have permission to perform this action.',
  INVALID_DEPOT: 'Invalid depot or unauthorized depot access.',
  SHIFT_ALREADY_CLOSED: 'This shift is already closed.',
  SHIFT_NOT_FOUND: 'Shift not found.',
  SHIFT_NOT_OPEN: 'No open shift found. Please open a shift before proceeding.',
  CONCURRENT_UPDATE: 'This record was modified by another operation. Please try again.',
  RECEIPT_GENERATION_FAILED: 'Unable to generate receipt number. Please try again.',
  INVALID_ADJUSTMENT_SIGN: 'Damage, loss, and expiry adjustments must reduce stock (negative quantity).',
  ADJUSTMENT_NEGATIVE_RESULT: 'This adjustment would result in negative stock.',
  INVALID_QUANTITY: 'Please enter a valid quantity greater than zero.',
  INVALID_AMOUNT: 'Please enter a valid amount greater than zero.',
  CART_EMPTY: 'Your cart is empty. Add products before checking out.',
  PRODUCT_NOT_FOUND: 'Product not found.',
  UNIT_NOT_FOUND: 'Unit configuration not found for this product.',
  CATEGORY_NAME_CONFLICT: 'A category with this name already exists in the same parent.',
  DUPLICATE_PRODUCT_NAME: 'A product with this name already exists in this depot.',
  STAFF_ALREADY_DEACTIVATED: 'This staff account is already deactivated.',
  CANNOT_DEACTIVATE_SELF: 'You cannot deactivate your own account.',
  INVALID_INPUT: 'Invalid input. Please check your entries and try again.',
  UNKNOWN: 'An unexpected error occurred. Please try again.',
}

export interface VhmError {
  code: VhmErrorCode
  message: string
  details?: Record<string, unknown>
}

/**
 * Parse any Supabase or application error into a VhmError.
 *
 * Handles these formats:
 *
 * 0. Already-parsed application error:
 *    { code: VhmErrorCode, message: string, details? }
 *    Message is always taken from ERROR_MESSAGES[code], never from the
 *    incoming object (prevents raw Postgres strings in the UI).
 *    Postgres codes such as P0001 are not in ERROR_MESSAGES and are ignored.
 *
 * 1. RPC errors (SECURITY DEFINER PostgreSQL functions):
 *    The error.message is a JSON string: '{"code":"INSUFFICIENT_STOCK","details":{...}}'
 *    This is raised via: RAISE EXCEPTION '%', jsonb_build_object(...)::text USING ERRCODE='P0001'
 *
 * 2. Edge Function errors:
 *    The raw value is: { error: { code: string, message: string, details?: {} } }
 *
 * 3. Supabase PostgREST / network errors:
 *    Falls back to UNKNOWN.
 */
export function parseError(raw: unknown): VhmError {
  if (!raw) return { code: 'UNKNOWN', message: ERROR_MESSAGES.UNKNOWN }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>

    // ── Format 0: already-parsed VhmError (thrown by mutation hooks) ──
    if (
      typeof obj.code === 'string' &&
      obj.code in ERROR_MESSAGES &&
      typeof obj.message === 'string'
    ) {
      const code = obj.code as VhmErrorCode
      return {
        code,
        message: ERROR_MESSAGES[code],
        details:
          obj.details && typeof obj.details === 'object'
            ? (obj.details as Record<string, unknown>)
            : undefined,
      }
    }

    // ── Format 1: RPC structured JSON error ──────────────────────
    // Supabase surfaces PostgreSQL RAISE EXCEPTION message in error.message
    const message = obj['message']
    if (typeof message === 'string' && message.startsWith('{')) {
      try {
        const parsed = JSON.parse(message) as Record<string, unknown>
        if (parsed.code && typeof parsed.code === 'string') {
          const code = parsed.code as VhmErrorCode
          return {
            code,
            message: ERROR_MESSAGES[code] ?? message,
            details: parsed['details'] as Record<string, unknown> | undefined,
          }
        }
      } catch {
        // Not valid JSON — fall through
      }
    }

    // ── Format 2: Edge Function error envelope ────────────────
    const err = obj['error'] as Record<string, unknown> | undefined
    if (err?.code && typeof err.code === 'string') {
      const code = err.code as VhmErrorCode
      return {
        code,
        message: ERROR_MESSAGES[code] ?? String(err.message ?? ERROR_MESSAGES.UNKNOWN),
        details: err['details'] as Record<string, unknown> | undefined,
      }
    }
  }

  return { code: 'UNKNOWN', message: ERROR_MESSAGES.UNKNOWN }
}

/**
 * @deprecated Use parseError() instead — handles both RPC and Edge Function errors.
 * Kept for backwards compatibility with Phase 3 Edge Function callers.
 */
export function parseEdgeFunctionError(raw: unknown): VhmError {
  return parseError(raw)
}

/** Get a user-friendly message for a known error code. */
export function getErrorMessage(code: VhmErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN
}

/** Build a VhmError with optional stock detail for display. */
export function insufficientStockError(productName: string, available: number): VhmError {
  return {
    code: 'INSUFFICIENT_STOCK',
    message: `Not enough stock for "${productName}". Available: ${available} pcs.`,
    details: { productName, available },
  }
}
