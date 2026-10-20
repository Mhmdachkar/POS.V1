/**
 * ReturnModal — Process a partial or full sale return.
 *
 * Workflow:
 *   1. Show returnable items (original qty - already returned qty)
 *   2. Cashier selects return quantities per item (UI blocks over-return)
 *   3. Cashier enters reason (optional)
 *   4. Show refund preview: total, balance reduction, cash (SQL C1 split)
 *   5. Submit via rpc.processReturn() with computed p_cash_refund_cfa
 *
 * Critical requirements:
 *   - NEVER sends quantity_pieces — server derives it from frozen sale data
 *   - Only sends: { sale_item_id, quantity_in_unit }
 *   - p_cash_refund_cfa is the helper-computed cash, not a cashier override
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
import { formatCFA } from '@/lib/formatters'
import { rpc } from '@/lib/rpc'
import { computeReturnLineRefund, computeReturnRefundPreview, computeReturnRefundTotal } from '@/lib/returnRefundPreview'
import { authorizedOpenShifts, clearStalePosShift, useOpenShifts } from '@/hooks/useShifts'
import { processingShiftId, resolveLoadedPosShiftContext } from '@/lib/posShiftContext'
import { useAuthStore } from '@/stores/authStore'
import type { SaleDetailData, SaleItemDetail } from '@/hooks/useSales'

// ─────────────────────────────────────────────────────────────────
// Returnability helpers
// ─────────────────────────────────────────────────────────────────

interface ReturnableItem {
  item: SaleItemDetail
  alreadyReturned: number   // qty_in_unit already returned across all returns
  alreadyRefunded: number   // refund_amount_cfa already returned for this sale_item
  returnable: number        // original - alreadyReturned
  selected: number          // what the cashier is returning now
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

function lineRefundInput(ri: ReturnableItem) {
  return {
    originalQty: ri.item.quantity_in_unit,
    selectedQty: ri.selected,
    netLineTotalCfa: ri.item.net_line_total_cfa,
    alreadyReturnedQty: ri.alreadyReturned,
    alreadyRefundedCfa: ri.alreadyRefunded,
  }
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
    }
  })
}

// ─────────────────────────────────────────────────────────────────
// ReturnItemRow
// ─────────────────────────────────────────────────────────────────

interface ReturnItemRowProps {
  ri: ReturnableItem
  onChange: (qty: number) => void
}

function ReturnItemRow({ ri, onChange }: ReturnItemRowProps) {
  const { item, returnable, selected, alreadyReturned } = ri
  const estimatedRefund =
    selected > 0 ? computeReturnLineRefund(lineRefundInput(ri)) : 0

  return (
    <div
      className={cn(
        'p-3 rounded-md border',
        returnable <= 0
          ? 'border-border opacity-50 bg-surface-muted'
          : 'border-border bg-surface',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{item.product_name}</p>
          <p className="text-xs text-text-secondary">
            {item.unit_name} · {formatCFA(item.unit_price_cfa)}{' '}
            <BilingualText {...SALES.eachPrice} variant="caption" layout="inline" />
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            {t(SALES.originalQty)}: {item.quantity_in_unit}
            {alreadyReturned > 0 && ` · ${t(SALES.alreadyReturned)}: ${alreadyReturned}`}
            {returnable > 0
              ? ` · ${t(SALES.returnable)}: ${returnable}`
              : ` · ${t(SALES.fullyReturned)}`}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-text-muted">
            <BilingualText {...SALES.estRefund} variant="caption" />
          </p>
          <p className="text-sm font-semibold text-text-primary">
            {selected > 0 ? formatCFA(estimatedRefund) : '—'}
          </p>
        </div>
      </div>

      {/* Quantity selector */}
      {returnable > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">
            <BilingualText {...SALES.returnQty} variant="caption" layout="inline" />:
          </span>
          <button
            type="button"
            onClick={() => onChange(Math.max(0, selected - 1))}
            disabled={selected <= 0}
            className={cn(
              'h-7 w-7 rounded flex items-center justify-center border border-border bg-surface',
              'hover:bg-surface-muted transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            type="number"
            min={0}
            max={returnable}
            value={selected}
            onChange={(e) => {
              const v = parseInt(e.target.value)
              if (!isNaN(v)) onChange(Math.max(0, Math.min(returnable, v)))
            }}
            className="w-14 h-7 text-center text-sm rounded border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <button
            type="button"
            onClick={() => onChange(Math.min(returnable, selected + 1))}
            disabled={selected >= returnable}
            className={cn(
              'h-7 w-7 rounded flex items-center justify-center border border-border bg-surface',
              'hover:bg-surface-muted transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <Plus className="h-3 w-3" />
          </button>
          {returnable > 0 && (
            <button
              type="button"
              onClick={() => onChange(returnable)}
              className="text-xs text-primary hover:text-primary-hover underline"
            >
              <BilingualText {...SALES.returnAll} variant="caption" layout="inline" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function PreviewRow({
  label,
  amount,
  emphasize,
}: {
  label: React.ReactNode
  amount: number
  emphasize?: boolean
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className={cn('font-semibold', emphasize && 'text-info-foreground')}>
        {formatCFA(amount)}
      </span>
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
  const shiftCtx = resolveLoadedPosShiftContext(
    shiftId,
    null,
    authorizedOpenShifts(staff, openShifts),
    openShiftsLoading,
  )
  const effectiveShiftId = processingShiftId(shiftId, shiftCtx)

  const selectedItems = useMemo(
    () => returnableItems.filter((ri) => ri.selected > 0),
    [returnableItems],
  )

  const estimatedRefundTotal = useMemo(
    () => computeReturnRefundTotal(selectedItems.map(lineRefundInput)),
    [selectedItems],
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
  const canSubmit = !noItemsSelected && !isLoading

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
      prev.map((ri, i) => (i === idx ? { ...ri, selected: qty } : ri)),
    )
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={<BiModalTitle {...SALES.returnModalTitle(sale.receipt_number)} />}
      size="lg"
    >
      <div className="space-y-4">
        {/* Items */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {returnableItems.map((ri, idx) => (
            <ReturnItemRow
              key={ri.item.id}
              ri={ri}
              onChange={(qty) => updateQty(idx, qty)}
            />
          ))}
        </div>

        {noItemsSelected && (
          <p className="text-xs text-text-muted text-center">
            <BilingualText {...SALES.selectQtyHint} variant="caption" />
          </p>
        )}

        {!noItemsSelected && (
          <div className="rounded-md bg-surface-muted border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              <BiTableHeader {...SALES.refundPreview} />
            </p>
            <PreviewRow label={<BiTableHeader {...SALES.totalRefund} />} amount={preview.refundAmountCfa} />
            <PreviewRow
              label={<BiTableHeader {...SALES.balanceReduction} />}
              amount={preview.balanceAdjustmentCfa}
              emphasize={preview.balanceAdjustmentCfa > 0}
            />
            <PreviewRow label={<BiTableHeader {...SALES.cashRefund} />} amount={preview.cashRefundCfa} />
            <p className="text-xs text-text-muted">
              <BilingualText {...SALES.serverRefundNote} variant="caption" />
            </p>
            {shiftCtx.hasValidShift ? (
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
