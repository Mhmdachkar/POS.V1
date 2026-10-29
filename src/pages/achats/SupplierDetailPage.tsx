import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Pencil, Plus, Truck } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Badge,
  Button,
  EmptyState,
  LoadingButton,
  MoneyDisplay,
  Skeleton,
  Tabs,
  type TabItem,
} from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import {
  BiButtonInline,
  BiButtonStack,
  BiEmptyDescription,
  BiEmptyTitle,
  BiTabLabel,
  BiTableHeader,
} from '@/lib/bilingual/ui'
import { ACHATS } from '@/lib/bilingual/achats'
import { COMMON } from '@/lib/bilingual/common'
import { t } from '@/lib/bilingual/types'
import { formatReportDate, formatReportDateTime } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import { toastErrorFromCode } from '@/lib/bilingual/toast'
import {
  useSupplierDetail,
  useSupplierLedger,
  useSupplierPaymentList,
  useSupplierReceiptList,
  type PurchaseReceiptRow,
  type SupplierPaymentRow,
  type SupplierRow,
} from '@/hooks/useAchats'
import { supplierLedgerAccountBalanceCfa, type SupplierLedgerRpcRow } from '@/lib/supplierLedger'
import { exportSupplierStatement } from '@/lib/loadSupplierStatement'
import { reprintSupplierPaymentSlip } from '@/lib/supplierPaymentDocument'
import { useDepotStore } from '@/stores/depotStore'
import { SupplierFormModal } from './components/SupplierFormModal'
import { RecordSupplierPaymentModal } from './components/RecordSupplierPaymentModal'
import { PurchaseReceiptDetailDrawer } from './components/PurchaseReceiptDetailDrawer'

type DetailTab = 'receipts' | 'payments' | 'movements'

const RECEIPT_GRID =
  'grid-cols-[minmax(8rem,11rem)_minmax(5.5rem,6.5rem)_minmax(5rem,7rem)_minmax(5rem,7rem)_minmax(6rem,7.5rem)]'
const PAY_GRID = 'grid-cols-[minmax(7rem,10rem)_minmax(7rem,9rem)_6.5rem_5.5rem_minmax(6rem,1fr)_2.75rem]'
const MOVE_GRID =
  'grid-cols-[6.5rem_minmax(6rem,9rem)_minmax(5rem,7rem)_minmax(7rem,1.4fr)_6.5rem_6.5rem_6.5rem]'

function statusLabel(status: PurchaseReceiptRow['status']) {
  if (status === 'validated') return ACHATS.validated
  if (status === 'cancelled') return ACHATS.cancelled
  return ACHATS.draft
}

function statusVariant(status: PurchaseReceiptRow['status']): 'neutral' | 'success' | 'danger' {
  if (status === 'validated') return 'success'
  if (status === 'cancelled') return 'danger'
  return 'neutral'
}

function methodLabel(m: string) {
  if (m === 'mobile') return ACHATS.mobile
  if (m === 'bank') return ACHATS.bank
  return ACHATS.cash
}

function movementTypeLabel(kind: SupplierLedgerRpcRow['kind']) {
  if (kind === 'purchase') return ACHATS.receipts
  if (kind === 'payment') return ACHATS.payments
  return ACHATS.cancelled
}

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<DetailTab>('receipts')
  const [editOpen, setEditOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const depotId = useDepotStore((s) => s.currentDepotId)

  const { data: supplier, isLoading, isError } = useSupplierDetail(id ?? null)
  const ledgerQ = useSupplierLedger(id ?? null)
  const receiptsQ = useSupplierReceiptList(id ?? null)
  const paymentsQ = useSupplierPaymentList(id ?? null)

  const ledger = ledgerQ.data ?? []
  const accountBalanceCfa = ledgerQ.isSuccess
    ? supplierLedgerAccountBalanceCfa(ledger)
    : (supplier?.balance_owed_cfa ?? 0)
  const soldeLoading = ledgerQ.isLoading && !ledgerQ.data
  const receipts = (receiptsQ.data?.rows ?? []).filter((r) => r.status !== 'draft')
  const payments = paymentsQ.data?.rows ?? []
  const movementsNewestFirst = useMemo(() => [...ledger].reverse(), [ledger])

  const tabs: TabItem[] = useMemo(
    () => [
      { value: 'receipts', label: <BiTabLabel {...ACHATS.receipts} /> },
      { value: 'payments', label: <BiTabLabel {...ACHATS.payments} /> },
      { value: 'movements', label: <BiTabLabel {...ACHATS.movements} /> },
    ],
    [],
  )

  const editSupplier: SupplierRow | null = supplier
    ? {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        address: supplier.address,
        balance_owed_cfa: supplier.balance_owed_cfa,
        is_active: supplier.is_active,
        created_at: supplier.created_at,
        updated_at: supplier.updated_at,
        email: supplier.email,
        notes: supplier.notes,
        payment_term_days: supplier.payment_term_days,
      }
    : null

  async function handlePrintPayment(row: SupplierPaymentRow) {
    if (!supplier) return
    try {
      await reprintSupplierPaymentSlip({
        receiptNumber: row.receipt_number || '\u2014',
        amountCfa: row.amount_cfa,
        methodLabel: t(methodLabel(row.method)),
        recordedAt: row.recorded_at,
        note: row.note,
        supplier: {
          name: supplier.name,
          phone: supplier.phone,
          address: supplier.address,
        },
      })
    } catch (err) {
      const parsed = parseError(err)
      toastErrorFromCode(parsed.code, parsed.details)
    }
  }

  async function handleStatement() {
    if (!supplier) return
    setExportError('')
    setExporting(true)
    try {
      await exportSupplierStatement({
        supplier,
        depotId,
        periodFromYmd: periodFrom || null,
        periodToYmd: periodTo || null,
      })
    } catch (err) {
      setExportError(parseError(err).message || t(ACHATS.statementFailed))
    } finally {
      setExporting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (isError || !supplier) {
    return (
      <div className="p-8">
        <EmptyState
          icon={<Truck className="h-8 w-8" />}
          title={<BiEmptyTitle {...ACHATS.supplierNotFound} />}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface px-3 sm:px-6 py-3 space-y-3">
        <Link
          to="/achats/fournisseurs"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          <BiButtonInline {...ACHATS.backToSuppliers} />
        </Link>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary truncate">{supplier.name}</h2>
              <Badge variant={supplier.is_active ? 'success' : 'neutral'}>
                <BilingualText
                  {...(supplier.is_active ? ACHATS.active : ACHATS.inactive)}
                  variant="caption"
                  layout="inline"
                />
              </Badge>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-text-secondary">{t(ACHATS.phone)}</dt>
                <dd>{supplier.phone || '\u2014'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-secondary">{t(ACHATS.email)}</dt>
                <dd className="truncate">{supplier.email || '\u2014'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-secondary">{t(ACHATS.paymentTerm)}</dt>
                <dd>
                  {supplier.payment_term_days == null
                    ? '\u2014'
                    : `${supplier.payment_term_days} ${t(ACHATS.days)}`}
                </dd>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <dt className="text-text-secondary">{t(ACHATS.address)}</dt>
                <dd>{supplier.address || '\u2014'}</dd>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <dt className="text-text-secondary">{t(ACHATS.notes)}</dt>
                <dd>{supplier.notes || '\u2014'}</dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-col items-stretch sm:items-end gap-2">
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {t(ACHATS.balance)}
              </p>
              {soldeLoading ? (
                <span className="text-base tabular-nums text-text-muted" aria-busy="true">
                  …
                </span>
              ) : (
                <MoneyDisplay
                  amount={accountBalanceCfa}
                  size="large"
                  danger={accountBalanceCfa > 0}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                <BiButtonStack {...COMMON.edit} />
              </Button>
              {supplier.balance_owed_cfa > 0 && (
                <Button type="button" size="sm" onClick={() => setPayOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  <BiButtonStack {...ACHATS.recordPayment} />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px rounded-md border border-border bg-border overflow-hidden">
          <div className="bg-surface px-3 py-2.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              {t(ACHATS.purchased)}
            </p>
            <MoneyDisplay amount={Number(supplier.purchased_cfa) || 0} size="small" className="mt-1" />
          </div>
          <div className="bg-surface px-3 py-2.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              {t(ACHATS.paidTotal)}
            </p>
            <MoneyDisplay amount={Number(supplier.paid_cfa) || 0} size="small" className="mt-1" />
          </div>
          <div className="bg-surface px-3 py-2.5 text-center col-span-2 sm:col-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              {t(ACHATS.balance)}
            </p>
            <MoneyDisplay
              amount={accountBalanceCfa}
              size="small"
              danger={accountBalanceCfa > 0}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-text-secondary flex items-center gap-1">
              <span>{t(ACHATS.statementPeriodFrom)}</span>
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              />
            </label>
            <label className="text-xs text-text-secondary flex items-center gap-1">
              <span>{t(ACHATS.statementPeriodTo)}</span>
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-col items-end gap-1">
            <LoadingButton
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              loading={exporting}
              disabled={exporting}
              onClick={() => { void handleStatement() }}
            >
              <FileText className="h-3.5 w-3.5" />
              <BiButtonInline {...ACHATS.statementPdf} />
            </LoadingButton>
            {exportError && (
              <p className="text-xs text-danger-foreground max-w-xs text-right">{exportError}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-3 sm:px-6">
        <Tabs tabs={tabs} active={tab} onChange={(v) => setTab(v as DetailTab)} />
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'receipts' && (
          receiptsQ.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : receipts.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<Truck className="h-8 w-8" />}
                title={<BiEmptyTitle {...ACHATS.emptySupplierReceipts} />}
              />
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'sticky top-0 z-10 grid gap-3 px-4 py-2 bg-surface-muted border-b border-border text-xs font-semibold text-text-secondary',
                  RECEIPT_GRID,
                )}
              >
                <BiTableHeader {...ACHATS.number} />
                <BiTableHeader {...ACHATS.status} />
                <BiTableHeader {...ACHATS.date} />
                <BiTableHeader {...ACHATS.paymentMode} />
                <span className="text-right">
                  <BiTableHeader {...ACHATS.total} />
                </span>
              </div>
              {receipts.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={cn(
                    'w-full grid gap-3 px-4 py-3 bg-surface border-b border-border items-center text-left',
                    RECEIPT_GRID,
                  )}
                  onClick={() => setReceiptId(row.id)}
                >
                  <span className="text-sm font-medium truncate">{row.number}</span>
                  <Badge variant={statusVariant(row.status)}>
                    <BilingualText {...statusLabel(row.status)} variant="caption" layout="inline" />
                  </Badge>
                  <span className="text-sm text-text-secondary tabular-nums">
                    {formatReportDate(row.document_date)}
                  </span>
                  <span className="text-sm text-text-secondary">
                    {row.payment_mode
                      ? t(row.payment_mode === 'paid' ? ACHATS.paid : ACHATS.credit)
                      : '\u2014'}
                  </span>
                  <MoneyDisplay amount={row.total_cfa} className="justify-self-end text-sm" />
                </button>
              ))}
            </>
          )
        )}

        {tab === 'payments' && (
          paymentsQ.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<Truck className="h-8 w-8" />}
                title={<BiEmptyTitle {...ACHATS.emptyPayments} />}
              />
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'sticky top-0 z-10 grid gap-3 px-4 py-2 bg-surface-muted border-b border-border text-xs font-semibold text-text-secondary',
                  PAY_GRID,
                )}
              >
                <BiTableHeader {...ACHATS.receiptNumber} />
                <BiTableHeader {...ACHATS.recordedAt} />
                <span className="text-right">
                  <BiTableHeader {...ACHATS.amount} />
                </span>
                <BiTableHeader {...ACHATS.method} />
                <BiTableHeader {...ACHATS.note} />
                <span />
              </div>
              {payments.map((row) => (
                <div
                  key={row.id}
                  className={cn('grid gap-3 px-4 py-3 bg-surface border-b border-border items-center', PAY_GRID)}
                >
                  <span className="font-mono text-xs tabular-nums truncate">
                    {row.receipt_number || '\u2014'}
                  </span>
                  <span className="text-sm text-text-secondary tabular-nums">
                    {formatReportDateTime(row.recorded_at)}
                  </span>
                  <MoneyDisplay amount={row.amount_cfa} className="justify-self-end text-sm font-medium" />
                  <Badge variant="neutral">
                    <BilingualText {...methodLabel(row.method)} variant="caption" layout="inline" />
                  </Badge>
                  <span className="text-sm text-text-secondary truncate">{row.note || '\u2014'}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-self-end px-2"
                    onClick={() => void handlePrintPayment(row)}
                    title={t(ACHATS.printPaymentSlip)}
                  >
                    <FileText className="h-4 w-4" />
                    <span className="sr-only">{t(ACHATS.printPaymentSlip)}</span>
                  </Button>
                </div>
              ))}
            </>
          )
        )}

        {tab === 'movements' && (
          ledgerQ.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : ledgerQ.isError ? (
            <div className="p-8">
              <EmptyState
                icon={<Truck className="h-8 w-8" />}
                title={<BiEmptyTitle {...ACHATS.failedToLoad} />}
                description={<BiEmptyDescription {...COMMON.checkConnection} />}
              />
            </div>
          ) : movementsNewestFirst.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<Truck className="h-8 w-8" />}
                title={<BiEmptyTitle {...ACHATS.emptyMovements} />}
              />
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'sticky top-0 z-10 grid gap-3 px-4 py-2 bg-surface-muted border-b border-border text-xs font-semibold text-text-secondary',
                  MOVE_GRID,
                )}
              >
                <BiTableHeader {...ACHATS.date} />
                <BiTableHeader {...ACHATS.number} />
                <BiTableHeader {...COMMON.type} />
                <BiTableHeader {...ACHATS.label} />
                <span className="text-right">
                  <BiTableHeader {...ACHATS.debit} />
                </span>
                <span className="text-right">
                  <BiTableHeader {...ACHATS.creditCol} />
                </span>
                <span className="text-right">
                  <BiTableHeader {...ACHATS.solde} />
                </span>
              </div>
              {movementsNewestFirst.map((row) => {
                const amount = Number(row.amount_cfa)
                const credit = amount > 0 ? amount : 0
                const debit = amount < 0 ? Math.abs(amount) : 0
                return (
                  <div
                    key={row.id}
                    className={cn(
                      'grid gap-3 px-4 py-3 bg-surface border-b border-border items-center text-sm',
                      MOVE_GRID,
                    )}
                  >
                    <span className="tabular-nums text-text-secondary">
                      {formatReportDateTime(row.occurred_at)}
                    </span>
                    <span className="truncate font-medium">{row.reference || '\u2014'}</span>
                    <span className="text-text-secondary">{t(movementTypeLabel(row.kind))}</span>
                    <span className="truncate text-text-secondary">{row.detail || '\u2014'}</span>
                    <span className="justify-self-end tabular-nums">
                      {debit ? <MoneyDisplay amount={debit} className="text-sm" /> : ''}
                    </span>
                    <span className="justify-self-end tabular-nums">
                      {credit ? <MoneyDisplay amount={credit} className="text-sm" /> : ''}
                    </span>
                    <MoneyDisplay
                      amount={Number(row.running_balance_cfa)}
                      className="justify-self-end text-sm"
                      danger={Number(row.running_balance_cfa) > 0}
                    />
                  </div>
                )
              })}
            </>
          )
        )}
      </div>

      <SupplierFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        supplier={editSupplier}
      />
      <RecordSupplierPaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        supplier={editSupplier}
      />
      <PurchaseReceiptDetailDrawer receiptId={receiptId} onClose={() => setReceiptId(null)} />
    </div>
  )
}
