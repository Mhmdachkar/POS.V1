/**
 * SaleSuccessModal — Post-sale confirmation with receipt.
 *
 * Shows after a successful complete_sale() RPC call.
 * Displays server-authoritative values (not client-side preview).
 *
 * Actions:
 *   - Print Receipt (browser print, shows only the receipt)
 *   - New Sale (clears POS state, closes modal)
 *
 * Customer receipt format (per specification):
 *   - Lot (depot code from receipt number)
 *   - Receipt number
 *   - Amount + currency
 *   - PAID
 *
 * Do NOT include: timestamps, plates, payment method, internal data.
 *
 * The receipt is hidden in normal view and only visible when printing.
 * CSS @media print reveals the receipt and hides everything else.
 */

import { useRef } from 'react'
import { CheckCircle, Printer, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Modal, Button } from '@/components/ui'
import { formatCFA } from '@/lib/formatters'
import { usePOSStore } from '@/stores/posStore'
import type { CompleteSaleResult } from '@/types/rpc'
import type { Customer } from '@/types/database'

// ─────────────────────────────────────────────────────────────────
// PrintableReceipt — only visible during window.print()
// ─────────────────────────────────────────────────────────────────

interface PrintableReceiptProps {
  result: CompleteSaleResult
  customer: Customer | null
}

function PrintableReceipt({ result, customer }: PrintableReceiptProps) {
  // Lot = depot code from receipt number (e.g. "DKR" from "DKR-00000012")
  const lot = result.receipt_number.split('-')[0] ?? ''

  return (
    <div
      className="print-only"
      style={{ display: 'none' }}
      aria-hidden="true"
    >
      {/* This is only shown by the @media print CSS rule in index.css */}
      <div id="vhm-receipt" className="receipt-paper">
        <div className="receipt-header">
          <div className="receipt-lot">LOT: {lot}</div>
          <div className="receipt-number">{result.receipt_number}</div>
        </div>
        <div className="receipt-divider">- - - - - - - - - - - - - -</div>
        {customer && (
          <div className="receipt-customer">{customer.name}</div>
        )}
        <div className="receipt-amount">
          {formatCFA(result.total_cfa)}
        </div>
        <div className="receipt-divider">- - - - - - - - - - - - - -</div>
        <div className="receipt-paid">PAID</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SaleSuccessModal (main export)
// ─────────────────────────────────────────────────────────────────

interface SaleSuccessModalProps {
  result: CompleteSaleResult
  customer: Customer | null
  cartItemCount: number
}

export function SaleSuccessModal({ result, customer, cartItemCount }: SaleSuccessModalProps) {
  const { startNewSale } = usePOSStore((s) => ({
    startNewSale: s.startNewSale,
  }))

  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  const isChange = result.change_given_cfa > 0
  const isBalance = result.balance_added_cfa > 0
  const wasIdempotent = result.idempotent

  return (
    <>
      {/* Printable receipt — hidden in UI, shown by @media print */}
      <PrintableReceipt result={result} customer={customer} />

      <Modal
        open={true}
        onClose={() => {}} // Only closeable via "New Sale"
        title="Sale Complete"
        hideClose
        size="md"
        className="no-print"
      >
        <div className="space-y-5" ref={printRef}>
          {/* Success header */}
          <div className="flex flex-col items-center text-center gap-3 pt-2">
            <div className="w-14 h-14 rounded-full bg-success-bg flex items-center justify-center">
              <CheckCircle className="h-7 w-7 text-success" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">Sale completed successfully</h2>
              <p className="text-sm text-text-secondary mt-0.5 font-mono">
                {result.receipt_number}
              </p>
              {wasIdempotent && (
                <p className="text-xs text-info-foreground mt-1 bg-info-bg px-2 py-0.5 rounded-full inline-block">
                  Duplicate submission — existing sale returned
                </p>
              )}
            </div>
          </div>

          {/* Sale financials — server-authoritative */}
          <div className="rounded-lg bg-surface-muted border border-border overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-surface">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                Sale Summary
              </p>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              {customer && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Customer</span>
                  <span className="font-medium text-text-primary">{customer.name}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Items</span>
                <span className="font-medium text-text-primary">{cartItemCount}</span>
              </div>
              {result.discount_amount_cfa > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Discount</span>
                  <span className="font-medium text-success-foreground">
                    − {formatCFA(result.discount_amount_cfa)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold border-t border-border pt-2 mt-2">
                <span className="text-text-primary">Total</span>
                <span className="text-text-primary text-base">{formatCFA(result.total_cfa)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Amount applied</span>
                <span className="text-text-primary">{formatCFA(result.amount_applied_cfa)}</span>
              </div>
              {isChange && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Change</span>
                  <span className="font-semibold text-success-foreground">
                    {formatCFA(result.change_given_cfa)}
                  </span>
                </div>
              )}
              {isBalance && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Balance added</span>
                  <span className="font-semibold text-danger-foreground">
                    {formatCFA(result.balance_added_cfa)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="md"
              className="flex-1 gap-2"
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4" />
              Print Receipt
            </Button>
            <Button
              variant="primary"
              size="md"
              className="flex-1 gap-2"
              onClick={startNewSale}
              autoFocus
            >
              <ShoppingCart className="h-4 w-4" />
              New Sale
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
