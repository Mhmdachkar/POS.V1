/**
 * ReturnModal — Process a partial or full sale return.
 *
 * Workflow:
 *   1. Show returnable items (original qty - already returned qty)
 *   2. Cashier selects return quantities per item (UI blocks over-return)
 *   3. Cashier enters reason (optional)
 *   4. Show refund preview: total refund, cash portion, balance portion
 *   5. Cashier enters cash refund amount (must ≤ refund total)
 *   6. Submit via rpc.processReturn()
 *
 * Critical requirements:
 *   - NEVER sends quantity_pieces — server derives it from frozen sale data
 *   - Only sends: { sale_item_id, quantity_in_unit }
 *   - cash_refund + balance_reduction must = refund_total (validated UI + server)
 */

import { useState, useMemo } from 'react'
import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { Modal, Button, LoadingButton, Input, Textarea } from '@/components/ui'
import { formatCFA, parseCFAInput } from '@/lib/formatters'
import { rpc } from '@/lib/rpc'
import { getErrorMessage } from '@/lib/errors'
import type { SaleDetailData, SaleItemDetail } from '@/hooks/useSales'

// ─────────────────────────────────────────────────────────────────
// Returnability helpers
// ─────────────────────────────────────────────────────────────────

interface ReturnableItem {
  item: SaleItemDetail
  alreadyReturned: number   // qty_in_unit already returned across all returns
  returnable: number        // original - alreadyReturned
  selected: number          // what the cashier is returning now
}

function buildReturnableItems(
  items: SaleItemDetail[],
  returns: SaleDetailData['returns'],
): ReturnableItem[] {
  // Aggregate already-returned quantities per sale_item_id across all return events
  const returnedMap: Record<string, number> = {}
  for (const ret of returns) {
    for (const ri of ret.sale_return_items) {
      returnedMap[ri.sale_item_id] =
        (returnedMap[ri.sale_item_id] ?? 0) + ri.quantity_in_unit
    }
  }

  return items.map((item) => {
    const alreadyReturned = returnedMap[item.id] ?? 0
    const returnable = item.quantity_in_unit - alreadyReturned
    return {
      item,
      alreadyReturned,
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
    returnable > 0 && selected > 0
      ? (selected / item.quantity_in_unit) * item.net_line_total_cfa
      : 0

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
            {item.unit_name} · {formatCFA(item.unit_price_cfa)} each
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            Original: {item.quantity_in_unit}
            {alreadyReturned > 0 && ` · Already returned: ${alreadyReturned}`}
            {returnable > 0 ? ` · Returnable: ${returnable}` : ' · Fully returned'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-text-muted">Est. refund</p>
          <p className="text-sm font-semibold text-text-primary">
            {selected > 0 ? formatCFA(estimatedRefund) : '—'}
          </p>
        </div>
      </div>

      {/* Quantity selector */}
      {returnable > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">Return qty:</span>
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
              Return all
            </button>
          )}
        </div>
      )}
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
  const [cashRefundInput, setCashRefundInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // ── Computed refund preview ────────────────────────────────────
  const selectedItems = useMemo(
    () => returnableItems.filter((ri) => ri.selected > 0),
    [returnableItems],
  )

  const estimatedRefundTotal = useMemo(() => {
    // Proportional estimate: (selected / original) * net_line_total
    // The server computes the authoritative value.
    return selectedItems.reduce((sum, ri) => {
      return sum + (ri.selected / ri.item.quantity_in_unit) * ri.item.net_line_total_cfa
    }, 0)
  }, [selectedItems])

  const cashRefund = useMemo(() => {
    const val = parseCFAInput(cashRefundInput)
    return isNaN(val) ? 0 : val
  }, [cashRefundInput])

  const balanceAdjustment = Math.max(0, estimatedRefundTotal - cashRefund)

  // ── Validation ─────────────────────────────────────────────────
  const isCashRefundInvalid = cashRefund < 0 || cashRefund > estimatedRefundTotal
  const noItemsSelected = selectedItems.length === 0
  const canSubmit = !noItemsSelected && !isCashRefundInvalid && !isLoading

  // ── Submit ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return

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
        p_cash_refund_cfa: cashRefund,
        p_shift_id:     shiftId ?? null,
      })

      if (result.error) {
        toast.error(getErrorMessage(result.error.code))
        return
      }

      const data = result.data
      toast.success(
        `Return processed. ${formatCFA(data.cash_refunded_cfa)} cash refunded.`,
      )
      onSuccess()
      onClose()
    } finally {
      setIsLoading(false)
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
      title={`Return — ${sale.receipt_number}`}
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
            Select quantities to return above
          </p>
        )}

        {/* Refund breakdown */}
        {!noItemsSelected && (
          <div className="rounded-md bg-surface-muted border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Refund Preview
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Estimated refund</span>
              <span className="font-semibold">{formatCFA(estimatedRefundTotal)}</span>
            </div>

            {/* Cash refund input */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-text-secondary flex-shrink-0">Cash refund</span>
              <div className="flex-1">
                <input
                  type="number"
                  min={0}
                  max={estimatedRefundTotal}
                  value={cashRefundInput}
                  onChange={(e) => setCashRefundInput(e.target.value)}
                  placeholder={`0 – ${Math.round(estimatedRefundTotal)}`}
                  className={cn(
                    'w-full h-8 px-3 text-sm rounded-md border bg-surface text-text-primary',
                    'focus:outline-none focus:ring-2 focus:ring-primary/20',
                    isCashRefundInvalid
                      ? 'border-danger focus:border-danger'
                      : 'border-border focus:border-primary',
                  )}
                />
              </div>
              <span className="text-sm font-semibold">CFA</span>
            </div>
            {isCashRefundInvalid && (
              <p className="text-xs text-danger">
                Cash refund must be between 0 and {formatCFA(estimatedRefundTotal)}
              </p>
            )}

            <div className="flex justify-between text-sm border-t border-border pt-2">
              <span className="text-text-secondary">Balance reduction</span>
              <span className={cn('font-semibold', balanceAdjustment > 0 && 'text-info-foreground')}>
                {formatCFA(balanceAdjustment)}
              </span>
            </div>
            <p className="text-xs text-text-muted">
              Server computes authoritative refund amounts.
            </p>
          </div>
        )}

        {/* Reason */}
        <Textarea
          label="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for return…"
          rows={2}
          disabled={isLoading}
        />

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <LoadingButton
            variant="primary"
            loading={isLoading}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            Process Return
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
