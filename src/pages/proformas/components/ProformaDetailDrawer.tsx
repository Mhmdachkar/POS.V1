/**
 * Proforma detail drawer — print, WhatsApp, status, convert to POS cart.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Badge,
  Button,
  Drawer,
  LoadingButton,
  MoneyDisplay,
  Modal,
  Skeleton,
  ConfirmDialog,
} from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { BiButtonInline, BiButtonStack, BiModalTitle } from '@/lib/bilingual/ui'
import { PROFORMAS } from '@/lib/bilingual/proformas'
import { COMMON } from '@/lib/bilingual/common'
import { formatReportDate, formatCFA, APP_BUSINESS_FALLBACK } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import { toastErrorBi, toastErrorFromCode, toastSuccessBi, toastSuccessMessage } from '@/lib/bilingual/toast'
import { t } from '@/lib/bilingual/types'
import {
  useDuplicateProforma,
  useProformaDetail,
  useSetProformaStatus,
  type ProformaRow,
} from '@/hooks/useProformas'
import { useCustomer } from '@/hooks/useCustomers'
import { useDepotOptions } from '@/hooks/useInventory'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { exportProforma } from '@/lib/proformaDocument'
import {
  loadProformaIntoPosCart,
  prepareProformaConvert,
  type ProformaPriceMode,
} from '@/lib/loadProformaToCart'

function statusLabel(status: ProformaRow['status']) {
  switch (status) {
    case 'draft':
      return PROFORMAS.draft
    case 'sent':
      return PROFORMAS.sent
    case 'converted':
      return PROFORMAS.converted
    case 'cancelled':
      return PROFORMAS.cancelled
  }
}

function statusVariant(status: ProformaRow['status']): 'neutral' | 'info' | 'success' | 'danger' {
  switch (status) {
    case 'draft':
      return 'neutral'
    case 'sent':
      return 'info'
    case 'converted':
      return 'success'
    case 'cancelled':
      return 'danger'
  }
}

interface ProformaDetailDrawerProps {
  proformaId: string | null
  onClose: () => void
}

export function ProformaDetailDrawer({ proformaId, onClose }: ProformaDetailDrawerProps) {
  const navigate = useNavigate()
  const staff = useAuthStore((s) => s.staff)
  const isAdmin = staff?.role === 'admin'
  const depotName = useDepotStore((s) => s.currentDepotName)
  const { data: depots } = useDepotOptions()

  const { data, isLoading, isError } = useProformaDetail(proformaId)
  const setStatus = useSetProformaStatus()
  const duplicate = useDuplicateProforma()

  const customerId = data?.proforma.customer_id ?? null
  const { data: customer } = useCustomer(customerId)

  const [busy, setBusy] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [driftOpen, setDriftOpen] = useState(false)
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof prepareProformaConvert>> | null>(null)

  const depotMeta = useMemo(() => {
    const id = data?.proforma.depot_id
    return depots?.find((d) => d.id === id)
  }, [data?.proforma.depot_id, depots])

  const printCtx = useMemo(() => {
    if (!data) return null
    return {
      proforma: data.proforma,
      items: data.items,
      client: {
        name: customer?.name ?? t(PROFORMAS.walkIn),
        phone: customer?.phone ?? null,
        address: customer?.address ?? null,
      },
      header: {
        businessName: APP_BUSINESS_FALLBACK,
        depotName: depotMeta?.name ?? depotName,
        depotAddress: null as string | null,
      },
    }
  }, [data, customer, depotMeta, depotName])

  const canMutate =
    !!data && (data.proforma.status === 'draft' || data.proforma.status === 'sent')
  const canConvert = canMutate

  async function handleExport(mode: 'pdf' | 'whatsapp') {
    if (!printCtx) return
    try {
      exportProforma(printCtx, mode)
    } catch (err) {
      toastErrorBi(PROFORMAS.printBlocked)
      void err
    }
  }

  async function handleMarkSent() {
    if (!data) return
    try {
      await setStatus.mutateAsync({ p_proforma_id: data.proforma.id, p_status: 'sent' })
      toastSuccessBi(PROFORMAS.sent)
    } catch (err) {
      const parsed = parseError(err)
      toastErrorFromCode(parsed.code, parsed.details)
    }
  }

  async function handleCancel() {
    if (!data) return
    try {
      await setStatus.mutateAsync({ p_proforma_id: data.proforma.id, p_status: 'cancelled' })
      setCancelOpen(false)
      toastSuccessBi(PROFORMAS.cancelled)
    } catch (err) {
      const parsed = parseError(err)
      toastErrorFromCode(parsed.code, parsed.details)
    }
  }

  async function handleDuplicate() {
    if (!data) return
    try {
      const res = await duplicate.mutateAsync(data.proforma.id)
      toastSuccessMessage(
        `Proforma ${res.number}`,
        `Quote ${res.number}`,
      )
      onClose()
    } catch (err) {
      const parsed = parseError(err)
      toastErrorFromCode(parsed.code, parsed.details)
    }
  }

  async function runConvert(mode: ProformaPriceMode) {
    if (!data) return
    setBusy(true)
    try {
      await loadProformaIntoPosCart({
        proformaId: data.proforma.id,
        priceMode: mode,
        prepared: prepared ?? undefined,
      })
      setDriftOpen(false)
      onClose()
      navigate('/pos')
    } catch (err) {
      if (err instanceof Error && err.message === 'PROFORMA_NOT_CONVERTIBLE') {
        toastErrorBi(PROFORMAS.convertedDone)
      } else {
        const parsed = parseError(err)
        toastErrorFromCode(parsed.code, parsed.details)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleConvertClick() {
    if (!data) return
    setBusy(true)
    try {
      const prep = await prepareProformaConvert(data.proforma.id)
      setPrepared(prep)
      if (prep.blocked) {
        toastErrorBi(PROFORMAS.convertedDone)
        return
      }
      if (isAdmin && prep.hasDrift) {
        setDriftOpen(true)
        return
      }
      await loadProformaIntoPosCart({
        proformaId: data.proforma.id,
        priceMode: isAdmin ? 'quote' : 'catalog',
        prepared: prep,
      })
      onClose()
      navigate('/pos')
    } catch (err) {
      const parsed = parseError(err)
      toastErrorFromCode(parsed.code, parsed.details)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Drawer
        open={!!proformaId}
        onClose={onClose}
        title={data?.proforma.number ?? t(PROFORMAS.title)}
        description={
          data ? (
            <span className="inline-flex items-center gap-2">
              <Badge variant={statusVariant(data.proforma.status)}>
                <BilingualText {...statusLabel(data.proforma.status)} variant="caption" layout="inline" />
              </Badge>
              <span>{formatReportDate(data.proforma.document_date)}</span>
            </span>
          ) : undefined
        }
        width="lg"
      >
        {isLoading ? (
          <div className="space-y-3 p-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError || !data ? (
          <BilingualText {...PROFORMAS.failedToLoad} variant="body" />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">
              <BilingualText {...PROFORMAS.noStockMovement} variant="caption" />
            </p>

            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="flex justify-between gap-3 px-3 py-2 text-sm">
                <BilingualText {...PROFORMAS.customer} variant="caption" />
                <span className="font-medium">{customer?.name ?? t(PROFORMAS.walkIn)}</span>
              </div>
              <div className="flex justify-between gap-3 px-3 py-2 text-sm">
                <BilingualText {...PROFORMAS.total} variant="caption" />
                <MoneyDisplay amount={data.proforma.total_cfa} />
              </div>
              {data.proforma.external_ref ? (
                <div className="flex justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-text-secondary">Ref</span>
                  <span className="font-mono">{data.proforma.external_ref}</span>
                </div>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-left text-xs text-text-secondary">
                  <tr>
                    <th className="px-3 py-2">Article</th>
                    <th className="px-3 py-2 text-right">Qte</th>
                    <th className="px-3 py-2 text-right">P.U.</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="font-medium">{it.product_name}</div>
                        <div className="text-xs text-text-muted">{it.unit_name}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.quantity_in_unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCFA(it.unit_price_cfa)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatCFA(it.line_total_cfa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => { void handleExport('pdf') }}>
                <BiButtonInline {...PROFORMAS.printPdf} />
              </Button>
              <Button type="button" variant="secondary" onClick={() => { void handleExport('whatsapp') }}>
                <BiButtonInline {...PROFORMAS.whatsapp} />
              </Button>
              <Button type="button" variant="secondary" onClick={() => { void handleDuplicate() }} disabled={duplicate.isPending}>
                <BiButtonInline {...PROFORMAS.duplicate} />
              </Button>
              {canMutate && data.proforma.status === 'draft' && (
                <Button type="button" variant="secondary" onClick={() => { void handleMarkSent() }} disabled={setStatus.isPending}>
                  <BiButtonInline {...PROFORMAS.markSent} />
                </Button>
              )}
              {canMutate && (
                <Button type="button" variant="ghost" className="text-danger-foreground" onClick={() => setCancelOpen(true)}>
                  <BiButtonInline {...PROFORMAS.cancel} />
                </Button>
              )}
            </div>

            {canConvert && (
              <LoadingButton
                variant="primary"
                size="lg"
                className="w-full"
                loading={busy}
                onClick={() => { void handleConvertClick() }}
              >
                <BiButtonStack {...PROFORMAS.convert} />
              </LoadingButton>
            )}

            {data.proforma.status === 'converted' && data.proforma.converted_sale_id && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  onClose()
                  navigate('/sales')
                }}
              >
                <BiButtonInline {...PROFORMAS.openSale} />
              </Button>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => { void handleCancel() }}
        title={<BiModalTitle {...PROFORMAS.cancel} />}
        message={<BilingualText {...PROFORMAS.noStockMovement} variant="body" />}
        confirmLabel={<BiButtonStack {...PROFORMAS.cancel} />}
        variant="danger"
      />

      <Modal
        open={driftOpen}
        onClose={() => setDriftOpen(false)}
        title={<BiModalTitle {...PROFORMAS.priceDriftTitle} />}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => { void runConvert('catalog') }}
            >
              <BiButtonInline {...PROFORMAS.useCatalogPrices} />
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => { void runConvert('quote') }}
            >
              <BiButtonInline {...PROFORMAS.keepQuotePrices} />
            </Button>
          </>
        }
      >
        <BilingualText {...PROFORMAS.priceDriftBody} variant="body" />
      </Modal>
    </>
  )
}
