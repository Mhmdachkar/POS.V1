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

import { useState, type ReactNode } from 'react'
import { toastSuccessBi, toastErrorFromCode } from '@/lib/bilingual/toast'
import { SALES } from '@/lib/bilingual/sales'
import { COMMON } from '@/lib/bilingual/common'
import { POS } from '@/lib/bilingual/pos'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { BilingualText } from '@/components/ui/BilingualText'
import { BiModalTitle as BiSectionTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { PackageCheck, Printer, RotateCcw, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Drawer, Button, MoneyDisplay, Skeleton, SaleStatusBadge } from '@/components/ui'
import { formatDateTime } from '@/lib/formatters'
import { buildReceiptHtml, printReceiptHtml, receiptDataFromSaleDetail } from '@/lib/receiptHtml'
import { useSaleDetail } from '@/hooks/useSales'
import { useQueryClient } from '@tanstack/react-query'
import { settingsKeys } from '@/hooks/useBusinessSettings'
import { depotOptionKeys } from '@/hooks/useInventory'
import { invalidateAfterFulfillmentRelease, invalidateAfterSaleSettled } from '@/lib/cacheInvalidation'
import { printJobStatusLabel } from '@/lib/printJobStatus'
import { useDepotStore } from '@/stores/depotStore'
import { useAuthStore } from '@/stores/authStore'
import { releaseSaleFulfillment, requeuePrintJob, usePrintJobsForSale } from '@/hooks/usePrintJobs'
import { getErrorMessage } from '@/lib/errors'
import type { BusinessSettings } from '@/types/database'
import type { SaleDetailData } from '@/hooks/useSales'
import { ReturnModal } from './ReturnModal'
import { VoidModal } from './VoidModal'
import { t } from '@/lib/bilingual/types'
import { APP_BUSINESS_FALLBACK } from '@/lib/formatters'
import { formatSoldQuantityDetail } from '@/lib/saleQuantityDisplay'
import { SaleUnitBadge } from '@/components/sales/SaleUnitBadge'


// ─────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: ReactNode }) {
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

function SalePrintReceipt({
  sale,
  businessName,
  depotName,
}: {
  sale: SaleDetailData
  businessName: string
  depotName: string | null
}) {
  const handlePrint = () => {
    printReceiptHtml(
      buildReceiptHtml(receiptDataFromSaleDetail(sale, businessName, depotName)),
      'vhm-receipt-drawer',
    )
  }

  return (
    <Button variant="secondary" className="w-full gap-2" onClick={handlePrint}>
      <Printer className="h-4 w-4" />
      {t(SALES.browserPrintFallback)}
    </Button>
  )
}

function SaleFulfillmentPanel({ sale }: { sale: SaleDetailData }) {
  const staff = useAuthStore((s) => s.staff)
  const queryClient = useQueryClient()
  const saleId = sale.id
  const { data: jobs, isLoading } = usePrintJobsForSale(saleId)
  const [releasing, setReleasing] = useState(false)

  const canRelease =
    staff?.role === 'depot_staff' || staff?.role === 'admin'
  const fulfillment = sale.fulfillment
  const depotJob = jobs?.find((j) => j.destination === 'depot')
  const cashierJob = jobs?.find((j) => j.destination === 'cashier')

  async function handleRelease() {
    setReleasing(true)
    try {
      const result = await releaseSaleFulfillment(saleId)
      if (result.error) {
        toastErrorFromCode(result.error.code)
        return
      }
      toastSuccessBi(result.data?.idempotent ? SALES.alreadyReleased : SALES.orderReleased)
      invalidateAfterFulfillmentRelease(queryClient, saleId)
    } finally {
      setReleasing(false)
    }
  }

  async function handleRequeueDepot() {
    if (!depotJob) return
    const result = await requeuePrintJob(depotJob.id)
    if (result.error) {
      toastErrorFromCode(result.error.code)
      return
    }
    toastSuccessBi(SALES.printRequeued)
    queryClient.invalidateQueries({ queryKey: ['print_jobs', 'sale', saleId] })
  }

  if (!fulfillment && isLoading) return null

  return (
    <>
      <SectionHeader title={<BiSectionTitle {...SALES.fulfillmentSection} />} />
      {fulfillment ? (
        fulfillment.status === 'released' ? (
          <>
            <DetailRow
              label={t(SALES.releasedBy)}
              value={fulfillment.released_by_name ?? '—'}
              bold
            />
            <DetailRow
              label={t(SALES.releasedAt)}
              value={
                fulfillment.released_at
                  ? formatDateTime(fulfillment.released_at)
                  : '—'
              }
            />
          </>
        ) : (
          <DetailRow label={t(SALES.releaseStatus)} value={t(SALES.pendingRelease)} bold />
        )
      ) : (
        <p className="text-sm text-text-muted">{t(SALES.noFulfillmentRecord)}</p>
      )}

      {canRelease && fulfillment?.status === 'pending' && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-text-muted leading-snug">{t(SALES.releaseOrderHint)}</p>
          <Button
            variant="primary"
            className="w-full gap-2"
            disabled={releasing}
            onClick={() => void handleRelease()}
          >
            <PackageCheck className="h-4 w-4" />
            {t(SALES.releaseOrder)}
          </Button>
        </div>
      )}

      <SectionHeader title={<BiSectionTitle {...SALES.printStatus} />} />
      {isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <div className="space-y-2 text-sm">
          {cashierJob && (staff?.role === 'admin' || staff?.role === 'cashier') && (
            <DetailRow
              label={t(SALES.customerReceipt)}
              value={printJobStatusLabel(cashierJob.status)}
            />
          )}
          {depotJob && (staff?.role === 'admin' || staff?.role === 'depot_staff') && (
            <>
              <DetailRow
                label={t(SALES.depotOrder)}
                value={printJobStatusLabel(depotJob.status)}
              />
              {(staff?.role === 'depot_staff' || staff?.role === 'admin') && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => void handleRequeueDepot()}
                >
                  {t(SALES.reprintDepot)}
                </Button>
              )}
            </>
          )}
          {!cashierJob && !depotJob && (
            <p className="text-text-muted">{t(SALES.noPrintJobs)}</p>
          )}
        </div>
      )}
    </>
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
  const staffRole = useAuthStore((s) => s.staff?.role)
  const canMutateSale = staffRole === 'cashier' || staffRole === 'admin'
  const depotName = useDepotStore((s) => s.currentDepotName)
  const businessName =
    queryClient.getQueryData<BusinessSettings>(settingsKeys.current)?.business_name ?? APP_BUSINESS_FALLBACK

  const { data: sale, isLoading, isError } = useSaleDetail(saleId)

  const handleMutationSuccess = () => {
    if (!saleId) return
    invalidateAfterSaleSettled(queryClient, {
      saleId,
      customerId: sale?.customer_id,
      shiftId: sale?.shift_id ?? shiftId,
    })
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
        title={sale ? sale.receipt_number : t(SALES.saleDetails)}
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
          <p className="text-sm text-danger-foreground">{t(SALES.failedDetail)}</p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-4">
              <SaleStatusBadge status={sale.status} />
            </div>

            {/* Sale info */}
            <SectionHeader title={<BiSectionTitle {...SALES.saleInfo} />} />
            <DetailRow label={t(SALES.receiptNumber)} value={<span className="font-mono">{sale.receipt_number}</span>} />
            <DetailRow label={t(COMMON.date)} value={formatDateTime(sale.created_at)} />
            <DetailRow
              label={t(SALES.soldBy)}
              value={
                <span className="inline-flex items-center gap-2">
                  <span>{sale.cashier_name ?? '—'}</span>
                  {sale.cashier_role === 'admin' ? (
                    <span className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      <BilingualText {...SALES.sellerAdmin} variant="caption" layout="inline" />
                    </span>
                  ) : sale.cashier_role === 'cashier' ? (
                    <span className="text-xs font-medium text-text-secondary bg-surface-muted px-1.5 py-0.5 rounded">
                      <BilingualText {...SALES.sellerCashier} variant="caption" layout="inline" />
                    </span>
                  ) : null}
                </span>
              }
            />
            {sale.customer_name && (
              <>
                <DetailRow label={t(COMMON.customer)} value={sale.customer_name} bold />
                {sale.customer_phone && (
                  <DetailRow label={t(CUSTOMERS.phone)} value={sale.customer_phone} />
                )}
                {sale.customer_balance_owed_cfa != null && (
                  <DetailRow
                    label={t(SALES.currentBalance)}
                    value={
                      <MoneyDisplay
                        amount={sale.customer_balance_owed_cfa}
                        size="small"
                        danger={sale.customer_balance_owed_cfa > 0}
                      />
                    }
                  />
                )}
              </>
            )}

            {/* Items */}
            <SectionHeader title={<BiSectionTitle {...SALES.items} />} />
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-text-secondary">
                      <BiTableHeader {...SALES.colProduct} />
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-text-secondary">
                      <BiTableHeader {...SALES.soldAs} />
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-text-secondary">
                      <BiTableHeader {...SALES.qtySold} />
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-text-secondary">
                      <BiTableHeader {...SALES.unitPrice} />
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-text-secondary">
                      <BiTableHeader {...SALES.lineTotal} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <p className="font-medium text-text-primary">{item.product_name}</p>
                      </td>
                      <td className="px-3 py-2">
                        <SaleUnitBadge unitLevel={item.unit_level} unitName={item.unit_name} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <p className="text-sm font-semibold text-text-primary tabular-nums">
                          {formatSoldQuantityDetail(
                            item.quantity_in_unit,
                            item.unit_name,
                            item.unit_level,
                            item.quantity_pieces,
                          )}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MoneyDisplay
                          amount={item.unit_price_cfa}
                          size="small"
                          className="text-text-secondary"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        <MoneyDisplay amount={item.line_total_cfa} size="small" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financials */}
            <SectionHeader title={<BiSectionTitle {...SALES.financials} />} />
            <DetailRow
              label={t(POS.subtotal)}
              value={<MoneyDisplay amount={sale.subtotal_cfa} size="small" />}
            />
            {sale.discount_amount_cfa > 0 && (
              <DetailRow
                label={
                  sale.discount_type === 'flat'
                    ? t(SALES.flatDiscount)
                    : `${t(SALES.percentDiscount)} (${sale.discount_value}%)`
                }
                value={
                  <MoneyDisplay
                    amount={-sale.discount_amount_cfa}
                    size="small"
                    className="text-success-foreground"
                  />
                }
              />
            )}
            {sale.admin_override_total_cfa != null ? (
              <>
                <DetailRow
                  label={t(SALES.calculatedTotal)}
                  value={<MoneyDisplay amount={sale.total_cfa} size="small" className="text-text-secondary line-through" />}
                />
                <DetailRow
                  label={t(SALES.adjustedTotal)}
                  value={<MoneyDisplay amount={sale.admin_override_total_cfa} size="medium" />}
                  bold
                />
                <p className="text-xs text-warning-foreground mt-0.5">
                  <BilingualText {...SALES.adminOverrideNote} variant="caption" layout="inline" />
                </p>
              </>
            ) : (
              <DetailRow
                label={t(COMMON.total)}
                value={<MoneyDisplay amount={sale.total_cfa} size="medium" />}
              />
            )}
            <DetailRow
              label={t(SALES.cashReceived)}
              value={<MoneyDisplay amount={sale.amount_tendered_cfa} size="small" />}
            />
            <DetailRow
              label={t(SALES.amountApplied)}
              value={<MoneyDisplay amount={sale.amount_applied_cfa} size="small" />}
            />
            {sale.change_given_cfa > 0 && (
              <DetailRow
                label={t(POS.change)}
                value={
                  <MoneyDisplay
                    amount={sale.change_given_cfa}
                    size="small"
                    className="text-success-foreground"
                  />
                }
              />
            )}
            {sale.balance_added_cfa > 0 && (
              <DetailRow
                label={t(SALES.balanceAdded)}
                value={
                  <MoneyDisplay
                    amount={sale.balance_added_cfa}
                    size="small"
                    danger
                  />
                }
              />
            )}

            {/* Return history */}
            {sale.returns.length > 0 && (
              <>
                <SectionHeader title={<BiSectionTitle {...SALES.returns} />} />
                <div className="space-y-2">
                  {sale.returns.map((ret) => (
                    <div
                      key={ret.id}
                      className="rounded-md border border-border p-3 text-sm space-y-1"
                    >
                      <div className="flex justify-between">
                        <span className="text-text-secondary">{formatDateTime(ret.created_at)}</span>
                        <MoneyDisplay amount={ret.refund_amount_cfa} size="small" />
                      </div>
                      <div className="flex justify-between text-xs text-text-muted">
                        <span className="inline-flex items-baseline gap-1">
                          Cash:
                          <MoneyDisplay amount={ret.cash_refunded_cfa} size="small" />
                        </span>
                        <span className="inline-flex items-baseline gap-1">
                          Balance:
                          <MoneyDisplay amount={ret.balance_adjustment_cfa} size="small" />
                        </span>
                      </div>
                      {ret.reason && (
                        <p className="text-xs text-text-secondary italic">{ret.reason}</p>
                      )}
                      {ret.sale_return_items.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-border pt-2">
                          {ret.sale_return_items.map((ri) => {
                            const line = sale.items.find((i) => i.id === ri.sale_item_id)
                            if (!line) return null
                            return (
                              <li
                                key={ri.id}
                                className="flex items-center justify-between gap-2 text-xs text-text-primary"
                              >
                                <span className="min-w-0 truncate">{line.product_name}</span>
                                <span className="flex items-center gap-1.5 flex-shrink-0">
                                  <SaleUnitBadge
                                    unitLevel={line.unit_level}
                                    unitName={line.unit_name}
                                    className="text-[10px] px-1.5 py-0"
                                  />
                                  <span className="tabular-nums font-medium">
                                    {formatSoldQuantityDetail(
                                      ri.quantity_in_unit,
                                      line.unit_name,
                                      line.unit_level,
                                      ri.quantity_pieces,
                                    )}
                                  </span>
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Void info */}
            {sale.status === 'voided' && (
              <>
                <SectionHeader title={<BiSectionTitle {...SALES.voidSale} />} />
                <div className="rounded-md bg-surface-muted border border-border p-3 text-sm">
                  <p className="text-text-secondary">{t(SALES.saleVoidedBanner)}</p>
                </div>
              </>
            )}

            {sale.status !== 'voided' && <SaleFulfillmentPanel sale={sale} />}

            <SectionHeader title={<BiSectionTitle {...COMMON.actions} />} />
            <div className="space-y-2">
              {(staffRole === 'cashier' || staffRole === 'admin') && (
              <SalePrintReceipt
                sale={sale}
                businessName={businessName}
                depotName={
                  queryClient.getQueryData<Array<{ id: string; name: string }>>(depotOptionKeys.all)
                    ?.find((d) => d.id === sale.depot_id)?.name
                  ?? depotName
                }
              />
              )}
              {canMutateSale && canReturn && (
                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  onClick={() => setShowReturn(true)}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t(SALES.returnTitle)}
                </Button>
              )}
              {canMutateSale && canVoid && (
                <Button
                  variant="danger"
                  className="w-full gap-2"
                  onClick={() => setShowVoid(true)}
                >
                  <XCircle className="h-4 w-4" />
                  {t(SALES.voidSale)}
                </Button>
              )}
            </div>
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
