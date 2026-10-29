import { create } from 'zustand'
import { isDiscountOutOfRange, isOverrideOutOfRange } from '@/lib/zeroTotalSale'
import type { CartItem, CheckoutTotals } from '@/types'
import { cartLineTotalCfa } from '@/lib/cartLineTotal'
import type { Customer } from '@/types/database'
import type { CompleteSaleResult } from '@/types/rpc'

// ─────────────────────────────────────────────────────────────────
// Checkout totals helper (display preview only)
// ─────────────────────────────────────────────────────────────────

/**
 * Authoritative checkout total for payment preview.
 * When an admin override exists, it replaces the calculated cart total.
 * `totals.total_cfa` always remains the pre-override calculated amount.
 */
export function effectiveFinalTotal(
  calculatedTotalCfa: number,
  overrideTotalCfa: number | null,
): number {
  if (overrideTotalCfa == null || !Number.isFinite(overrideTotalCfa)) {
    return calculatedTotalCfa
  }
  if (isOverrideOutOfRange(overrideTotalCfa, calculatedTotalCfa)) {
    return calculatedTotalCfa
  }
  return overrideTotalCfa
}

/**
 * Compute checkout totals from cart state.
 *
 * CRITICAL: These are CLIENT-SIDE PREVIEW CALCULATIONS ONLY.
 * They are shown to the cashier for visual feedback.
 * The authoritative amounts are computed server-side inside the
 * complete_sale PostgreSQL transaction and returned in the response.
 * Never use these values as authoritative financial state.
 *
 * Payment fields (applied / change / balance) always use the effective
 * final total (override when set, otherwise calculated).
 */
export function computeTotals(
  items: CartItem[],
  discountType: 'flat' | 'percent' | null,
  discountValue: number,
  cashTendered: number,
  overrideTotalCfa: number | null = null,
): CheckoutTotals {
  const subtotal_cfa = items.reduce((sum, item) => sum + item.line_total_cfa, 0)
  const discountInvalid = isDiscountOutOfRange(discountType, discountValue, subtotal_cfa)

  let discount_amount_cfa = 0
  if (!discountInvalid) {
    if (discountType === 'flat') {
      const flat = Math.min(Math.max(0, discountValue), subtotal_cfa)
      discount_amount_cfa = Number.isFinite(flat) ? flat : 0
    } else if (discountType === 'percent') {
      const pct = Math.min(100, Math.max(0, discountValue))
      discount_amount_cfa = Number.isFinite(pct)
        ? Math.round((pct / 100) * subtotal_cfa)
        : 0
    }
  }

  // Calculated commercial total (pre-override). Matches server sales.total_cfa.
  const total_cfa = discountInvalid
    ? subtotal_cfa
    : Math.max(0, subtotal_cfa - discount_amount_cfa)
  const payable = effectiveFinalTotal(total_cfa, overrideTotalCfa)
  const amount_applied_cfa = Math.min(cashTendered, payable)
  const change_given_cfa = Math.max(0, cashTendered - amount_applied_cfa)
  const balance_added_cfa = Math.max(0, payable - amount_applied_cfa)

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

  // Admin-only total override (null = no override, use calculated total)
  overrideTotalCfa: number | null

  // Admin reason when payable total is 0 (100% / full flat / override 0)
  priceExceptionReason: string

  /** Admin saisie rapide — print/header date YYYY-MM-DD (empty = server today). */
  documentDateYmd: string
  /** Admin saisie rapide — optional Réf. */
  externalRef: string
  /** When set, next complete_sale links/converts this proforma. */
  pendingProformaId: string | null

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
  addItem: (item: Omit<CartItem, 'line_total_cfa' | 'line_discount_cfa'> & { line_discount_cfa?: number }) => void
  removeItem: (product_id: string, unit_level: number) => void
  updateQuantity: (product_id: string, unit_level: number, qty: number) => void
  updateLinePrice: (product_id: string, unit_level: number, unit_price_cfa: number) => void
  updateLineDiscount: (product_id: string, unit_level: number, line_discount_cfa: number) => void
  /**
   * Atomic unit switch for one cart line. One set(). Never convert qty to pieces.
   * If a line already exists for the target unit, merge into that line and drop
   * the source (survivor keeps the target's array index).
   */
  changeUnit: (
    product_id: string,
    from_unit_level: number,
    toUnit: {
      unit_level: 0 | 1 | 2
      unit_name: string
      unit_price_cfa: number
      cost_price_cfa: number
      conversion_to_base: number
    },
  ) => void
  setCustomer: (customer: Customer | null) => void
  setWalkIn: (walkIn: boolean) => void
  setDiscountType: (type: 'flat' | 'percent' | null) => void
  setDiscountValue: (value: number) => void
  setCashTendered: (amount: number) => void
  setOverrideTotalCfa: (amount: number | null) => void
  setPriceExceptionReason: (reason: string) => void
  setDocumentDateYmd: (ymd: string) => void
  setExternalRef: (ref: string) => void
  setPendingProformaId: (id: string | null) => void
  clearCart: () => void
  restoreCart: (items: CartItem[]) => void

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
   * Preserves depot context.
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
  overrideTotalCfa: null,
  priceExceptionReason: '',
  documentDateYmd: '',
  externalRef: '',
  pendingProformaId: null,
  idempotencyKey: null,
  isSubmitting: false,
  saleResult: null,
  totals: emptyTotals,

  addItem: (newItem) => {
    const { items, discountType, discountValue, cashTendered, overrideTotalCfa } = get()
    const existingIdx = items.findIndex(
      (i) => i.product_id === newItem.product_id && i.unit_level === newItem.unit_level,
    )
    const incomingDiscount = Math.max(0, Math.round(newItem.line_discount_cfa ?? 0))

    let updatedItems: CartItem[]
    if (existingIdx >= 0) {
      // Merge quantities for same product+unit (prevents accidental duplicate lines)
      updatedItems = items.map((item, idx) => {
        if (idx !== existingIdx) return item
        const qty = item.quantity_in_unit + newItem.quantity_in_unit
        return {
          ...item,
          quantity_in_unit: qty,
          line_total_cfa: cartLineTotalCfa(qty, item.unit_price_cfa, item.line_discount_cfa),
        }
      })
    } else {
      const qty = newItem.quantity_in_unit
      updatedItems = [
        ...items,
        {
          ...newItem,
          line_discount_cfa: incomingDiscount,
          quantity_in_unit: qty,
          line_total_cfa: cartLineTotalCfa(qty, newItem.unit_price_cfa, incomingDiscount),
        },
      ]
    }

    set({
      items: updatedItems,
      totals: computeTotals(updatedItems, discountType, discountValue, cashTendered, overrideTotalCfa),
    })
  },

  removeItem: (product_id, unit_level) => {
    const { discountType, discountValue, cashTendered, overrideTotalCfa } = get()
    const updatedItems = get().items.filter(
      (i) => !(i.product_id === product_id && i.unit_level === unit_level),
    )
    set({
      items: updatedItems,
      totals: computeTotals(updatedItems, discountType, discountValue, cashTendered, overrideTotalCfa),
    })
  },

  updateQuantity: (product_id, unit_level, qty) => {
    const { discountType, discountValue, cashTendered, overrideTotalCfa } = get()
    if (qty <= 0) {
      get().removeItem(product_id, unit_level)
      return
    }
    const updatedItems = get().items.map((item) => {
      if (item.product_id !== product_id || item.unit_level !== unit_level) return item
      return {
        ...item,
        quantity_in_unit: qty,
        line_total_cfa: cartLineTotalCfa(qty, item.unit_price_cfa, item.line_discount_cfa),
      }
    })
    set({
      items: updatedItems,
      totals: computeTotals(updatedItems, discountType, discountValue, cashTendered, overrideTotalCfa),
    })
  },

  updateLinePrice: (product_id, unit_level, unit_price_cfa) => {
    const { discountType, discountValue, cashTendered, overrideTotalCfa } = get()
    const price = Math.max(0, Math.round(unit_price_cfa))
    const updatedItems = get().items.map((item) => {
      if (item.product_id !== product_id || item.unit_level !== unit_level) return item
      const discount = Math.min(item.line_discount_cfa, cartLineTotalCfa(item.quantity_in_unit, price, 0))
      return {
        ...item,
        unit_price_cfa: price,
        line_discount_cfa: discount,
        line_total_cfa: cartLineTotalCfa(item.quantity_in_unit, price, discount),
      }
    })
    set({
      items: updatedItems,
      totals: computeTotals(updatedItems, discountType, discountValue, cashTendered, overrideTotalCfa),
    })
  },

  updateLineDiscount: (product_id, unit_level, line_discount_cfa) => {
    const { discountType, discountValue, cashTendered, overrideTotalCfa } = get()
    const updatedItems = get().items.map((item) => {
      if (item.product_id !== product_id || item.unit_level !== unit_level) return item
      const gross = cartLineTotalCfa(item.quantity_in_unit, item.unit_price_cfa, 0)
      const discount = Math.min(gross, Math.max(0, Math.round(line_discount_cfa)))
      return {
        ...item,
        line_discount_cfa: discount,
        line_total_cfa: cartLineTotalCfa(item.quantity_in_unit, item.unit_price_cfa, discount),
      }
    })
    set({
      items: updatedItems,
      totals: computeTotals(updatedItems, discountType, discountValue, cashTendered, overrideTotalCfa),
    })
  },

  changeUnit: (product_id, from_unit_level, toUnit) => {
    const { items, discountType, discountValue, cashTendered, overrideTotalCfa } = get()
    const sourceIdx = items.findIndex(
      (i) => i.product_id === product_id && i.unit_level === from_unit_level,
    )
    if (sourceIdx < 0) return
    if (from_unit_level === toUnit.unit_level) return

    const source = items[sourceIdx]
    const qty = source.quantity_in_unit
    const targetIdx = items.findIndex(
      (i) => i.product_id === product_id && i.unit_level === toUnit.unit_level,
    )

    let updatedItems: CartItem[]
    if (targetIdx >= 0) {
      const target = items[targetIdx]
      const mergedQty = target.quantity_in_unit + qty
      const mergedDiscount = Math.min(
        (source.line_discount_cfa ?? 0) + (target.line_discount_cfa ?? 0),
        cartLineTotalCfa(mergedQty, toUnit.unit_price_cfa, 0),
      )
      updatedItems = items
        .map((item, idx) => {
          if (idx !== targetIdx) return item
          return {
            ...item,
            unit_level: toUnit.unit_level,
            unit_name: toUnit.unit_name,
            unit_price_cfa: toUnit.unit_price_cfa,
            cost_price_cfa: toUnit.cost_price_cfa,
            conversion_to_base: toUnit.conversion_to_base,
            quantity_in_unit: mergedQty,
            line_discount_cfa: mergedDiscount,
            line_total_cfa: cartLineTotalCfa(mergedQty, toUnit.unit_price_cfa, mergedDiscount),
          }
        })
        .filter((_, idx) => idx !== sourceIdx)
    } else {
      const keptDiscount = Math.min(
        source.line_discount_cfa ?? 0,
        cartLineTotalCfa(qty, toUnit.unit_price_cfa, 0),
      )
      updatedItems = items.map((item, idx) => {
        if (idx !== sourceIdx) return item
        return {
          ...item,
          product_id: source.product_id,
          product_name: source.product_name,
          product_photo_url: source.product_photo_url,
          unit_level: toUnit.unit_level,
          unit_name: toUnit.unit_name,
          unit_price_cfa: toUnit.unit_price_cfa,
          cost_price_cfa: toUnit.cost_price_cfa,
          conversion_to_base: toUnit.conversion_to_base,
          quantity_in_unit: qty,
          line_discount_cfa: keptDiscount,
          line_total_cfa: cartLineTotalCfa(qty, toUnit.unit_price_cfa, keptDiscount),
        }
      })
    }

    set({
      items: updatedItems,
      totals: computeTotals(updatedItems, discountType, discountValue, cashTendered, overrideTotalCfa),
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
    const { items, discountValue, cashTendered, overrideTotalCfa } = get()
    // Reset value when changing type to prevent stale values
    const newValue = type === null ? 0 : discountValue
    set({
      discountType: type,
      discountValue: newValue,
      totals: computeTotals(items, type, newValue, cashTendered, overrideTotalCfa),
    })
  },

  setDiscountValue: (value) => {
    const { items, discountType, cashTendered, overrideTotalCfa } = get()
    set({
      discountValue: value,
      totals: computeTotals(items, discountType, value, cashTendered, overrideTotalCfa),
    })
  },

  setCashTendered: (amount) => {
    const { items, discountType, discountValue, overrideTotalCfa } = get()
    set({
      cashTendered: amount,
      totals: computeTotals(items, discountType, discountValue, amount, overrideTotalCfa),
    })
  },

  setOverrideTotalCfa: (amount) => {
    const { items, discountType, discountValue, cashTendered } = get()
    const override =
      amount == null || !Number.isFinite(amount) ? null : amount
    set({
      overrideTotalCfa: override,
      totals: computeTotals(items, discountType, discountValue, cashTendered, override),
    })
  },

  setPriceExceptionReason: (reason) => set({ priceExceptionReason: reason }),
  setDocumentDateYmd: (ymd) => set({ documentDateYmd: ymd }),
  setExternalRef: (ref) => set({ externalRef: ref }),
  setPendingProformaId: (id) => set({ pendingProformaId: id }),

  clearCart: () => {
    const { discountType, discountValue, cashTendered, overrideTotalCfa } = get()
    set({
      items: [],
      totals: computeTotals([], discountType, discountValue, cashTendered, overrideTotalCfa),
    })
  },

  restoreCart: (items) => {
    const { discountType, discountValue, cashTendered, overrideTotalCfa } = get()
    const normalized = items.map((item) => {
      const line_discount_cfa = Math.max(0, Math.round(Number(item.line_discount_cfa ?? 0)))
      return {
        ...item,
        line_discount_cfa,
        line_total_cfa: cartLineTotalCfa(
          item.quantity_in_unit,
          item.unit_price_cfa,
          line_discount_cfa,
        ),
      }
    })
    set({
      items: normalized,
      totals: computeTotals(normalized, discountType, discountValue, cashTendered, overrideTotalCfa),
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
      overrideTotalCfa: null,
      priceExceptionReason: '',
      documentDateYmd: '',
      externalRef: '',
      pendingProformaId: null,
      idempotencyKey: null,
      isSubmitting: false,
      saleResult: null,
      totals: emptyTotals,
    }),
}))
