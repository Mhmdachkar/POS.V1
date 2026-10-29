import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { ProductThumb } from '@/components/product/ProductThumb'
import { Button, LoadingButton, MoneyDisplay } from '@/components/ui'
import { ACHATS } from '@/lib/bilingual/achats'
import { COMMON } from '@/lib/bilingual/common'
import { BiButtonStack, BiModalTitle, BiTableHeader } from '@/lib/bilingual/ui'
import { t } from '@/lib/bilingual/types'
import { parseError } from '@/lib/errors'
import { formatCfaIntInput, formatThousandsInput, parseCFAInput, roundCfaInt } from '@/lib/formatters'
import {
  rankAchatsProductHits,
  resolveNearestAchatsProduct,
  sanitizeAchatsQtyInput,
  type AchatsResolveHit,
} from '@/lib/achatsProductResolve'
import { useUpsertPurchaseReceipt, useSupplierList } from '@/hooks/useAchats'
import { useDepotStore } from '@/stores/depotStore'
import { usePOSProductCatalog } from '@/hooks/useProducts'
import type { ProductWithUnits } from '@/types'
import { cn } from '@/lib/cn'

interface LineDraft {
  key: string
  product_id: string
  product_name: string
  product_photo_url: string | null
  serial_number: string | null
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

function primaryCode(p: ProductWithUnits): string | null {
  return p.units.find((u) => u.serial_number?.trim())?.serial_number?.trim() ?? null
}

function handleQtyKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  current: string,
  setValue: (next: string) => void,
) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return
  const input = e.currentTarget
  const start = input.selectionStart ?? 0
  const end = input.selectionEnd ?? 0
  const allSelected = start === 0 && end === current.length && current.length > 0
  const wouldEmpty =
    allSelected ||
    (e.key === 'Backspace' && start === end && start > 0 && current.length === 1) ||
    (e.key === 'Delete' && start === end && start === 0 && current.length === 1) ||
    (e.key === 'Backspace' && current === '0' && start === end)
  if (!wouldEmpty && !allSelected) return
  e.preventDefault()
  e.stopPropagation()
  setValue('0')
  requestAnimationFrame(() => {
    input.focus()
    input.setSelectionRange(0, 1)
  })
}

export function PurchaseReceiptEditorModal({ open, onClose, onCreated }: Props) {
  const depotId = useDepotStore((s) => s.currentDepotId)
  const suppliersQ = useSupplierList(true)
  const upsert = useUpsertPurchaseReceipt()
  const searchRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const [supplierId, setSupplierId] = useState('')
  const [documentDate, setDocumentDate] = useState(todayAbidjan())
  const [externalRef, setExternalRef] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [productQuery, setProductQuery] = useState('')
  const [entryQty, setEntryQty] = useState('1')
  const [lockedHit, setLockedHit] = useState<AchatsResolveHit | null>(null)
  const [error, setError] = useState('')
  const [focusQtyToken, setFocusQtyToken] = useState(0)

  const { data: products = [] } = usePOSProductCatalog(productQuery, depotId, !!depotId)
  const suggestions = useMemo(
    () => rankAchatsProductHits(productQuery, products).slice(0, 12),
    [productQuery, products],
  )
  const liveHit = useMemo(
    () => resolveNearestAchatsProduct(productQuery, products),
    [productQuery, products],
  )
  const activeHit = lockedHit ?? liveHit

  useEffect(() => {
    if (!open) return
    setSupplierId('')
    setDocumentDate(todayAbidjan())
    setExternalRef('')
    setNotes('')
    setLines([])
    setProductQuery('')
    setEntryQty('1')
    setLockedHit(null)
    setError('')
    const tmr = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(tmr)
  }, [open])

  useEffect(() => {
    if (!focusQtyToken) return
    const tmr = setTimeout(() => {
      qtyRef.current?.focus()
      qtyRef.current?.select()
    }, 0)
    return () => clearTimeout(tmr)
  }, [focusQtyToken])

  const total = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const q = Number(line.quantity_in_unit)
        const c = roundCfaInt(parseCFAInput(line.unit_cost_cfa))
        if (!Number.isFinite(q) || !Number.isFinite(c)) return sum
        return sum + q * c
      }, 0),
    [lines],
  )

  function lockNearestAndFocusQty() {
    const hit = resolveNearestAchatsProduct(productQuery, products)
    if (!hit) {
      setError(t(COMMON.noResults))
      return
    }
    setLockedHit(hit)
    setProductQuery(hit.product.name)
    setError('')
    setFocusQtyToken((n) => n + 1)
  }

  function addHit(hit: AchatsResolveHit, qtyRaw: string) {
    const qty = Number(sanitizeAchatsQtyInput(qtyRaw))
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(t(ACHATS.qty))
      setFocusQtyToken((n) => n + 1)
      return
    }
    const p = hit.product
    const unit = hit.unit
    const serial = unit.serial_number?.trim() || primaryCode(p)
    const unitCost = formatCfaIntInput(unit.cost_price_cfa)

    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === p.id && l.unit_level === unit.unit_level)
      if (existing) {
        const nextQty = Number(existing.quantity_in_unit || 0) + qty
        return prev.map((l) =>
          l.key === existing.key
            ? {
                ...l,
                quantity_in_unit: String(Number.isFinite(nextQty) ? nextQty : qty),
                unit_cost_cfa: unitCost,
              }
            : l,
        )
      }
      return [
        ...prev,
        {
          key: `${p.id}-${unit.unit_level}-${Date.now()}`,
          product_id: p.id,
          product_name: p.name,
          product_photo_url: p.photo_url ?? null,
          serial_number: serial,
          unit_level: unit.unit_level,
          unit_name: unit.unit_name,
          quantity_in_unit: String(qty),
          unit_cost_cfa: unitCost,
        },
      ]
    })
    setProductQuery('')
    setEntryQty('1')
    setLockedHit(null)
    setError('')
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  function submitEntry() {
    const hit = lockedHit ?? resolveNearestAchatsProduct(productQuery, products)
    if (!hit) {
      setError(t(COMMON.noResults))
      return
    }
    addHit(hit, entryQty)
  }

  async function saveDraft() {
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
          unit_cost_cfa: roundCfaInt(parseCFAInput(l.unit_cost_cfa)),
        })),
      })
      onCreated?.(result.id)
      onClose()
    } catch (err) {
      setError(parseError(err).message)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await saveDraft()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<BiModalTitle {...ACHATS.newReceipt} />}
      size="2xl"
      className="max-h-[92vh]"
      footer={
        <>
          <div className="mr-auto flex items-center gap-3 tabular-nums">
            <span className="text-sm text-text-secondary">{t(ACHATS.total)}</span>
            <MoneyDisplay amount={total} className="text-base font-semibold" />
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            <BiButtonStack {...COMMON.cancel} />
          </Button>
          <LoadingButton type="button" loading={upsert.isPending} onClick={() => void saveDraft()}>
            <BiButtonStack {...ACHATS.saveDraft} />
          </LoadingButton>
        </>
      }
    >
      <form
        onSubmit={submit}
        className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] lg:items-start"
      >
        <div className="space-y-4 min-w-0">
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
            <p className="text-xs text-text-muted">{t(ACHATS.enterToAdd)}</p>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="block space-y-0.5 min-w-[12rem] flex-1">
                <span className="text-[11px] text-text-muted">
                  <BiTableHeader {...ACHATS.code} /> / <BiTableHeader {...ACHATS.description} />
                </span>
                <input
                  ref={searchRef}
                  className="w-full h-11 px-3 rounded-md border border-border bg-surface text-sm font-mono"
                  value={productQuery}
                  onChange={(e) => {
                    setProductQuery(e.target.value)
                    setLockedHit(null)
                    if (error) setError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && !e.shiftKey && productQuery.trim()) {
                      e.preventDefault()
                      e.stopPropagation()
                      lockNearestAndFocusQty()
                      return
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submitEntry()
                    }
                  }}
                  placeholder={t(ACHATS.searchProduct)}
                  autoComplete="off"
                />
              </label>
              <label className="block space-y-0.5 w-[6.5rem]">
                <span className="text-[11px] text-text-muted">
                  <BiTableHeader {...ACHATS.qty} />
                </span>
                <input
                  ref={qtyRef}
                  className="w-full h-11 px-3 rounded-md border border-border bg-surface text-sm tabular-nums"
                  inputMode="decimal"
                  value={entryQty}
                  onChange={(e) => setEntryQty(sanitizeAchatsQtyInput(e.target.value))}
                  onKeyDown={(e) => {
                    handleQtyKeyDown(e, entryQty, setEntryQty)
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submitEntry()
                    }
                  }}
                />
              </label>
              <Button type="button" className="h-11" onClick={() => submitEntry()}>
                Enter
              </Button>
            </div>

            {activeHit && productQuery.trim() && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
                <ProductThumb photoUrl={activeHit.product.photo_url} name={activeHit.product.name} />
                <div className="min-w-0">
                  <p className="text-[11px] text-text-muted">{t(ACHATS.matchedProduct)}</p>
                  <p className="text-xs font-mono text-text-secondary truncate">
                    {activeHit.unit.serial_number?.trim() || primaryCode(activeHit.product) || '\u2014'}
                  </p>
                  <p className="text-sm font-semibold truncate">{activeHit.product.name}</p>
                </div>
              </div>
            )}

            {productQuery.trim() && (
              <div className="max-h-56 overflow-auto rounded-md border border-border divide-y divide-border">
                <div className="sticky top-0 z-[1] grid grid-cols-[3rem_minmax(5rem,7rem)_1fr] gap-2 px-3 py-1.5 bg-surface-muted text-[11px] font-semibold text-text-secondary">
                  <span />
                  <BiTableHeader {...ACHATS.code} />
                  <BiTableHeader {...ACHATS.description} />
                </div>
                {suggestions.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-text-muted">{t(COMMON.noResults)}</p>
                ) : (
                  suggestions.map((hit, index) => {
                    const code =
                      hit.unit.serial_number?.trim() || primaryCode(hit.product) || '\u2014'
                    return (
                      <button
                        key={`${hit.product.id}-${hit.unit.unit_level}`}
                        type="button"
                        className={cn(
                          'w-full grid grid-cols-[3rem_minmax(5rem,7rem)_1fr] gap-2 items-center px-3 py-2 text-left hover:bg-surface-muted',
                          index === 0 && 'bg-primary-subtle/50',
                        )}
                        onClick={() => {
                          setLockedHit(hit)
                          setProductQuery(hit.product.name)
                          setFocusQtyToken((n) => n + 1)
                        }}
                      >
                        <ProductThumb
                          photoUrl={hit.product.photo_url}
                          name={hit.product.name}
                          size="sm"
                        />
                        <span className="text-xs font-mono text-text-secondary truncate">{code}</span>
                        <span className="text-sm font-medium truncate">
                          {hit.product.name}
                          {index === 0 && (
                            <span className="ml-2 text-[10px] font-normal text-text-muted">Tab</span>
                          )}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-danger-foreground">{error}</p>}
        </div>

        <aside className="min-w-0 rounded-xl border border-border bg-surface-muted/40 p-3 space-y-3 lg:sticky lg:top-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text-primary">{t(ACHATS.linesSidebar)}</p>
            <span className="text-xs text-text-muted tabular-nums">{lines.length}</span>
          </div>

          <div className="hidden sm:grid grid-cols-[2.5rem_minmax(4rem,5.5rem)_minmax(0,1fr)_3.5rem_5rem_5.5rem_auto] gap-2 px-1 text-[11px] font-semibold text-text-secondary">
            <span />
            <BiTableHeader {...ACHATS.code} />
            <BiTableHeader {...ACHATS.description} />
            <BiTableHeader {...ACHATS.qty} />
            <BiTableHeader {...ACHATS.unitCost} />
            <span className="text-right">
              <BiTableHeader {...ACHATS.lineTotal} />
            </span>
            <span />
          </div>

          <div className="max-h-[min(28rem,55vh)] overflow-auto space-y-2">
            {lines.length === 0 ? (
              <p className="text-sm text-text-muted px-1 py-6 text-center">{t(ACHATS.needItems)}</p>
            ) : (
              lines.map((line) => {
                const lineTotal =
                  Number(line.quantity_in_unit || 0) *
                  roundCfaInt(parseCFAInput(line.unit_cost_cfa || '0'))
                return (
                  <div
                    key={line.key}
                    className="grid gap-2 sm:grid-cols-[2.5rem_minmax(4rem,5.5rem)_minmax(0,1fr)_3.5rem_5rem_5.5rem_auto] items-center rounded-md border border-border bg-surface p-2"
                  >
                    <ProductThumb
                      photoUrl={line.product_photo_url}
                      name={line.product_name}
                      size="sm"
                    />
                    <span className="text-xs font-mono text-text-secondary truncate">
                      {line.serial_number || '\u2014'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{line.product_name}</p>
                      <p className="text-[11px] text-text-muted truncate">{line.unit_name}</p>
                    </div>
                    <input
                      className="w-full h-9 px-1.5 rounded-md border border-border text-sm tabular-nums"
                      inputMode="decimal"
                      value={line.quantity_in_unit}
                      onChange={(e) => {
                        const next = sanitizeAchatsQtyInput(e.target.value)
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key ? { ...l, quantity_in_unit: next } : l,
                          ),
                        )
                      }}
                      onKeyDown={(e) =>
                        handleQtyKeyDown(e, line.quantity_in_unit, (next) => {
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key ? { ...l, quantity_in_unit: next } : l,
                            ),
                          )
                        })
                      }
                    />
                    <input
                      className="w-full h-9 px-1.5 rounded-md border border-border text-sm tabular-nums"
                      inputMode="numeric"
                      value={line.unit_cost_cfa}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? { ...l, unit_cost_cfa: formatThousandsInput(e.target.value) }
                              : l,
                          ),
                        )
                      }
                      onBlur={() =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? {
                                  ...l,
                                  unit_cost_cfa: formatCfaIntInput(parseCFAInput(l.unit_cost_cfa)),
                                }
                              : l,
                          ),
                        )
                      }
                    />
                    <MoneyDisplay amount={lineTotal} className="justify-self-end text-sm font-medium" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    >
                      {t(ACHATS.removeLine)}
                    </Button>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm text-text-secondary">{t(ACHATS.total)}</span>
            <MoneyDisplay amount={total} className="text-base font-semibold" />
          </div>
        </aside>
      </form>
    </Modal>
  )
}