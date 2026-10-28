/**
 * Create a bon de livraison from a sale (partial OK).
 * Qty capped at sold − returned − already delivered (never negative).
 */

import { useEffect, useMemo, useState } from 'react'
import { Modal, Button, LoadingButton, Input } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { BiButtonStack, BiModalTitle } from '@/lib/bilingual/ui'
import { SALES } from '@/lib/bilingual/sales'
import { COMMON } from '@/lib/bilingual/common'
import { bilingualPlain, t } from '@/lib/bilingual/types'
import { toastErrorFromCode, toastSuccessMessage } from '@/lib/bilingual/toast'
import { parseError } from '@/lib/errors'
import { APP_BUSINESS_FALLBACK } from '@/lib/formatters'
import {
  useCreateDeliveryNote,
  useSaleDeliveryRemaining,
  fetchDeliveryNoteDetail,
  type DeliveryRemainingRow,
} from '@/hooks/useDeliveryNotes'
import { printDeliveryNotePdf } from '@/lib/deliveryNoteDocument'
import { useDepotStore } from '@/stores/depotStore'

interface DeliveryNoteModalProps {
  open: boolean
  onClose: () => void
  saleId: string
  receiptNumber: string
  onSuccess?: () => void
}

export function DeliveryNoteModal({
  open,
  onClose,
  saleId,
  receiptNumber,
  onSuccess,
}: DeliveryNoteModalProps) {
  const depotName = useDepotStore((s) => s.currentDepotName)
  const { data, isLoading, isError } = useSaleDeliveryRemaining(open ? saleId : null)
  const createNote = useCreateDeliveryNote()

  const [showPrices, setShowPrices] = useState(false)
  const [receivedBy, setReceivedBy] = useState('')
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!data?.rows) return
    const next: Record<string, number> = {}
    for (const row of data.rows) {
      next[row.sale_item_id] = Number(row.remaining_qty) > 0 ? Number(row.remaining_qty) : 0
    }
    setQtys(next)
  }, [data])

  const deliverableRows = useMemo(
    () => (data?.rows ?? []).filter((r) => Number(r.remaining_qty) > 0),
    [data],
  )

  const selectedItems = useMemo(() => {
    return deliverableRows
      .map((row) => ({
        sale_item_id: row.sale_item_id,
        quantity_in_unit: Number(qtys[row.sale_item_id] ?? 0),
        row,
      }))
      .filter((x) => x.quantity_in_unit > 0)
  }, [deliverableRows, qtys])

  const canSubmit = selectedItems.length > 0 && !submitting

  function setQty(row: DeliveryRemainingRow, value: number) {
    const max = Number(row.remaining_qty)
    const next = Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0
    setQtys((prev) => ({ ...prev, [row.sale_item_id]: next }))
  }

  function fillAll() {
    const next: Record<string, number> = {}
    for (const row of deliverableRows) {
      next[row.sale_item_id] = Number(row.remaining_qty)
    }
    setQtys(next)
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const created = await createNote.mutateAsync({
        p_sale_id: saleId,
        p_show_prices: showPrices,
        p_received_by_name: receivedBy.trim() || null,
        p_items: selectedItems.map((x) => ({
          sale_item_id: x.sale_item_id,
          quantity_in_unit: x.quantity_in_unit,
        })),
      })
      toastSuccessMessage(
        `${SALES.deliveryCreated.fr} ${created?.number ?? ''}`.trim(),
        `${SALES.deliveryCreated.en} ${created?.number ?? ''}`.trim(),
      )
      if (created?.id) {
        const detail = await fetchDeliveryNoteDetail(created.id)
        printDeliveryNotePdf({
          number: detail.note.number,
          documentDate: detail.note.document_date,
          showPrices: detail.note.show_prices,
          receivedByName: detail.note.received_by_name,
          receiptNumber: detail.receipt_number,
          client: {
            name: detail.customer?.name ?? t(SALES.saleInfo),
            phone: detail.customer?.phone ?? null,
            address: detail.customer?.address ?? null,
          },
          items: detail.items,
          header: {
            businessName: APP_BUSINESS_FALLBACK,
            depotName,
          },
        })
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      const parsed = parseError(err)
      toastErrorFromCode(parsed.code, parsed.details)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<BiModalTitle {...SALES.deliveryNote} />}
      description={`${receiptNumber}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            <BiButtonStack {...COMMON.cancel} />
          </Button>
          <LoadingButton
            variant="primary"
            loading={submitting}
            disabled={!canSubmit}
            onClick={() => { void handleSubmit() }}
          >
            <BiButtonStack {...SALES.createDeliveryNote} />
          </LoadingButton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          <BilingualText {...SALES.deliveryNoStock} variant="caption" />
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={showPrices ? 'primary' : 'secondary'}
            onClick={() => setShowPrices(true)}
          >
            <BiButtonStack {...SALES.deliveryWithPrices} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!showPrices ? 'primary' : 'secondary'}
            onClick={() => setShowPrices(false)}
          >
            <BiButtonStack {...SALES.deliveryWithoutPrices} />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={fillAll}>
            <BiButtonStack {...SALES.fillAllRemaining} />
          </Button>
        </div>

        <Input
          label={bilingualPlain(SALES.receivedBy)}
          placeholder={bilingualPlain(SALES.receivedByPlaceholder)}
          value={receivedBy}
          onChange={(e) => setReceivedBy(e.target.value)}
        />

        {isLoading ? (
          <p className="text-sm text-text-secondary">{t(COMMON.loading)}</p>
        ) : isError ? (
          <p className="text-sm text-danger-foreground">{t(SALES.failedDetail)}</p>
        ) : deliverableRows.length === 0 ? (
          <p className="text-sm text-text-secondary">
            <BilingualText {...SALES.noRemainingLines} variant="body" />
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs text-text-secondary">
                <tr>
                  <th className="px-3 py-2">{t(SALES.colProduct)}</th>
                  <th className="px-3 py-2 text-right">{t(SALES.qtySold)}</th>
                  <th className="px-3 py-2 text-right">{t(SALES.alreadyDelivered)}</th>
                  <th className="px-3 py-2 text-right">{t(SALES.remainingToDeliver)}</th>
                  <th className="px-3 py-2 text-right">{t(SALES.qtyToDeliver)}</th>
                </tr>
              </thead>
              <tbody>
                {deliverableRows.map((row) => (
                  <tr key={row.sale_item_id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.product_name}</div>
                      <div className="text-xs text-text-muted">{row.unit_name}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.sold_qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.delivered_qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.remaining_qty}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={Number(row.remaining_qty)}
                        step="any"
                        className="w-20 h-9 rounded-md border border-border px-2 text-right tabular-nums"
                        value={qtys[row.sale_item_id] ?? 0}
                        onChange={(e) => setQty(row, Number(e.target.value))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}
