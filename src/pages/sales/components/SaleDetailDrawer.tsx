/**
 * SaleDetailDrawer — Full sale detail in a slide-out drawer.
 *
 * Shows:
 *   - Receipt number, status, date, depot, cashier
 *   - Customer (name, phone, current balance)
 *   - Items: product, unit, qty, historical unit price, line total
 *   - Discount breakdown
 *   - Financial summary (subtotal → total → cash → change/balance)
 *   - Return history (per-return and per-item)
 *   - Void information
 *   - Actions: Print Receipt | Return | Void (role/status gated)
 *
 * Historical values come from the database — they are NEVER recalculated
 * using today's prices.
 */

import { useState } from 'react'
import { Printer, RotateCcw, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Drawer, Button, Skeleton, SaleStatusBadge } from '@/components/ui'
import { formatCFA, formatDateTime } from '@/lib/formatters'
import { useSaleDetail } from '@/hooks/useSales'
import { useQueryClient } from '@tanstack/react-query'
import { saleKeys } from '@/hooks/useSales'
import { productKeys } from '@/hooks/useProducts'
import { customerKeys } from '@/hooks/useCustomers'
import { ReturnModal } from './ReturnModal'
import { VoidModal } from './VoidModal'

// ─────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2 mt-4 first:mt-0">
      {title}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────────
// DetailRow
// ─────────────────────────────────────────────────────────────────

function DetailRow({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary flex-shrink-0">{label}</span>
      <span
        className={cn(
          'text-sm text-right',
          bold ? 'font-semibold text-text-primary' : 'text-text-primary',
        )}
      >
        {value}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Printable receipt trigger (inside drawer)
// ─────────────────────────────────────────────────────────────────

function SalePrintReceipt({ receiptNumber, total, customerName }: {
  receiptNumber: string
  total: number
  customerName: string | null
}) {
  const lot = receiptNumber.split('-')[0] ?? ''

  const handlePrint = () => {
    // Populate the hidden receipt element then print
    const existing = document.getElementById('vhm-receipt-drawer')
    if (existing) existing.remove()

    const div = document.createElement('div')
    div.id = 'vhm-receipt-drawer'
    div.className = 'print-only'
    div.innerHTML = `
      <div class="receipt-paper">
        <div class="receipt-header">
          <div class="receipt-lot">LOT: ${lot}</div>
          <div class="receipt-number">${receiptNumber}</div>
        </div>
        <div class="receipt-divider">- - - - - - - - - - - - - -</div>
        ${customerName ? `<div class="receipt-customer">${customerName}</div>` : ''}
        <div class="receipt-amount">${formatCFA(total)}</div>
        <div class="receipt-divider">- - - - - - - - - - - - - -</div>
        <div class="receipt-paid">PAID</div>
      </div>
    `
    document.body.appendChild(div)
    window.print()
    setTimeout(() => div.remove(), 1000)
  }

  return (
    <Button variant="secondary" size="sm" className="gap-1.5" onClick={handlePrint}>
      <Printer className="h-3.5 w-3.5" />
      Print Receipt
    </Button>
  )
}

// ─────────────────────────────────────────────────────────────────
// SaleDetailDrawer (main export)
// ─────────────────────────────────────────────────────────────────

interface SaleDetailDrawerProps {
  saleId: string | null
  shiftId?: string | null
  onClose: () => void
}

export function SaleDetailDrawer({ saleId, shiftId, onClose }: SaleDetailDrawerProps) {
  const [showReturn, setShowReturn] = useState(false)
  const [showVoid, setShowVoid] = useState(false)
  const queryClient = useQueryClient()

  const { data: sale, isLoading, isError } = useSaleDetail(saleId)

  const handleMutationSuccess = () => {
    if (saleId) {
      queryClient.invalidateQueries({ queryKey: saleKeys.detail(saleId) })
      queryClient.invalidateQueries({ queryKey: saleKeys.lists() })
      queryClient.invalidateQueries({ queryKey: productKeys.all })
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
    }
  }

  // ── Action eligibility ─────────────────────────────────────────
  const canReturn = sale &&
    (sale.status === 'completed' || sale.status === 'partially_returned') &&
    sale.items.some((item) => {
      const returned = sale.returns.reduce((sum, r) =>
        sum + r.sale_return_items
          .filter((ri) => ri.sale_item_id === item.id)
          .reduce((s, ri) => s + ri.quantity_in_unit, 0),
        0,
      )
      return returned < item.quantity_in_unit
    })

  const canVoid = sale && sale.status === 'completed'

  return (
    <>
      <Drawer
        open={!!saleId}
        onClose={onClose}
        title={sale ? sale.receipt_number : 'Sale Detail'}
        description={sale ? `${formatDateTime(sale.created_at)}` : undefined}
        width="lg"
      >
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError || !sale ? (
          <p className="text-sm text-danger">Failed to load sale details.</p>
        ) : (
          <div className="space-y-1">
            {/* Status + Actions row */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <SaleStatusBadge status={sale.status} />
              <div className="flex gap-1.5">
                <SalePrintReceipt
                  receiptNumber={sale.receipt_number}
                  total={sale.total_cfa}
                  customerName={sale.customer_name}
                />
                {canReturn && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowReturn(true)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Return
                  </Button>
                )}
                {canVoid && (
                  <Button
                    variant="danger"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowVoid(true)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Void
                  </Button>
                )}
              </div>
            </div>

            {/* Sale info */}
            <SectionHeader title="Sale Info" />
            <DetailRow label="Receipt #" value={<span className="font-mono">{sale.receipt_number}</span>} />
            <DetailRow label="Date" value={formatDateTime(sale.created_at)} />
            <DetailRow label="Cashier" value={sale.cashier_name ?? '—'} />
            {sale.customer_name && (
              <>
                <DetailRow label="Customer" value={sale.customer_name} bold />
                {sale.customer_phone && (
                  <DetailRow label="Phone" value={sale.customer_phone} />
                )}
                {sale.customer_balance_owed_cfa != null && (
                  <DetailRow
                    label="Current balance"
                    value={
                      <span className={sale.customer_balance_owed_cfa > 0 ? 'text-danger font-semibold' : ''}>
                        {formatCFA(sale.customer_balance_owed_cfa)}
                      </span>
                    }
                  />
                )}
              </>
            )}

            {/* Items */}
            <SectionHeader title="Items" />
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-text-secondary">Product</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-text-secondary">Qty</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-text-secondary">Unit Price</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-text-secondary">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <p className="font-medium text-text-primary">{item.product_name}</p>
                        <p className="text-xs text-text-muted">{item.unit_name}</p>
                      </td>
                      <td className="px-3 py-2 text-right text-text-primary tabular-nums">
                        {item.quantity_in_unit}
                      </td>
                      <td className="px-3 py-2 text-right text-text-secondary tabular-nums">
                        {formatCFA(item.unit_price_cfa)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-text-primary tabular-nums">
                        {formatCFA(item.line_total_cfa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financials */}
            <SectionHeader title="Financials" />
            <DetailRow label="Subtotal" value={formatCFA(sale.subtotal_cfa)} />
            {sale.discount_amount_cfa > 0 && (
              <DetailRow
                label={
                  sale.discount_type === 'flat'
                    ? 'Flat discount'
                    : `Discount (${sale.discount_value}%)`
                }
                value={<span className="text-success-foreground">− {formatCFA(sale.discount_amount_cfa)}</span>}
              />
            )}
            <DetailRow label="Total" value={formatCFA(sale.total_cfa)} bold />
            <DetailRow label="Cash received" value={formatCFA(sale.amount_tendered_cfa)} />
            <DetailRow label="Amount applied" value={formatCFA(sale.amount_applied_cfa)} />
            {sale.change_given_cfa > 0 && (
              <DetailRow
                label="Change"
                value={<span className="text-success-foreground">{formatCFA(sale.change_given_cfa)}</span>}
              />
            )}
            {sale.balance_added_cfa > 0 && (
              <DetailRow
                label="Balance added"
                value={<span className="text-danger-foreground">{formatCFA(sale.balance_added_cfa)}</span>}
              />
            )}

            {/* Return history */}
            {sale.returns.length > 0 && (
              <>
                <SectionHeader title="Returns" />
                <div className="space-y-2">
                  {sale.returns.map((ret) => (
                    <div
                      key={ret.id}
                      className="rounded-md border border-border p-3 text-sm space-y-1"
                    >
                      <div className="flex justify-between">
                        <span className="text-text-secondary">{formatDateTime(ret.created_at)}</span>
                        <span className="font-semibold text-text-primary">
                          {formatCFA(ret.refund_amount_cfa)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-text-muted">
                        <span>Cash: {formatCFA(ret.cash_refunded_cfa)}</span>
                        <span>Balance: {formatCFA(ret.balance_adjustment_cfa)}</span>
                      </div>
                      {ret.reason && (
                        <p className="text-xs text-text-secondary italic">{ret.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Void info */}
            {sale.status === 'voided' && (
              <>
                <SectionHeader title="Void" />
                <div className="rounded-md bg-surface-muted border border-border p-3 text-sm">
                  <p className="text-text-secondary">This sale has been voided.</p>
                </div>
              </>
            )}
          </div>
        )}
      </Drawer>

      {/* Modals */}
      {sale && showReturn && (
        <ReturnModal
          open={showReturn}
          onClose={() => setShowReturn(false)}
          sale={sale}
          shiftId={shiftId}
          onSuccess={handleMutationSuccess}
        />
      )}
      {sale && showVoid && (
        <VoidModal
          open={showVoid}
          onClose={() => setShowVoid(false)}
          sale={sale}
          onSuccess={handleMutationSuccess}
        />
      )}
    </>
  )
}
