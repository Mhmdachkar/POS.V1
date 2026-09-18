/**
 * SaleSuccessModal — Post-sale confirmation with receipt.
 *
 * Shows after a successful complete_sale() RPC call.
 * Displays server-authoritative values (not client-side preview).
 *
 * Print uses fetchSaleDetail(sale_id) via useSaleDetail — never the live cart.
 *
 * Actions:
 *   - Browser print (fallback) — automatic printing uses the local print agent
 *   - New Sale (clears POS state, closes modal)
 */

import { CheckCircle, Printer, ShoppingCart } from 'lucide-react'
import { BiEmptyTitle, BiModalTitle, BiPageTitle, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { COMMON } from '@/lib/bilingual/common'
import { ADMIN } from '@/lib/bilingual/admin'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { SALES } from '@/lib/bilingual/sales'
import { POS } from '@/lib/bilingual/pos'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { Modal, Button, MoneyDisplay } from '@/components/ui'
import { formatCFA } from '@/lib/formatters'
import { buildReceiptHtml, printReceiptHtml, receiptDataFromSaleDetail } from '@/lib/receiptHtml'
import { useSaleDetail } from '@/hooks/useSales'
import { useDepotStore } from '@/stores/depotStore'
import { usePOSStore } from '@/stores/posStore'
import type { CompleteSaleResult } from '@/types/rpc'
import type { Customer } from '@/types/database'

interface SaleSuccessModalProps {
  result: CompleteSaleResult
  customer: Customer | null
  cartItemCount: number
  businessName?: string
}

export function SaleSuccessModal({
  result,
  customer,
  cartItemCount,
  businessName = 'VHM POS',
}: SaleSuccessModalProps) {
  const startNewSale = usePOSStore((s) => s.startNewSale)
  const depotName = useDepotStore((s) => s.currentDepotName)
  const {
    data: sale,
    isLoading: saleLoading,
    isError: saleError,
  } = useSaleDetail(result.sale_id)

  const canPrint = !!sale && !saleLoading && !saleError

  const handlePrint = () => {
    if (!sale) return
    printReceiptHtml(
      buildReceiptHtml(receiptDataFromSaleDetail(sale, businessName, depotName)),
      'vhm-receipt',
    )
  }

  const isChange = result.change_given_cfa > 0
  const isBalance = result.balance_added_cfa > 0
  const wasIdempotent = result.idempotent

  return (
    <Modal
      open={true}
      onClose={() => {}} // Only closeable via New Sale
      title={<BiModalTitle {...SALES.saleComplete} />}
      hideClose
      size="md"
      className="no-print"
    >
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center gap-3 pt-2">
          <div className="w-14 h-14 rounded-full bg-success-bg flex items-center justify-center">
            <CheckCircle className="h-7 w-7 text-success" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">{POS.saleCompletedSuccess.fr}</h2>
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
            <div className="flex justify-between items-center font-semibold border-t border-border pt-2 mt-2">
              <span className="text-text-primary text-sm">Total</span>
              <MoneyDisplay amount={result.total_cfa} size="display" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">{SALES.amountApplied.fr}</span>
              <span className="text-text-primary">{formatCFA(result.amount_applied_cfa)}</span>
            </div>
            {isChange && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary">Change</span>
                <MoneyDisplay amount={result.change_given_cfa} size="large" />
              </div>
            )}
            {isBalance && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary">{SALES.balanceAdded.fr}</span>
                <MoneyDisplay amount={result.balance_added_cfa} size="large" danger />
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-text-muted text-center">
          Customer receipt prints automatically when the cashier print agent is running.
        </p>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="md"
            className="flex-1 gap-2"
            onClick={handlePrint}
            disabled={!canPrint}
            title={
              saleError
                ? POS.receiptLoadFailed.fr
                : saleLoading
                  ? POS.loadingReceipt.fr
                  : undefined
            }
          >
            <Printer className="h-4 w-4" />
            {POS.browserPrintFallback.fr}
          </Button>
          <Button
            variant="primary"
            size="md"
            className="flex-1 gap-2"
            onClick={startNewSale}
            autoFocus
          >
            <ShoppingCart className="h-4 w-4" />
            {POS.newSale.fr}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
