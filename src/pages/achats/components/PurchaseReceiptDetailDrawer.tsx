import { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  LoadingButton,
  MoneyDisplay,
  Skeleton,
} from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { BiButtonStack, BiModalTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { ACHATS } from '@/lib/bilingual/achats'
import { COMMON } from '@/lib/bilingual/common'
import { formatReportDate } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import { toastErrorBi, toastErrorFromCode, toastSuccessBi } from '@/lib/bilingual/toast'
import { bilingualPlain, t } from '@/lib/bilingual/types'
import { cn } from '@/lib/cn'
import {
  useCancelPurchaseReceipt,
  usePurchaseReceiptDetail,
  useValidatePurchaseReceipt,
  type PurchaseReceiptRow,
} from '@/hooks/useAchats'

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

interface Props {
  receiptId: string | null
  onClose: () => void
  onEditDraft?: (id: string) => void
}

export function PurchaseReceiptDetailDrawer({ receiptId, onClose }: Props) {
  const { data, isLoading, isError } = usePurchaseReceiptDetail(receiptId)
  const validate = useValidatePurchaseReceipt()
  const cancel = useCancelPurchaseReceipt()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [method, setMethod] = useState<'cash' | 'mobile' | 'bank' | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setMethod(null)
    setCancelOpen(false)
    setBusy(false)
  }, [receiptId])

  const receipt = data?.receipt
  const items = data?.items ?? []
  const isDraft = receipt?.status === 'draft'
  const isValidated = receipt?.status === 'validated'

  async function handleValidate(mode: 'paid' | 'credit') {
    if (!receipt) return
    if (mode === 'paid' && !method) {
      toastErrorBi(ACHATS.choosePaymentMethod)
      return
    }
    setBusy(true)
    try {
      await validate.mutateAsync({
        p_purchase_receipt_id: receipt.id,
        p_payment_mode: mode,
        p_payment_method: mode === 'paid' ? method : null,
      })
      toastSuccessBi(ACHATS.validatedOk)
    } catch (err) {
      const parsed = parseError(err)
      toastErrorFromCode(parsed.code, parsed.details)
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    if (!receipt) return
    setBusy(true)
    try {
      await cancel.mutateAsync(receipt.id)
      toastSuccessBi(ACHATS.cancelledOk)
      setCancelOpen(false)
      onClose()
    } catch (err) {
      const parsed = parseError(err)
      toastErrorFromCode(parsed.code, parsed.details)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Drawer open={!!receiptId} onClose={onClose} title={receipt?.number ?? t(ACHATS.receipts)} width="lg">
        {isLoading ? (
          <div className="space-y-3 p-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError || !receipt ? (
          <p className="text-sm text-danger-foreground">{t(ACHATS.failedToLoad)}</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(receipt.status)}>
                <BilingualText {...statusLabel(receipt.status)} variant="caption" layout="inline" />
              </Badge>
              <span className="text-sm text-text-secondary tabular-nums">
                {formatReportDate(receipt.document_date)}
              </span>
              {receipt.external_ref && (
                <span className="text-sm text-text-muted">Réf. {receipt.external_ref}</span>
              )}
            </div>

            <div className="rounded-md bg-surface-muted px-3 py-2 text-sm space-y-1">
              <p className="font-medium">{data?.supplier?.name ?? '\u2014'}</p>
              {receipt.payment_mode && (
                <p className="text-text-secondary">
                  {t(receipt.payment_mode === 'paid' ? ACHATS.paid : ACHATS.credit)}
                  {receipt.payment_method
                    ? ` · ${t(
                        receipt.payment_method === 'mobile'
                          ? ACHATS.mobile
                          : receipt.payment_method === 'bank'
                            ? ACHATS.bank
                            : ACHATS.cash,
                      )}`
                    : ''}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_4rem_5rem_5.5rem] gap-2 text-xs font-semibold text-text-secondary">
                <BiTableHeader {...ACHATS.product} />
                <BiTableHeader {...ACHATS.qty} />
                <BiTableHeader {...ACHATS.unitCost} />
                <span className="text-right">
                  <BiTableHeader {...ACHATS.lineTotal} />
                </span>
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_4rem_5rem_5.5rem] gap-2 items-center text-sm border-b border-border py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.product_name}</p>
                    <p className="text-xs text-text-muted">{item.unit_name}</p>
                  </div>
                  <span className="tabular-nums">{item.quantity_in_unit}</span>
                  <MoneyDisplay amount={item.unit_cost_cfa} className="text-sm" />
                  <MoneyDisplay amount={item.line_total_cfa} className="justify-self-end text-sm font-medium" />
                </div>
              ))}
              <div className="flex justify-between pt-2">
                <span className="text-sm text-text-secondary">{t(ACHATS.total)}</span>
                <MoneyDisplay amount={receipt.total_cfa} className="text-base font-semibold" />
              </div>
            </div>

            {isDraft && (
              <div className="space-y-3 border-t border-border pt-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-text-secondary">
                    {t(ACHATS.method)} — {t(ACHATS.paid)}
                  </p>
                  <p className="text-xs text-text-muted">{t(ACHATS.choosePaymentMethod)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['cash', 'mobile', 'bank'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={cn(
                        'px-3 py-2 rounded-md text-sm border',
                        method === m
                          ? 'border-primary bg-primary-subtle'
                          : 'border-border text-text-secondary',
                      )}
                      onClick={() => setMethod(m)}
                    >
                      {t(m === 'mobile' ? ACHATS.mobile : m === 'bank' ? ACHATS.bank : ACHATS.cash)}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    title={!method ? bilingualPlain(ACHATS.choosePaymentMethod) : undefined}
                    className="inline-flex"
                  >
                    <LoadingButton
                      type="button"
                      loading={busy}
                      disabled={!method}
                      onClick={() => void handleValidate('paid')}
                    >
                      <BiButtonStack {...ACHATS.validatePaid} />
                    </LoadingButton>
                  </span>
                  <LoadingButton
                    type="button"
                    variant="secondary"
                    loading={busy}
                    onClick={() => void handleValidate('credit')}
                  >
                    <BiButtonStack {...ACHATS.validateCredit} />
                  </LoadingButton>
                  <Button type="button" variant="danger" onClick={() => setCancelOpen(true)}>
                    <BiButtonStack {...ACHATS.cancel} />
                  </Button>
                </div>
              </div>
            )}

            {isValidated && (
              <div className="border-t border-border pt-4">
                <Button type="button" variant="danger" onClick={() => setCancelOpen(true)}>
                  <BiButtonStack {...ACHATS.cancel} />
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void handleCancel()}
        title={<BiModalTitle {...ACHATS.cancel} />}
        message={<BilingualText {...ACHATS.cancelConfirm} variant="body" />}
        confirmLabel={<BiButtonStack {...ACHATS.cancel} />}
        cancelLabel={<BiButtonStack {...COMMON.cancel} />}
        variant="danger"
        isLoading={busy}
      />
    </>
  )
}
