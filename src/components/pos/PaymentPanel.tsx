/**
 * PaymentPanel — Customer, discount, cash, summary, and complete sale.
 *
 * Financial preview only — all authoritative values come from the server.
 * The server's response replaces the preview after a successful sale.
 *
 * An open shift is required (B8). Sales attach to the depot's open shift.
 * Admin can supply p_override_total_cfa; Cashier cannot (server-enforced).
 */

import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { useShallow } from 'zustand/react/shallow'
import { usePOSStore } from '@/stores/posStore'
import { rpc } from '@/lib/rpc'
import { parseError } from '@/lib/errors'
import { usePosCatalogStock } from '@/hooks/usePosCatalogStock'
import { cartExceedsKnownStock } from '@/lib/posCartStock'
import { useAuthStore } from '@/stores/authStore'
import { useQueryClient } from '@tanstack/react-query'
import { shouldCompleteSaleOnEnter } from '@/lib/posEnterComplete'
import { invalidateAfterSaleSettled, refreshPosCatalogStock } from '@/lib/cacheInvalidation'
import { wakeLocalPrintAgent } from '@/lib/printAgentWake'
import { BilingualText } from '@/components/ui/BilingualText'
import { POS } from '@/lib/bilingual/pos'
import { toastErrorBi, toastErrorFromCode } from '@/lib/bilingual/toast'
import { CustomerChip } from './CustomerChip'
import { DiscountRow } from './DiscountRow'
import { CashSection } from './CashSection'
import { CheckoutSummary } from './CheckoutSummary'
import { CommitButton } from './CommitButton'
import { authorizedOpenShifts, useOpenShifts } from '@/hooks/useShifts'
import { resolveRequiredShiftId } from '@/lib/posShiftContext'
import { SHIFT_COPY } from '@/lib/bilingual/shift'

interface PaymentPanelProps {
  depotId: string | null
  className?: string
}

export function PaymentPanel({ depotId, className }: PaymentPanelProps) {
  const queryClient = useQueryClient()
  const inFlight = useRef(false)
  const staff = useAuthStore((s) => s.staff)
  const { getAvailablePieces } = usePosCatalogStock()
  const { data: openShifts, isLoading: openShiftsLoading } = useOpenShifts()
  const processingShiftId = resolveRequiredShiftId(
    null,
    depotId,
    staff?.id,
    authorizedOpenShifts(staff, openShifts),
  )
  const hasOpenShift = !!processingShiftId
  const shiftGateReady = !openShiftsLoading

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
    overrideTotalCfa,
    ensureIdempotencyKey,
    setSubmitting,
    setSaleResult,
  } = usePOSStore(useShallow((s) => ({
    items:                s.items,
    customer:             s.customer,
    isWalkIn:             s.isWalkIn,
    discountType:         s.discountType,
    discountValue:        s.discountValue,
    cashTendered:         s.cashTendered,
    totals:               s.totals,
    idempotencyKey:       s.idempotencyKey,
    isSubmitting:         s.isSubmitting,
    overrideTotalCfa:     s.overrideTotalCfa,
    ensureIdempotencyKey: s.ensureIdempotencyKey,
    setSubmitting:        s.setSubmitting,
    setSaleResult:        s.setSaleResult,
  })))
  void idempotencyKey

  const isCartEmpty = items.length === 0
  const hasDepot = !!depotId
  const showCheckout = !isCartEmpty && hasDepot
  const isCreditSale = totals.balance_added_cfa > 0
  const isCreditWithoutCustomer = isCreditSale && isWalkIn
  const isDiscountInvalid =
    discountType === 'flat'
      ? discountValue < 0 || discountValue > totals.subtotal_cfa
      : discountType === 'percent'
        ? discountValue < 0 || discountValue > 100
        : false
  const isCashNegative = cashTendered < 0
  const exceedsKnownStock = cartExceedsKnownStock(items, getAvailablePieces)

  const canSubmit =
    showCheckout &&
    !isCreditWithoutCustomer &&
    !isDiscountInvalid &&
    !isCashNegative &&
    !isSubmitting &&
    !exceedsKnownStock &&
    shiftGateReady &&
    hasOpenShift

  const handleCompleteSale = useCallback(async () => {
    if (inFlight.current) return
    if (!canSubmit) {
      if (isCartEmpty) toastErrorBi(POS.addProductsBeforeSale)
      if (isCreditWithoutCustomer) toastErrorBi(POS.creditNeedsCustomer)
      if (exceedsKnownStock) toastErrorBi(POS.cartExceedsStock)
      if (shiftGateReady && !hasOpenShift) toastErrorBi(SHIFT_COPY.openShiftRequired)
      return
    }

    inFlight.current = true
    const key = ensureIdempotencyKey()

    setSubmitting(true)

    try {
      // Admin can supply override total; cashier cannot (server enforces)
      const isAdmin = staff?.role === 'admin'
      const result = await rpc.completeSale({
        p_depot_id:            depotId,
        p_customer_id:         customer?.id ?? null,
        p_cart_items:          items.map((item) => ({
          product_id:       item.product_id,
          unit_level:       item.unit_level,
          quantity_in_unit: item.quantity_in_unit,
        })),
        p_amount_tendered_cfa: cashTendered,
        p_display_currency:    'CFA',
        p_discount_type:       discountType,
        p_discount_value:      discountType ? discountValue : null,
        p_shift_id:            processingShiftId,
        p_idempotency_key:     key,
        // Admin always sends the 10th arg (null = no override). Cashier omits it.
        ...(isAdmin ? { p_override_total_cfa: overrideTotalCfa } : {}),
      })

      if (result.error) {
        const parsed = parseError(result.error)
        toastErrorFromCode(parsed.code, parsed.details)
        if (parsed.code === 'INSUFFICIENT_STOCK') {
          refreshPosCatalogStock(queryClient)
        }
        return
      }

      setSaleResult(result.data)

      invalidateAfterSaleSettled(queryClient, {
        saleId: result.data?.sale_id,
        customerId: customer?.id,
        shiftId: processingShiftId,
      })
      wakeLocalPrintAgent()
    } finally {
      setSubmitting(false)
      inFlight.current = false
    }
  }, [
    canSubmit, isCartEmpty, isCreditWithoutCustomer, exceedsKnownStock,
    ensureIdempotencyKey, setSubmitting, setSaleResult,
    isWalkIn, customer, items, cashTendered, discountType, discountValue,
    depotId, overrideTotalCfa, staff?.role, queryClient,
    processingShiftId, shiftGateReady, hasOpenShift,
  ])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!shouldCompleteSaleOnEnter(event, canSubmit)) return
      event.preventDefault()
      void handleCompleteSale()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [canSubmit, handleCompleteSale])

  const creditWarningId = isCreditWithoutCustomer ? 'pos-credit-warning' : undefined
  const stockMessageId = exceedsKnownStock ? 'pos-stock-warning' : undefined
  const describedBy = [creditWarningId, stockMessageId].filter(Boolean).join(' ') || undefined

  return (
    <div
      data-testid="payment-panel"
      className={cn(
        'flex-shrink-0 flex flex-col gap-1.5 px-4 py-2',
        className,
      )}
    >
      {showCheckout && (
        <>
          <CustomerChip />
          <DiscountRow />
          <CashSection />
          <CheckoutSummary />
        </>
      )}

      {!showCheckout && (
        <BilingualText {...POS.addProductsBegin} variant="caption" as="p" />
      )}

      {showCheckout && isWalkIn && totals.balance_added_cfa > 0 && (
        <p id="pos-credit-warning" className="text-xs text-warning-foreground">
          <BilingualText {...POS.creditNeedsCustomer} variant="caption" />
        </p>
      )}

      {exceedsKnownStock && (
        <p id="pos-stock-warning" role="status" className="text-xs text-warning-foreground">
          <BilingualText {...POS.cartExceedsStock} variant="caption" />
        </p>
      )}

      {showCheckout && shiftGateReady && !hasOpenShift && (
        <p id="pos-shift-warning" role="status" className="text-xs text-warning-foreground">
          <BilingualText {...SHIFT_COPY.openShiftRequired} variant="caption" />
        </p>
      )}

      <CommitButton
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
        onComplete={handleCompleteSale}
        describedBy={describedBy}
      />
    </div>
  )
}
