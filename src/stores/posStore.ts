import { create } from 'zustand'
import type { CartItem, CheckoutTotals } from '@/types'
import type { Customer } from '@/types/database'

// ─────────────────────────────────────────────────────────────────
// Checkout totals helper (display preview only)
// ─────────────────────────────────────────────────────────────────

/**
 * Compute checkout totals from cart state.
 *
 * CRITICAL: These are CLIENT-SIDE PREVIEW CALCULATIONS ONLY.
 * They are shown to the cashier for visual feedback.
 * The authoritative amounts are computed server-side inside the
 * create_sale PostgreSQL transaction and returned in the response.
 * Never use these values as authoritative financial state.
 */
function computeTotals(
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

  // ─── Computed display totals (see warning above) ───
  totals: CheckoutTotals

  // Actions
  addItem: (item: Omit<CartItem, 'line_total_cfa'>) => void
  removeItem: (product_id: string, unit_level: number) => void
  updateQuantity: (product_id: string, unit_level: number, qty: number) => void
  setCustomer: (customer: Customer | null) => void
  setWalkIn: (walkIn: boolean) => void
  setDiscountType: (type: 'flat' | 'percent' | null) => void
  setDiscountValue: (value: number) => void
  setCashTendered: (amount: number) => void
  clearCart: () => void
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
 * After completing or abandoning a sale, call clearCart().
 */
export const usePOSStore = create<POSState>()((set, get) => ({
  items: [],
  customer: null,
  isWalkIn: true,
  discountType: null,
  discountValue: 0,
  cashTendered: 0,
  totals: emptyTotals,

  addItem: (newItem) => {
    const { items, discountType, discountValue, cashTendered } = get()
    const existingIdx = items.findIndex(
      (i) => i.product_id === newItem.product_id && i.unit_level === newItem.unit_level,
    )

    let updatedItems: CartItem[]
    if (existingIdx >= 0) {
      // Increment quantity of existing line
      updatedItems = items.map((item, idx) => {
        if (idx !== existingIdx) return item
        const qty = item.quantity_in_unit + 1
        return {
          ...item,
          quantity_in_unit: qty,
          line_total_cfa: qty * item.unit_price_cfa,
        }
      })
    } else {
      // Add new line
      const qty = 1
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
    set({
      discountType: type,
      totals: computeTotals(items, type, discountValue, cashTendered),
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

  clearCart: () =>
    set({
      items: [],
      customer: null,
      isWalkIn: true,
      discountType: null,
      discountValue: 0,
      cashTendered: 0,
      totals: emptyTotals,
    }),
}))
