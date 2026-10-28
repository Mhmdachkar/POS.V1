import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button, LoadingButton, MoneyDisplay } from '@/components/ui'
import { ACHATS } from '@/lib/bilingual/achats'
import { COMMON } from '@/lib/bilingual/common'
import { BiButtonStack, BiModalTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { t } from '@/lib/bilingual/types'
import { parseError } from '@/lib/errors'
import { useUpsertPurchaseReceipt, useSupplierList } from '@/hooks/useAchats'
import { useDepotStore } from '@/stores/depotStore'
import { useProductSearch } from '@/hooks/useProducts'
import type { ProductWithUnits } from '@/types'

interface LineDraft {
  key: string
  product_id: string
  product_name: string
  unit_level: number
  unit_name: string
  quantity_in_unit: string
  unit_cost_cfa: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (id: string) => void
  editId?: string | null
}

function todayAbidjan(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Abidjan' }).format(new Date())
}

export function PurchaseReceiptEditorModal({ open, onClose, onCreated }: Props) {
  const depotId = useDepotStore((s) => s.currentDepotId)
  const suppliersQ = useSupplierList(true)
  const upsert = useUpsertPurchaseReceipt()
  const [supplierId, setSupplierId] = useState('')
  const [documentDate, setDocumentDate] = useState(todayAbidjan())
  const [externalRef, setExternalRef] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [productQuery, setProductQuery] = useState('')
  const [error, setError] = useState('')
  const { data: products = [] } = useProductSearch(productQuery, depotId)

  useEffect(() => {
    if (!open) return
    setSupplierId('')
    setDocumentDate(todayAbidjan())
    setExternalRef('')
    setNotes('')
    setLines([])
    setProductQuery('')
    setError('')
  }, [open])

  const total = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const q = Number(line.quantity_in_unit)
        const c = Number(line.unit_cost_cfa)
        if (!Number.isFinite(q) || !Number.isFinite(c)) return sum
        return sum + q * c
      }, 0),
    [lines],
  )

  function addProduct(p: ProductWithUnits) {
    const unit = p.units?.[0]
    if (!unit) return
    setLines((prev) => [
      ...prev,
      {
        key: `${p.id}-${Date.now()}`,
        product_id: p.id,
        product_name: p.name,
        unit_level: unit.unit_level,
        unit_name: unit.unit_name,
        quantity_in_unit: '1',
        unit_cost_cfa: String(unit.cost_price_cfa ?? 0),
      },
    ])
    setProductQuery('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!depotId) {
      setError(t(ACHATS.needDepot))
      return
    }
    if (!supplierId) {
      setError(t(ACHATS.needSupplier))
      return
    }
    if (lines.length === 0) {
      setError(t(ACHATS.needItems))
      return
    }
    try {
      const result = await upsert.mutateAsync({
        p_depot_id: depotId,
        p_supplier_id: supplierId,
        p_document_date: documentDate,
        p_external_ref: externalRef.trim() || null,
        p_notes: notes.trim() || null,
        p_items: lines.map((l) => ({
          product_id: l.product_id,
          unit_level: l.unit_level,
          quantity_in_unit: Number(l.quantity_in_unit),
          unit_cost_cfa: Number(l.unit_cost_cfa),
        })),
      })
      onCreated?.(result.id)
      onClose()
    } catch (err) {
      setError(parseError(err).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<BiModalTitle {...ACHATS.newReceipt} />}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-text-secondary">
              <BiTableHeader {...ACHATS.supplier} /> *
            </span>
            <select
              className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">—</option>
              {(suppliersQ.data?.rows ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-text-secondary">
              <BiTableHeader {...ACHATS.date} />
            </span>
            <input
              type="date"
              className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm"
              value={documentDate}
              max={todayAbidjan()}
              onChange={(e) => setDocumentDate(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-text-secondary">
              <BiTableHeader {...ACHATS.externalRef} />
            </span>
            <input
              className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-text-secondary">
              <BiTableHeader {...ACHATS.notes} />
            </span>
            <input
              className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-text-secondary">
              <BiTableHeader {...ACHATS.searchProduct} />
            </span>
            <input
              className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder={t(ACHATS.searchProduct)}
            />
          </label>
          {productQuery.trim() && products.length > 0 && (
            <div className="max-h-40 overflow-auto rounded-md border border-border divide-y divide-border">
              {products.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted"
                  onClick={() => addProduct(p)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {lines.map((line) => (
            <div
              key={line.key}
              className="grid gap-2 sm:grid-cols-[1fr_5rem_5rem_5.5rem_auto] items-end rounded-md border border-border p-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{line.product_name}</p>
                <p className="text-xs text-text-muted">{line.unit_name}</p>
              </div>
              <label className="block space-y-0.5">
                <span className="text-[11px] text-text-muted">{t(ACHATS.qty)}</span>
                <input
                  className="w-full h-9 px-2 rounded-md border border-border text-sm tabular-nums"
                  value={line.quantity_in_unit}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, quantity_in_unit: e.target.value } : l,
                      ),
                    )
                  }
                />
              </label>
              <label className="block space-y-0.5">
                <span className="text-[11px] text-text-muted">{t(ACHATS.unitCost)}</span>
                <input
                  className="w-full h-9 px-2 rounded-md border border-border text-sm tabular-nums"
                  value={line.unit_cost_cfa}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, unit_cost_cfa: e.target.value } : l,
                      ),
                    )
                  }
                />
              </label>
              <MoneyDisplay
                amount={Number(line.quantity_in_unit || 0) * Number(line.unit_cost_cfa || 0)}
                className="text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
              >
                {t(ACHATS.removeLine)}
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm text-text-secondary">{t(ACHATS.total)}</span>
          <MoneyDisplay amount={total} className="text-base font-semibold" />
        </div>

        {error && <p className="text-sm text-danger-foreground">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            <BiButtonStack {...COMMON.cancel} />
          </Button>
          <LoadingButton type="submit" loading={upsert.isPending}>
            <BiButtonStack {...ACHATS.saveDraft} />
          </LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
