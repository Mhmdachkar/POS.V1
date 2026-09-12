/**
 * CheckoutPanel — Discount, cash tendered, totals, and submit.
 *
 * Financial preview only — all authoritative values come from the server.
 * The server's response replaces the preview after a successful sale.
 *
 * Layout (from top to bottom):
 *   CustomerSelector
 *   Discount controls
 *   Cash tendered input
 *   ────────────────
 *   Subtotal
 *   Discount
 *   Total
 *   ────────────────
 *   Cash received
 *   Amount applied
 *   Change
 *   Balance added
 *   ────────────────
 *   [Complete Sale]
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { LoadingButton } from '@/components/ui'
import { formatCFA, parseCFAInput } from '@/lib/formatters'
import { CustomerSelector } from './CustomerSelector'
import { usePOSStore } from '@/stores/posStore'
import { rpc } from '@/lib/rpc'
import { getErrorMessage } from '@/lib/errors'
import { useQueryClient } from '@tanstack/react-query'
import { productKeys } from '@/hooks/useProducts'
import { customerKeys } from '@/hooks/useCustomers'
import { saleKeys } from '@/hooks/useSales'

// ─────────────────────────────────────────────────────────────────
// Financial row
// ─────────────────────────────────────────────────────────────────

function FinancialRow({
  label,
  value,
  className,
  bold,
  large,
}: {
  label: string
  value: number
  className?: string
  bold?: boolean
  large?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-1', className)}>
      <span className={cn('text-sm', bold ? 'font-semibold text-text-primary' : 'text-text-secondary')}>
        {label}
      </span>
      <span
        className={cn(
          'font-semibold tabular-nums',
          large ? 'text-base text-text-primary' : 'text-sm text-text-primary',
          bold && 'text-text-primary',
        )}
      >
        {formatCFA(value)}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// DiscountControl
// ─────────────────────────────────────────────────────────────────

function DiscountControl() {
  const { discountType, discountValue, totals, setDiscountType, setDiscountValue } = usePOSStore(
    (s) => ({
      discountType: s.discountType,
      discountValue: s.discountValue,
      totals: s.totals,
      setDiscountType: s.setDiscountType,
      setDiscountValue: s.setDiscountValue,
    }),
  )

  const validateAndSet = (raw: string) => {
    const num = parseCFAInput(raw)
    if (isNaN(num) || num < 0) return
    setDiscountValue(num)
  }

  // UI validation (server is authoritative)
  const isDiscountInvalid =
    discountType === 'flat'
      ? discountValue < 0 || discountValue > totals.subtotal_cfa
      : discountType === 'percent'
        ? discountValue < 0 || discountValue > 100
        : false

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
        Discount
      </label>
      <div className="flex gap-1.5">
        {/* Type selector */}
        <select
          value={discountType ?? ''}
          onChange={(e) => setDiscountType((e.target.value || null) as typeof discountType)}
          className={cn(
            'h-9 px-2 rounded-md border border-border bg-surface text-sm text-text-primary',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
          )}
          aria-label="Discount type"
        >
          <option value="">None</option>
          <option value="flat">Flat (CFA)</option>
          <option value="percent">Percent (%)</option>
        </select>

        {/* Value input */}
        {discountType && (
          <input
            type="number"
            min={0}
            max={discountType === 'percent' ? 100 : undefined}
            step={discountType === 'percent' ? 0.1 : 1}
            value={discountValue || ''}
            onChange={(e) => validateAndSet(e.target.value)}
            placeholder={discountType === 'flat' ? 'Amount CFA' : '0–100'}
            className={cn(
              'flex-1 h-9 px-3 rounded-md border bg-surface text-sm text-text-primary',
              'focus:outline-none focus:ring-2 focus:ring-primary/20',
              isDiscountInvalid
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border focus:border-primary',
            )}
            aria-label="Discount value"
          />
        )}
      </div>
      {isDiscountInvalid && (
        <p className="text-xs text-danger">
          {discountType === 'flat'
            ? 'Flat discount must be between 0 and subtotal'
            : 'Percentage must be between 0 and 100'}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CashInput
// ─────────────────────────────────────────────────────────────────

function CashInput() {
  const { cashTendered, setCashTendered } = usePOSStore((s) => ({
    cashTendered: s.cashTendered,
    setCashTendered: s.setCashTendered,
  }))

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
        Cash Received
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary pointer-events-none">
          CFA
        </span>
        <input
          type="number"
          min={0}
          step={100}
          value={cashTendered || ''}
          onChange={(e) => {
            const val = parseCFAInput(e.target.value)
            setCashTendered(isNaN(val) || val < 0 ? 0 : val)
          }}
          placeholder="0"
          className={cn(
            'w-full h-10 pl-12 pr-3 rounded-md border border-border bg-surface',
            'text-sm font-semibold text-text-primary',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
          )}
          aria-label="Cash received from customer"
        />
      </div>
      {cashTendered < 0 && (
        <p className="text-xs text-danger">Cash amount cannot be negative</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CheckoutPanel (main export)
// ─────────────────────────────────────────────────────────────────

interface CheckoutPanelProps {
  depotId: string | null
  shiftId: string | null
}

export function CheckoutPanel({ depotId, shiftId }: CheckoutPanelProps) {
  const queryClient = useQueryClient()

  const {
    items,
    customer,
    isWalkIn,
    discountType,
    discountValue,
    cashTendered,
    totals,
    idempotencyKey,
    isSubmitting,
    ensureIdempotencyKey,
    setSubmitting,
    setSaleResult,
  } = usePOSStore((s) => ({
    items:               s.items,
    customer:            s.customer,
    isWalkIn:            s.isWalkIn,
    discountType:        s.discountType,
    discountValue:       s.discountValue,
    cashTendered:        s.cashTendered,
    totals:              s.totals,
    idempotencyKey:      s.idempotencyKey,
    isSubmitting:        s.isSubmitting,
    ensureIdempotencyKey:s.ensureIdempotencyKey,
    setSubmitting:       s.setSubmitting,
    setSaleResult:       s.setSaleResult,
  }))

  // ── Local UI validation (server is authoritative) ──────────────
  const isCartEmpty = items.length === 0
  const isCreditSale = totals.balance_added_cfa > 0
  const isCreditWithoutCustomer = isCreditSale && isWalkIn
  const isDiscountInvalid =
    discountType === 'flat'
      ? discountValue < 0 || discountValue > totals.subtotal_cfa
      : discountType === 'percent'
        ? discountValue < 0 || discountValue > 100
        : false
  const isCashNegative = cashTendered < 0

  const canSubmit =
    !isCartEmpty &&
    !isCreditWithoutCustomer &&
    !isDiscountInvalid &&
    !isCashNegative &&
    !isSubmitting

  // ── Sale submission ────────────────────────────────────────────
  const handleCompleteSale = useCallback(async () => {
    if (!canSubmit) {
      if (isCartEmpty) toast.error('Add products to the cart before completing the sale.')
      if (isCreditWithoutCustomer) toast.error('Select a customer for credit sales.')
      return
    }

    // Ensure idempotency key — same key reused on retries
    const key = ensureIdempotencyKey()

    setSubmitting(true)

    try {
      const result = await rpc.completeSale({
        p_depot_id:            isWalkIn || !depotId ? depotId ?? undefined : depotId,
        p_customer_id:         customer?.id ?? null,
        p_cart_items:          items.map((item) => ({
          product_id:    item.product_id,
          unit_level:    item.unit_level,
          quantity_in_unit: item.quantity_in_unit,
        })),
        p_amount_tendered_cfa: cashTendered,
        p_display_currency:    'CFA',
        p_discount_type:       discountType ?? undefined,
        p_discount_value:      discountType ? discountValue : undefined,
        p_shift_id:            shiftId ?? null,
        p_idempotency_key:     key,
      })

      if (result.error) {
        const msg = getErrorMessage(result.error.code)
        toast.error(msg)
        // Do NOT clear idempotencyKey — allow retry with same key
        return
      }

      // ── Success ───────────────────────────────────────────────
      setSaleResult(result.data)

      // Invalidate related caches
      queryClient.invalidateQueries({ queryKey: productKeys.all })
      queryClient.invalidateQueries({ queryKey: saleKeys.lists() })
      if (customer?.id) {
        queryClient.invalidateQueries({ queryKey: customerKeys.detail(customer.id) })
        queryClient.invalidateQueries({ queryKey: customerKeys.all })
      }
    } finally {
      setSubmitting(false)
    }
  }, [
    canSubmit, isCartEmpty, isCreditWithoutCustomer,
    ensureIdempotencyKey, setSubmitting, setSaleResult,
    isWalkIn, customer, items, cashTendered, discountType, discountValue,
    depotId, shiftId, queryClient,
  ])

  // ── Keyboard shortcut: Enter on the panel to submit ──────────
  // (Only if focused inside the checkout panel and form is ready)

  const isBalanceAdded = totals.balance_added_cfa > 0
  const isChangeGiven = totals.change_given_cfa > 0

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Customer */}
      <CustomerSelector />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Discount */}
      <DiscountControl />

      {/* Cash input */}
      <CashInput />

      {/* Credit sale warning */}
      {isCreditWithoutCustomer && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-danger-bg border border-danger/20">
          <span className="text-xs text-danger-foreground leading-relaxed">
            A customer must be selected for credit sales (cash received is less than total).
          </span>
        </div>
      )}

      {/* Financial summary */}
      <div className="rounded-lg bg-surface-muted border border-border p-3 space-y-0.5">
        <FinancialRow label="Subtotal" value={totals.subtotal_cfa} />
        {discountType && (
          <FinancialRow
            label={discountType === 'flat' ? 'Discount' : `Discount (${discountValue}%)`}
            value={-totals.discount_amount_cfa}
            className="text-success-foreground"
          />
        )}
        <div className="border-t border-border my-1.5" />
        <FinancialRow label="Total" value={totals.total_cfa} bold large />
        <div className="border-t border-border my-1.5" />
        <FinancialRow label="Cash received" value={totals.amount_tendered_cfa} />
        <FinancialRow label="Amount applied" value={totals.amount_applied_cfa} />
        {isChangeGiven && (
          <FinancialRow
            label="Change"
            value={totals.change_given_cfa}
            className="text-success-foreground font-medium"
          />
        )}
        {isBalanceAdded && (
          <FinancialRow
            label="Balance added"
            value={totals.balance_added_cfa}
            className="text-danger-foreground font-medium"
          />
        )}
      </div>

      {/* Submit button */}
      <LoadingButton
        variant="primary"
        size="lg"
        loading={isSubmitting}
        disabled={!canSubmit}
        onClick={handleCompleteSale}
        className="w-full"
        aria-label="Complete sale"
      >
        {isSubmitting ? 'Processing…' : 'Complete Sale →'}
      </LoadingButton>
    </div>
  )
}
