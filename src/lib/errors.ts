/**
 * VHM POS — Business error codes and user-friendly messages.
 *
 * IMPORTANT: Raw Postgres/Supabase errors must NEVER be shown to users.
 * All Edge Functions return structured errors using these codes.
 * The frontend maps codes → human-readable messages here.
 */

export type VhmErrorCode =
  | 'INSUFFICIENT_STOCK'
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
  | 'UNKNOWN'

const ERROR_MESSAGES: Record<VhmErrorCode, string> = {
  INSUFFICIENT_STOCK: 'Not enough stock available for this product.',
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
  UNKNOWN: 'An unexpected error occurred. Please try again.',
}

export interface VhmError {
  code: VhmErrorCode
  message: string
  details?: Record<string, unknown>
}

/**
 * Parse an Edge Function error response into a VhmError.
 * Edge Functions return: { error: { code: string, message: string, details?: {} } }
 */
export function parseEdgeFunctionError(raw: unknown): VhmError {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
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
