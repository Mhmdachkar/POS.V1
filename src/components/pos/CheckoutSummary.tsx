import { MoneyDisplay } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { POS } from '@/lib/bilingual/pos'
import { bi, bilingualAriaLabel, bilingualPlain } from '@/lib/bilingual/types'
import { isOverrideOutOfRange } from '@/lib/zeroTotalSale'
import { useShallow } from 'zustand/react/shallow'
import { effectiveFinalTotal, usePOSStore } from '@/stores/posStore'
import { useAuthStore } from '@/stores/authStore'

export function CheckoutSummary() {
  const staff = useAuthStore((s) => s.staff)
  const isAdmin = staff?.role === 'admin'

  const { discountType, discountValue, totals, overrideTotalCfa, setOverrideTotalCfa } =
    usePOSStore(useShallow((s) => ({
      discountType:         s.discountType,
      discountValue:        s.discountValue,
      totals:               s.totals,
      overrideTotalCfa:     s.overrideTotalCfa,
      setOverrideTotalCfa:  s.setOverrideTotalCfa,
    })))

  // Store payment fields already use the effective final total.
  const effectiveTotal = effectiveFinalTotal(totals.total_cfa, overrideTotalCfa)
  const isChangeGiven = totals.change_given_cfa > 0
  const isBalanceAdded = totals.balance_added_cfa > 0
  const hasOverride = isAdmin && overrideTotalCfa != null
  const overrideInvalid = isOverrideOutOfRange(overrideTotalCfa, totals.total_cfa)

  const discountLabel =
    discountType === 'percent'
      ? bi(`Remise (${discountValue} %)`, `Discount (${discountValue}%)`)
      : POS.discount

  return (
    <div className="space-y-0.5">
      {discountType && (
        <>
          <div className="flex items-center justify-between">
            <BilingualText {...POS.subtotal} variant="caption" />
            <MoneyDisplay amount={totals.subtotal_cfa} size="small" />
          </div>
          <div className="flex items-center justify-between">
            <BilingualText {...discountLabel} variant="caption" />
            <span className="text-xs text-success-foreground">
              − <MoneyDisplay amount={totals.discount_amount_cfa} size="small" />
            </span>
          </div>
        </>
      )}

      {/* Calculated total (show struck-through when override active) */}
      {hasOverride ? (
        <div className="flex items-center justify-between py-0.5">
          <BilingualText {...POS.calculatedTotal} variant="caption" className="text-text-muted" />
          <span className="line-through text-text-muted tabular-nums text-sm">
            <MoneyDisplay amount={totals.total_cfa} size="small" />
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between py-0.5">
          <BilingualText
            {...POS.total}
            variant="caption"
            frClassName="text-xs font-semibold uppercase tracking-wide text-text-secondary"
          />
          <span data-testid="checkout-total" aria-live="polite">
            <MoneyDisplay amount={totals.total_cfa} size="large" />
          </span>
        </div>
      )}

      {/* Admin override row */}
      {isAdmin && (
        <div className="flex items-center gap-2 py-0.5 border border-warning/30 bg-warning-bg rounded-md px-2 my-1">
          <BilingualText {...POS.modifyTotal} variant="caption" className="text-warning-foreground flex-shrink-0" />
          <input
            type="number"
            min={1}
            max={totals.total_cfa}
            step="any"
            placeholder={String(totals.total_cfa)}
            value={overrideTotalCfa != null ? overrideTotalCfa : ''}
            onChange={(e) => {
              const v = e.target.value.trim()
              setOverrideTotalCfa(v === '' ? null : Number(v))
            }}
            className={`flex-1 h-7 px-2 rounded text-sm tabular-nums bg-surface border focus:outline-none focus:ring-1 text-right ${
              overrideInvalid
                ? 'border-danger focus:ring-danger/40'
                : 'border-warning/30 focus:ring-warning/40'
            }`}
            aria-label={bilingualAriaLabel(POS.overrideTotalAria)}
            aria-invalid={overrideInvalid || undefined}
          />
        </div>
      )}
      {isAdmin && overrideInvalid && (
        <p role="status" className="text-xs text-danger-foreground">
          {bilingualPlain(POS.overrideOutOfRange)}
        </p>
      )}

      {/* Adjusted / final total (shown when override active) */}
      {hasOverride && (
        <div className="flex items-center justify-between py-0.5">
          <BilingualText
            {...POS.adjustedTotal}
            variant="caption"
            frClassName="text-xs font-semibold uppercase tracking-wide text-warning-foreground"
          />
          <span data-testid="checkout-total" aria-live="polite">
            <MoneyDisplay amount={effectiveTotal} size="large" />
          </span>
        </div>
      )}

      {/* Change / balance use store fields derived from effective final total */}
      {isChangeGiven && (
        <div
          data-testid="checkout-result"
          className="flex items-center justify-between"
          aria-live="polite"
        >
          <BilingualText
            {...POS.change}
            variant="caption"
            frClassName="text-xs font-semibold uppercase tracking-wide text-success-foreground"
          />
          <MoneyDisplay
            amount={totals.change_given_cfa}
            size="medium"
            className="text-success-foreground"
          />
        </div>
      )}

      {!isChangeGiven && isBalanceAdded && (
        <div
          data-testid="checkout-result"
          className="flex items-center justify-between"
          aria-live="polite"
        >
          <BilingualText
            {...POS.onAccount}
            variant="caption"
            frClassName="text-xs font-semibold uppercase tracking-wide text-danger-foreground"
          />
          <MoneyDisplay amount={totals.balance_added_cfa} size="medium" danger />
        </div>
      )}
    </div>
  )
}
