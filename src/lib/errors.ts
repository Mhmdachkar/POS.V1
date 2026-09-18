/**
 * VHM POS — Business error codes and user-friendly messages.
 *
 * IMPORTANT: Raw Postgres/Supabase errors must NEVER be shown to users.
 * All Edge Functions return structured errors using these codes.
 * The frontend maps codes → human-readable messages here.
 */

import {
  errorMessagesFrench,
  messageForCodeBilingual,
  messageForCodePlain,
} from '@/lib/bilingual/errors'

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
  | 'LAST_ADMIN_REQUIRED'
  | 'STAFF_HAS_OPEN_SHIFT'
  | 'AUTH_SYNC_FAILED'
  | 'STAFF_ROLE_SLOT_TAKEN'
  | 'USERNAME_TAKEN'
  | 'DEPOT_HAS_ACTIVE_STAFF'
  | 'DEPOT_HAS_OPEN_SHIFTS'
  | 'DEPOT_HAS_PENDING_TRANSFERS'
  | 'DEPOT_CODE_CONFLICT'
  | 'CATEGORY_HAS_ACTIVE_CHILDREN'
  | 'CATEGORY_HAS_ACTIVE_PRODUCTS'
  | 'CATEGORY_INACTIVE'
  | 'PRODUCT_IN_PENDING_TRANSFER'
  | 'INVALID_PHOTO_URL'
  | 'INVALID_LOGO_URL'
  | 'INVALID_EXCHANGE_RATE'
  | 'UNIT_LEVEL_REQUIRED'
  | 'INVALID_CONVERSION'
  | 'INVALID_INPUT'
  | 'DUPLICATE_TRANSFER_LINE'
  | 'UNKNOWN'

/** French UI messages (same as messageForCodePlain without details). */
export const ERROR_MESSAGES: Record<VhmErrorCode, string> = errorMessagesFrench()

function messageForCode(
  code: VhmErrorCode,
  details?: Record<string, unknown>,
): string {
  return messageForCodeBilingual(code, details).fr
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
  if (!raw) return { code: 'UNKNOWN', message: messageForCodePlain('UNKNOWN') }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>

    // ── Format 0: already-parsed VhmError (thrown by mutation hooks) ──
    if (
      typeof obj.code === 'string' &&
      obj.code in ERROR_MESSAGES &&
      typeof obj.message === 'string'
    ) {
      const code = obj.code as VhmErrorCode
      const details =
        obj.details && typeof obj.details === 'object'
          ? (obj.details as Record<string, unknown>)
          : undefined
      return {
        code,
        message: messageForCodePlain(code, details),
        details,
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
          const details = parsed['details'] as Record<string, unknown> | undefined
          return {
            code,
            message: code in ERROR_MESSAGES ? messageForCodePlain(code, details) : message,
            details,
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
      const details = err['details'] as Record<string, unknown> | undefined
      return {
        code,
        message:
          code in ERROR_MESSAGES
            ? messageForCodePlain(code, details)
            : String(err.message ?? messageForCodePlain('UNKNOWN')),
        details,
      }
    }
  }

  return { code: 'UNKNOWN', message: messageForCodePlain('UNKNOWN') }
}

/**
 * @deprecated Use parseError() instead — handles both RPC and Edge Function errors.
 * Kept for backwards compatibility with Phase 3 Edge Function callers.
 */
export function parseEdgeFunctionError(raw: unknown): VhmError {
  return parseError(raw)
}

/** Get a user-friendly message for a known error code. */
export function getErrorMessage(
  code: VhmErrorCode,
  details?: Record<string, unknown>,
): string {
  return messageForCode(code, details)
}

/** Build a VhmError with optional stock detail for display. */
export function insufficientStockError(productName: string, available: number): VhmError {
  const fr = `Stock insuffisant pour « ${productName} ». Disponible : ${available} pcs.`
  const en = `Not enough stock for "${productName}". Available: ${available} pcs.`
  return {
    code: 'INSUFFICIENT_STOCK',
    message: `${fr}\n${en}`,
    details: { productName, available, available_pieces: available },
  }
}
