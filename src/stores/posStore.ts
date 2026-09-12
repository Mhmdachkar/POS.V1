import { create } from 'zustand'
import type { CartItem, CheckoutTotals } from '@/types'
import type { Customer } from '@/types/database'
import type { CompleteSaleResult } from '@/types/rpc'

// ─────────────────────────────────────────────────────────────────
// Checkout totals helper (display preview only)
// ─────────────────────────────────────────────────────────────────

/**
 * Compute checkout totals from cart state.
 *
 * CRITICAL: These are CLIENT-SIDE PREVIEW CALCULATIONS ONLY.
 * They are shown to the cashier for visual feedback.
 * The authoritative amounts are computed server-side inside the
 * complete_sale PostgreSQL transaction and returned in the response.
 * Never use these values as authoritative financial state.
 */
export function computeTotals(
  items: CartItem[],
  discountType: 'flat' | 'percent' | null,
  discountValue: number,
  cashTendered: number,
): CheckoutTotals {
  const subtotal_cfa = items.reduce((sum, item) => sum + item.line_total_cfa, 0)

  let discount_amount_cfa = 0
  if (discountType === 'flat') {
    discount_amount_cfa = Math.min(discountValue, subtotal_cfa)
  } else if (discountType === 'percent') {
    discount_amount_cfa = Math.round((discountValue / 100) * subtotal_cfa)
  }

  const total_cfa = Math.max(0, subtotal_cfa - discount_amount_cfa)
  const amount_applied_cfa = Math.min(cashTendered, total_cfa)
  const change_given_cfa = Math.max(0, cashTendered - amount_applied_cfa)
  const balance_added_cfa = Math.max(0, total_cfa - amount_applied_cfa)

  return {
    subtotal_cfa,
    discount_amount_cfa,
    total_cfa,
    amount_tendered_cfa: cashTendered,
    amount_applied_cfa,
    change_given_cfa,
    balance_added_cfa,
  }
}

// ─────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────

interface POSState {
  // Cart
  items: CartItem[]

  // Customer selection
  customer: Customer | null
  isWalkIn: boolean

  // Discount
  discountType: 'flat' | 'percent' | null
  discountValue: number

  // Cash entry
  cashTendered: number

  // Shift (optional — depot-wide ownership model)
  shiftId: string | null

  // ─── Submission lifecycle ────────────────────────────────────
  /**
   * Idempotency key for the current sale attempt.
   *
   * LIFECYCLE:
   *   1. null          → no pending sale attempt
   *   2. generated UUID → first submit clicked; reused on every retry
   *   3. cleared        → only when startNewSale() is called (success confirmed)
   *
   * NEVER generate a new key on retry — that would create a duplicate sale
   * if the server already committed the first attempt.
   */
  idempotencyKey: string | null

  /** True while the complete_sale RPC is in flight */
  isSubmitting: boolean

  /**
   * The server-authoritative sale result after a successful complete_sale.
   * Replaces the client-side preview. Null until sale is committed.
   */
  saleResult: CompleteSaleResult | null

  // ─── Computed display totals (see warning above) ──────────
  totals: CheckoutTotals

  // ─── Actions ──────────────────────────────────────────────────
  /**
   * Add an item to the cart.
   * If the same product+unit already exists, quantities are MERGED
   * (not replaced) to prevent accidental duplicate lines.
   * Different units of the same product remain as distinct lines.
   */
  addItem: (item: Omit<CartItem, 'line_total_cfa'>) => void
  removeItem: (product_id: string, unit_level: number) => void
  updateQuantity: (product_id: string, unit_level: number, qty: number) => void
  setCustomer: (customer: Customer | null) => void
  setWalkIn: (walkIn: boolean) => void
  setDiscountType: (type: 'flat' | 'percent' | null) => void
  setDiscountValue: (value: number) => void
  setCashTendered: (amount: number) => void
  setShiftId: (id: string | null) => void
  clearCart: () => void

  /**
   * Call immediately before the first submit attempt.
   * Generates a fresh idempotency key if none exists.
   * Does NOT generate a new key if one is already set (retry safety).
   */
  ensureIdempotencyKey: () => string

  /** Mark the sale as submitting (prevents double-click). */
  setSubmitting: (v: boolean) => void

  /** Store the server-authoritative sale result. */
  setSaleResult: (result: CompleteSaleResult) => void

  /**
   * Reset the POS for the next customer.
   * Called after the cashier explicitly clicks "New Sale".
   * Clears cart, customer, discount, cash, idempotency key, and sale result.
   * Preserves depot context and shift.
   */
  startNewSale: () => void
}

const emptyTotals: CheckoutTotals = {
  subtotal_cfa: 0,
  discount_amount_cfa: 0,
  total_cfa: 0,
  amount_tendered_cfa: 0,
  amount_applied_cfa: 0,
  change_given_cfa: 0,
  balance_added_cfa: 0,
}

/**
 * POS cart store.
 *
 * Manages the cashier's active cart during a POS session.
 * Cart state is session-scoped (not persisted to localStorage).
 * After completing a sale, call startNewSale() to reset for the next customer.
 */
export const usePOSStore = create<POSState>()((set, get) => ({
  items: [],
  customer: null,
  isWalkIn: true,
  discountType: null,
  discountValue: 0,
  cashTendered: 0,
  shiftId: null,
  idempotencyKey: null,
  isSubmitting: false,
  saleResult: null,
  totals: emptyTotals,

  addItem: (newItem) => {
    const { items, discountType, discountValue, cashTendered } = get()
    const existingIdx = items.findIndex(
      (i) => i.product_id === newItem.product_id && i.unit_level === newItem.unit_level,
    )

    let updatedItems: CartItem[]
    if (existingIdx >= 0) {
      // Merge quantities for same product+unit (prevents accidental duplicate lines)
      updatedItems = items.map((item, idx) => {
        if (idx !== existingIdx) return item
        const qty = item.quantity_in_unit + newItem.quantity_in_unit
        return {
          ...item,
          quantity_in_unit: qty,
          line_total_cfa: qty * item.unit_price_cfa,
        }
      })
    } else {
      // Add new line
      const qty = newItem.quantity_in_unit
      updatedItems = [
        ...items,
        {
          ...newItem,
          quantity_in_unit: qty,
          line_total_cfa: qty * newItem.unit_price_cfa,
        },
      ]
    }

    set({
      items: updatedItems,
      totals: computeTotals(updatedItems, discountType, discountValue, cashTendered),
    })
  },

  removeItem: (product_id, unit_level) => {
    const { discountType, discountValue, cashTendered } = get()
    const updatedItems = get().items.filter(
      (i) => !(i.product_id === product_id && i.unit_level === unit_level),
    )
    set({
      items: updatedItems,
      totals: computeTotals(updatedItems, discountType, discountValue, cashTendered),
    })
  },

  updateQuantity: (product_id, unit_level, qty) => {
    const { discountType, discountValue, cashTendered } = get()
    if (qty <= 0) {
      get().removeItem(product_id, unit_level)
      return
    }
    const updatedItems = get().items.map((item) => {
      if (item.product_id !== product_id || item.unit_level !== unit_level) return item
      return {
        ...item,
        quantity_in_unit: qty,
        line_total_cfa: qty * item.unit_price_cfa,
      }
    })
    set({
      items: updatedItems,
      totals: computeTotals(updatedItems, discountType, discountValue, cashTendered),
    })
  },

  setCustomer: (customer) => set({ customer, isWalkIn: customer === null }),

  setWalkIn: (walkIn) => {
    if (walkIn) {
      set({ isWalkIn: true, customer: null })
    } else {
      set({ isWalkIn: false })
    }
  },

  setDiscountType: (type) => {
    const { items, discountValue, cashTendered } = get()
    // Reset value when changing type to prevent stale values
    const newValue = type === null ? 0 : discountValue
    set({
      discountType: type,
      discountValue: newValue,
      totals: computeTotals(items, type, newValue, cashTendered),
    })
  },

  setDiscountValue: (value) => {
    const { items, discountType, cashTendered } = get()
    set({
      discountValue: value,
      totals: computeTotals(items, discountType, value, cashTendered),
    })
  },

  setCashTendered: (amount) => {
    const { items, discountType, discountValue } = get()
    set({
      cashTendered: amount,
      totals: computeTotals(items, discountType, discountValue, amount),
    })
  },

  setShiftId: (id) => set({ shiftId: id }),

  clearCart: () => {
    const { discountType, discountValue, cashTendered } = get()
    set({
      items: [],
      totals: computeTotals([], discountType, discountValue, cashTendered),
    })
  },

  ensureIdempotencyKey: () => {
    const existing = get().idempotencyKey
    if (existing) return existing
    const key = crypto.randomUUID()
    set({ idempotencyKey: key })
    return key
  },

  setSubmitting: (v) => set({ isSubmitting: v }),

  setSaleResult: (result) => set({ saleResult: result }),

  startNewSale: () =>
    set({
      items: [],
      customer: null,
      isWalkIn: true,
      discountType: null,
      discountValue: 0,
      cashTendered: 0,
      idempotencyKey: null,
      isSubmitting: false,
      saleResult: null,
      totals: emptyTotals,
      // shiftId preserved intentionally — same shift stays active
    }),
}))
