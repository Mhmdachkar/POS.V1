/**
 * ReturnModal — Process a partial or full sale return.
 *
 * Workflow:
 *   1. Show returnable items (original qty - already returned qty)
 *   2. Cashier selects return quantities per item (UI blocks over-return)
 *   3. Cashier may lower the refund below the full value of those units
 *   4. Stock still returns to the depot for the chosen quantity
 *   5. Show refund preview: total, balance reduction, cash (SQL C1 split)
 *   6. Submit via rpc.processReturn() with qty + optional refund_amount_cfa
 *
 * Critical requirements:
 *   - NEVER sends quantity_pieces — server derives it from frozen sale data
 *   - Sends: { sale_item_id, quantity_in_unit, refund_amount_cfa }
 *   - Custom refund is capped at the computed value for the selected qty
 *   - p_cash_refund_cfa is the helper-computed cash split, not a cashier override
 */

import { useState, useMemo, useRef } from 'react'
import { toastSuccessBi, toastErrorFromCode } from '@/lib/bilingual/toast'
import { SALES } from '@/lib/bilingual/sales'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Modal, Button, LoadingButton, Textarea } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { COMMON } from '@/lib/bilingual/common'
import { BiButtonStack, BiModalTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { t, bilingualPlain } from '@/lib/bilingual/types'
import { formatCFA, formatThousandsInput, parseCFAInput } from '@/lib/formatters'
import { rpc } from '@/lib/rpc'
import {
  computeReturnLineRefund,
  computeReturnRefundPreview,
  lineRefundBasisCfa,
  remainingSaleRefundPool,
  resolveLineRefund,
  saleRefundPoolCfa,
  roundCfa2,
} from '@/lib/returnRefundPreview'
import { authorizedOpenShifts, clearStalePosShift, useOpenShifts } from '@/hooks/useShifts'
import { resolveRequiredShiftId } from '@/lib/posShiftContext'
import { useAuthStore } from '@/stores/authStore'
import type { SaleDetailData, SaleItemDetail } from '@/hooks/useSales'
import {
  formatSoldQuantity,
  formatSoldQuantityDetail,
  resolvedSaleUnitName,
} from '@/lib/saleQuantityDisplay'
import { SaleUnitBadge } from '@/components/sales/SaleUnitBadge'

// ─────────────────────────────────────────────────────────────────
// Returnability helpers
// ─────────────────────────────────────────────────────────────────

interface ReturnableItem {
  item: SaleItemDetail
  alreadyReturned: number   // qty_in_unit already returned across all returns
  alreadyRefunded: number   // refund_amount_cfa already returned for this sale_item
  returnable: number        // original - alreadyReturned
  selected: number          // what the cashier is returning now
  /** null = follow computed full value; string = cashier-edited CFA input */
  refundDraft: string | null
}

function priorReturnTotals(
  saleItemId: string,
  returns: SaleDetailData['returns'],
): { alreadyReturned: number; alreadyRefunded: number } {
  let alreadyReturned = 0
  let alreadyRefunded = 0
  for (const ret of returns) {
    for (const ri of ret.sale_return_items) {
      if (ri.sale_item_id !== saleItemId) continue
      alreadyReturned += ri.quantity_in_unit
      alreadyRefunded += ri.refund_amount_cfa
    }
  }
  return { alreadyReturned, alreadyRefunded }
}

function saleRefundContext(sale: SaleDetailData) {
  const pool = saleRefundPoolCfa({
    total_cfa: sale.total_cfa,
    admin_override_total_cfa: sale.admin_override_total_cfa,
    amount_applied_cfa: sale.amount_applied_cfa,
    balance_added_cfa: sale.balance_added_cfa,
    subtotal_cfa: sale.subtotal_cfa,
  })
  const alreadyRefundedSale = sale.returns.reduce(
    (sum, ret) =>
      sum + ret.sale_return_items.reduce((s, item) => s + item.refund_amount_cfa, 0),
    0,
  )
  return {
    pool,
    alreadyRefundedSale,
    remaining: remainingSaleRefundPool(pool, alreadyRefundedSale),
  }
}

function lineRefundInput(ri: ReturnableItem, sale: SaleDetailData) {
  const { pool } = saleRefundContext(sale)
  return {
    originalQty: ri.item.quantity_in_unit,
    selectedQty: ri.selected,
    netLineTotalCfa: ri.item.net_line_total_cfa,
    alreadyReturnedQty: ri.alreadyReturned,
    alreadyRefundedCfa: ri.alreadyRefunded,
    refundBasisCfa: lineRefundBasisCfa(
      ri.item.net_line_total_cfa,
      sale.total_cfa,
      pool,
      ri.item.line_total_cfa,
      sale.subtotal_cfa,
    ),
  }
}

function computedLineRefund(ri: ReturnableItem, sale: SaleDetailData): number {
  return computeReturnLineRefund(lineRefundInput(ri, sale))
}

function customRefundFromDraft(draft: string | null): number | null {
  if (draft == null) return null
  if (draft.trim() === '') return 0
  const parsed = parseCFAInput(draft)
  return Number.isFinite(parsed) ? parsed : 0
}

function resolvedRefund(
  ri: ReturnableItem,
  sale: SaleDetailData,
  remainingSalePoolCfa?: number,
): number {
  return resolveLineRefund(
    {
      ...lineRefundInput(ri, sale),
      customRefundCfa: customRefundFromDraft(ri.refundDraft),
    },
    remainingSalePoolCfa,
  )
}

function resolveSelectedRefunds(
  items: ReturnableItem[],
  sale: SaleDetailData,
): Map<string, number> {
  const { remaining } = saleRefundContext(sale)
  let used = 0
  const amounts = new Map<string, number>()
  for (const ri of items) {
    const amount = resolvedRefund(ri, sale, Math.max(roundCfa2(remaining - used), 0))
    amounts.set(ri.item.id, amount)
    used += amount
  }
  return amounts
}

function buildReturnableItems(
  items: SaleItemDetail[],
  returns: SaleDetailData['returns'],
): ReturnableItem[] {
  return items.map((item) => {
    const { alreadyReturned, alreadyRefunded } = priorReturnTotals(item.id, returns)
    const returnable = item.quantity_in_unit - alreadyReturned
    return {
      item,
      alreadyReturned,
      alreadyRefunded,
      returnable,
      selected: 0, // start at 0 — cashier explicitly picks quantity
      refundDraft: null,
    }
  })
}

// ─────────────────────────────────────────────────────────────────
// ReturnItemRow
// ─────────────────────────────────────────────────────────────────

interface ReturnItemRowProps {
  ri: ReturnableItem
  sale: SaleDetailData
  onChangeQty: (qty: number) => void
  onChangeRefund: (draft: string | null) => void
}

function ReturnItemRow({ ri, sale, onChangeQty, onChangeRefund }: ReturnItemRowProps) {
  const { item, returnable, selected, alreadyReturned, refundDraft } = ri
  const fullValue = selected > 0 ? computedLineRefund(ri, sale) : 0
  const refund = selected > 0 ? resolvedRefund(ri, sale) : 0
  const isCustom = refundDraft != null && refund !== fullValue
  const unitLabel = resolvedSaleUnitName(item.unit_name, item.unit_level)

  return (
    <div
      className={cn(
        'rounded-xl border p-4 space-y-3',
        returnable <= 0
          ? 'border-border opacity-50 bg-surface-muted'
          : 'border-border bg-surface shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">{item.product_name}</p>
            <SaleUnitBadge unitLevel={item.unit_level} unitName={item.unit_name} />
          </div>
          <p className="text-sm font-medium text-text-primary mt-1.5">
            {t(SALES.soldOnReceipt(item.quantity_in_unit, unitLabel))}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            {formatCFA(item.unit_price_cfa)}{' '}
            <BilingualText {...SALES.eachPrice} variant="caption" layout="inline" /> ·{' '}
            {formatSoldQuantityDetail(
              item.quantity_in_unit,
              item.unit_name,
              item.unit_level,
              item.quantity_pieces,
            )}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {alreadyReturned > 0 && (
              <>
                {t(SALES.alreadyReturned)}:{' '}
                {formatSoldQuantity(alreadyReturned, item.unit_name, item.unit_level)}
                {' · '}
              </>
            )}
            {returnable > 0
              ? `${t(SALES.returnable)}: ${formatSoldQuantity(returnable, item.unit_name, item.unit_level)}`
              : t(SALES.fullyReturned)}
          </p>
        </div>
        {selected > 0 && (
          <div className="text-right flex-shrink-0">
            {isCustom && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-warning-foreground mb-0.5">
                <BilingualText {...SALES.customRefundBadge} variant="caption" layout="inline" />
              </p>
            )}
            <p className="text-base font-bold tabular-nums text-text-primary">
              {formatCFA(refund)}
            </p>
            {isCustom && (
              <p className="text-[11px] text-text-muted line-through tabular-nums">
                {formatCFA(fullValue)}
              </p>
            )}
          </div>
        )}
      </div>

      {returnable > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              {t(SALES.returnQtyInUnit(unitLabel))}
            </span>
            {selected > 0 && (
              <p className="text-xs font-semibold text-primary">
                {t(SALES.returningQty(selected, unitLabel))}
              </p>
            )}
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeQty(Math.max(0, selected - 1))}
              disabled={selected <= 0}
              className={cn(
                'h-8 w-8 rounded-md flex items-center justify-center border border-border bg-surface',
                'hover:bg-surface-muted transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              min={0}
              max={returnable}
              value={selected}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v)) onChangeQty(Math.max(0, Math.min(returnable, v)))
              }}
              className="w-14 h-8 text-center text-sm rounded-md border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <button
              type="button"
              onClick={() => onChangeQty(Math.min(returnable, selected + 1))}
              disabled={selected >= returnable}
              className={cn(
                'h-8 w-8 rounded-md flex items-center justify-center border border-border bg-surface',
                'hover:bg-surface-muted transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChangeQty(returnable)}
              className="text-xs text-primary hover:text-primary-hover font-medium"
            >
              <BilingualText {...SALES.returnAll} variant="caption" layout="inline" />
            </button>
            </div>
            {selected > 0 && (
              <p className="text-[11px] text-text-muted">
                {t(SALES.returnLineRestored(selected, unitLabel))}
              </p>
            )}
          </div>

          {selected > 0 && (
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                <BilingualText {...SALES.refundAmount} variant="caption" layout="inline" />
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={bilingualPlain(SALES.refundAmount)}
                  value={
                    refundDraft == null
                      ? formatThousandsInput(String(fullValue))
                      : refundDraft
                  }
                  onChange={(e) => onChangeRefund(formatThousandsInput(e.target.value))}
                  className="h-8 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => onChangeRefund(null)}
                  className="text-xs text-primary hover:text-primary-hover font-medium whitespace-nowrap"
                >
                  <BilingualText {...SALES.refundFullValue} variant="caption" layout="inline" />
                </button>
              </div>
              <p className="text-[11px] text-text-muted mt-1">
                {t(SALES.refundMax(formatCFA(fullValue)))}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PreviewMetric({
  label,
  amount,
  tone,
}: {
  label: React.ReactNode
  amount: number
  tone?: 'neutral' | 'info' | 'success'
}) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2.5 border border-border">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm font-bold tabular-nums',
          tone === 'info' && 'text-info-foreground',
          tone === 'success' && 'text-success-foreground',
          !tone && 'text-text-primary',
        )}
      >
        {formatCFA(amount)}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ReturnModal (main export)
// ─────────────────────────────────────────────────────────────────

interface ReturnModalProps {
  open: boolean
  onClose: () => void
  sale: SaleDetailData
  onSuccess: () => void
  shiftId?: string | null
}

export function ReturnModal({ open, onClose, sale, onSuccess, shiftId }: ReturnModalProps) {
  const [returnableItems, setReturnableItems] = useState<ReturnableItem[]>(() =>
    buildReturnableItems(sale.items, sale.returns),
  )
  const [reason, setReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const inFlight = useRef(false)
  const staff = useAuthStore((s) => s.staff)
  const { data: openShifts, isLoading: openShiftsLoading } = useOpenShifts()
  const effectiveShiftId = resolveRequiredShiftId(
    shiftId,
    sale.depot_id,
    staff?.id,
    authorizedOpenShifts(staff, openShifts),
  )
  const hasOpenShift = !!effectiveShiftId
  const shiftGateReady = !openShiftsLoading

  const selectedItems = useMemo(
    () => returnableItems.filter((ri) => ri.selected > 0),
    [returnableItems],
  )

  const selectedRefunds = useMemo(
    () => resolveSelectedRefunds(selectedItems, sale),
    [selectedItems, sale],
  )

  const estimatedRefundTotal = useMemo(
    () =>
      selectedItems.reduce(
        (sum, ri) => sum + (selectedRefunds.get(ri.item.id) ?? 0),
        0,
      ),
    [selectedItems, selectedRefunds],
  )

  const preview = useMemo(
    () =>
      computeReturnRefundPreview({
        refundAmountCfa: estimatedRefundTotal,
        customerId: sale.customer_id,
        saleBalanceAddedCfa: sale.balance_added_cfa,
        customerBalanceOwedCfa: sale.customer_balance_owed_cfa,
        previousReturns: sale.returns,
      }),
    [
      estimatedRefundTotal,
      sale.customer_id,
      sale.balance_added_cfa,
      sale.customer_balance_owed_cfa,
      sale.returns,
    ],
  )

  const noItemsSelected = selectedItems.length === 0
  const canSubmit = !noItemsSelected && !isLoading && shiftGateReady && hasOpenShift

  const handleSubmit = async () => {
    if (inFlight.current) return
    if (!canSubmit) return

    inFlight.current = true
    setIsLoading(true)
    try {
      const result = await rpc.processReturn({
        p_sale_id: sale.id,
        p_items: selectedItems.map((ri) => ({
          sale_item_id:    ri.item.id,
          quantity_in_unit: ri.selected,
          refund_amount_cfa: selectedRefunds.get(ri.item.id) ?? 0,
          // NOTE: no quantity_pieces — server derives it from frozen sale data
        })),
        p_reason:       reason.trim() || null,
        p_cash_refund_cfa: preview.cashRefundCfa,
        p_shift_id:     effectiveShiftId,
      })

      if (result.error) {
        clearStalePosShift(result.error.code)
        toastErrorFromCode(result.error.code, result.error.details)
        return
      }

      const data = result.data
      toastSuccessBi(SALES.returnProcessedCash(formatCFA(data.cash_refunded_cfa)))
      onSuccess()
      onClose()
    } finally {
      setIsLoading(false)
      inFlight.current = false
    }
  }

  const handleClose = () => {
    if (!isLoading) onClose()
  }

  const updateQty = (idx: number, qty: number) => {
    setReturnableItems((prev) =>
      prev.map((ri, i) => {
        if (i !== idx) return ri
        const next = { ...ri, selected: qty }
        if (next.refundDraft == null) return next
        const parsed = customRefundFromDraft(next.refundDraft) ?? 0
        return {
          ...next,
          refundDraft: formatThousandsInput(String(resolveLineRefund({
            ...lineRefundInput(next, sale),
            customRefundCfa: parsed,
          }))),
        }
      }),
    )
  }

  const updateRefund = (idx: number, draft: string | null) => {
    setReturnableItems((prev) =>
      prev.map((ri, i) => {
        if (i !== idx) return ri
        if (draft == null) return { ...ri, refundDraft: null }
        const max = computedLineRefund({ ...ri, refundDraft: draft }, sale)
        const parsed = customRefundFromDraft(draft) ?? 0
        const clamped = resolveLineRefund({
          ...lineRefundInput(ri, sale),
          customRefundCfa: parsed,
        })
        // Keep typing mid-edit unless the value exceeds the max.
        if (parsed > max) {
          return { ...ri, refundDraft: formatThousandsInput(String(clamped)) }
        }
        return { ...ri, refundDraft: draft }
      }),
    )
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={<BiModalTitle {...SALES.returnModalTitle(sale.receipt_number)} />}
      size="xl"
    >
      <div className="space-y-4">
        <p className="text-xs text-text-secondary rounded-lg bg-primary-subtle border border-primary/15 px-3 py-2">
          <BilingualText {...SALES.refundCustomHint} variant="caption" />
        </p>

        {shiftGateReady && !hasOpenShift && (
          <p className="text-xs text-warning-foreground bg-warning-bg border border-warning/20 rounded-md px-2.5 py-1.5">
            <BilingualText {...SALES.noProcessingShift} variant="caption" />
          </p>
        )}

        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {returnableItems.map((ri, idx) => (
            <ReturnItemRow
              key={ri.item.id}
              ri={ri}
              sale={sale}
              onChangeQty={(qty) => updateQty(idx, qty)}
              onChangeRefund={(draft) => updateRefund(idx, draft)}
            />
          ))}
        </div>

        {noItemsSelected && (
          <p className="text-xs text-text-muted text-center">
            <BilingualText {...SALES.selectQtyHint} variant="caption" />
          </p>
        )}

        {!noItemsSelected && (
          <div className="rounded-xl bg-surface-muted border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                <BiTableHeader {...SALES.refundPreview} />
              </p>
              <p className="text-[11px] font-medium text-success-foreground">
                <BilingualText {...SALES.stockRestored} variant="caption" layout="inline" />
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <PreviewMetric
                label={<BiTableHeader {...SALES.totalRefund} />}
                amount={preview.refundAmountCfa}
              />
              <PreviewMetric
                label={<BiTableHeader {...SALES.balanceReduction} />}
                amount={preview.balanceAdjustmentCfa}
                tone={preview.balanceAdjustmentCfa > 0 ? 'info' : 'neutral'}
              />
              <PreviewMetric
                label={<BiTableHeader {...SALES.cashRefund} />}
                amount={preview.cashRefundCfa}
                tone="success"
              />
            </div>
            <p className="text-xs text-text-muted">
              <BilingualText {...SALES.serverRefundNote} variant="caption" />
            </p>
            {hasOpenShift ? (
              <p className="text-xs text-text-secondary">
                <BilingualText {...SALES.cashRefundShiftNote} variant="caption" />
              </p>
            ) : (
              <p className="text-xs text-warning-foreground bg-warning-bg border border-warning/20 rounded-md px-2.5 py-1.5">
                <BilingualText {...SALES.noProcessingShift} variant="caption" />
              </p>
            )}
          </div>
        )}

        {/* Reason */}
        <Textarea
          label={bilingualPlain(SALES.voidReasonOptional)}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={bilingualPlain(SALES.returnReasonPlaceholder)}
          rows={2}
          disabled={isLoading}
        />

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
            <BiButtonStack {...COMMON.cancel} />
          </Button>
          <LoadingButton
            variant="primary"
            loading={isLoading}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            <BiButtonStack {...SALES.processReturn} />
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
