/**
 * Admin saisie rapide — keyboard-first line grid on /pos.
 * Shares cart + PaymentPanel; open shift still required.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { BilingualText } from '@/components/ui/BilingualText'
import { CustomerChip } from '@/components/pos/CustomerChip'
import { ProductThumb } from '@/components/product/ProductThumb'
import { formatCFA } from '@/lib/formatters'
import { POS } from '@/lib/bilingual/pos'
import { toastErrorBi } from '@/lib/bilingual/toast'
import { t } from '@/lib/bilingual/types'
import {
  rankAchatsProductHits,
  resolveNearestAchatsProduct,
  type AchatsResolveHit,
} from '@/lib/achatsProductResolve'
import { preventQtyEmptyOnDelete, sanitizeQtyInput } from '@/lib/qtyInput'
import { tryAddCartItem, tryUpdateCartQuantity } from '@/lib/posCartActions'
import { usePosCatalogStock } from '@/hooks/usePosCatalogStock'
import { usePOSProductCatalog } from '@/hooks/useProducts'
import { effectiveFinalTotal, usePOSStore } from '@/stores/posStore'
import { useAuthStore } from '@/stores/authStore'

interface FastEntryPanelProps {
  depotId: string | null
  onRequestPay: () => void
}

function lineKey(productId: string, unitLevel: number) {
  return `${productId}:${unitLevel}`
}

function unitCode(hit: AchatsResolveHit): string {
  return hit.unit.serial_number?.trim() || '—'
}

export function FastEntryPanel({ depotId, onRequestPay }: FastEntryPanelProps) {
  const staff = useAuthStore((s) => s.staff)
  const isAdmin = staff?.role === 'admin'
  const { getAvailablePieces } = usePosCatalogStock()
  const codeRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [entryQty, setEntryQty] = useState('1')
  const [lockedHit, setLockedHit] = useState<AchatsResolveHit | null>(null)
  const [focusQtyToken, setFocusQtyToken] = useState(0)
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({})
  const [searchOpen, setSearchOpen] = useState(false)

  const { data: catalogHits = [] } = usePOSProductCatalog(code, depotId, !!depotId)
  const suggestions = useMemo(
    () => rankAchatsProductHits(code, catalogHits).slice(0, 12),
    [code, catalogHits],
  )
  const liveHit = useMemo(
    () => resolveNearestAchatsProduct(code, catalogHits),
    [code, catalogHits],
  )
  const activeHit = lockedHit ?? liveHit

  const {
    items,
    totals,
    overrideTotalCfa,
    documentDateYmd,
    externalRef,
    setDocumentDateYmd,
    setExternalRef,
    removeItem,
    updateLinePrice,
    updateLineDiscount,
  } = usePOSStore(
    useShallow((s) => ({
      items: s.items,
      totals: s.totals,
      overrideTotalCfa: s.overrideTotalCfa,
      documentDateYmd: s.documentDateYmd,
      externalRef: s.externalRef,
      setDocumentDateYmd: s.setDocumentDateYmd,
      setExternalRef: s.setExternalRef,
      removeItem: s.removeItem,
      updateLinePrice: s.updateLinePrice,
      updateLineDiscount: s.updateLineDiscount,
    })),
  )

  const articles = useMemo(
    () => items.reduce((n, i) => n + i.quantity_in_unit, 0),
    [items],
  )
  const lineRemise = useMemo(
    () => items.reduce((n, i) => n + (i.line_discount_cfa ?? 0), 0),
    [items],
  )
  const benefit = useMemo(
    () =>
      items.reduce(
        (n, i) => n + (i.line_total_cfa - i.cost_price_cfa * i.quantity_in_unit),
        0,
      ),
    [items],
  )
  const net = effectiveFinalTotal(totals.total_cfa, isAdmin ? overrideTotalCfa : null)

  useEffect(() => {
    if (!focusQtyToken) return
    const tmr = setTimeout(() => {
      qtyRef.current?.focus()
      qtyRef.current?.select()
    }, 0)
    return () => clearTimeout(tmr)
  }, [focusQtyToken])

  function lockNearestAndFocusQty() {
    const hit = resolveNearestAchatsProduct(code, catalogHits)
    if (!hit) {
      toastErrorBi(POS.searchProducts)
      return
    }
    setLockedHit(hit)
    setCode(hit.product.name)
    setFocusQtyToken((n) => n + 1)
  }

  function addHit(hit: AchatsResolveHit, qtyRaw: string) {
    const qty = Number(sanitizeQtyInput(qtyRaw))
    if (!Number.isFinite(qty) || qty <= 0) {
      toastErrorBi(POS.qtyInvalid)
      setFocusQtyToken((n) => n + 1)
      return
    }
    const { product, unit } = hit
    const stock = product.current_stock_pieces
    const result = tryAddCartItem(
      {
        product_id: product.id,
        product_name: product.name,
        product_photo_url: product.photo_url,
        unit_level: unit.unit_level as 0 | 1 | 2,
        unit_name: unit.unit_name,
        quantity_in_unit: qty,
        unit_price_cfa: unit.selling_price_cfa,
        cost_price_cfa: unit.cost_price_cfa,
        conversion_to_base: unit.conversion_to_base,
        line_discount_cfa: 0,
      },
      stock,
    )
    if (!result.ok) {
      toastErrorBi(POS.insufficientStock)
      return
    }
    setCode('')
    setEntryQty('1')
    setLockedHit(null)
    requestAnimationFrame(() => codeRef.current?.focus())
  }

  function submitEntry() {
    const hit = lockedHit ?? resolveNearestAchatsProduct(code, catalogHits)
    if (!hit) {
      toastErrorBi(POS.searchProducts)
      return
    }
    addHit(hit, entryQty)
  }

  function commitLineQty(productId: string, unitLevel: number, raw: string, stock: number | null) {
    const key = lineKey(productId, unitLevel)
    const cleaned = sanitizeQtyInput(raw)
    setQtyDrafts((prev) => ({ ...prev, [key]: cleaned }))
    const qty = Number(cleaned)
    // Keep the line: Delete → 0 stays in the field; only trash removes.
    if (!Number.isFinite(qty) || qty <= 0) return
    const r = tryUpdateCartQuantity(productId, unitLevel, qty, stock)
    if (!r.ok) {
      toastErrorBi(POS.insufficientStock)
      return
    }
    setQtyDrafts((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'F9') {
        e.preventDefault()
        onRequestPay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onRequestPay])

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface">
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border">
        <CustomerChip />
        <label className="text-xs text-text-secondary flex items-center gap-1">
          <span>{t(POS.documentDate)}</span>
          <input
            type="date"
            value={documentDateYmd}
            onChange={(e) => setDocumentDateYmd(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>
        <label className="text-xs text-text-secondary flex items-center gap-1 min-w-[8rem] flex-1">
          <span>{t(POS.externalRef)}</span>
          <input
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            maxLength={64}
          />
        </label>
        <span className="text-xs text-text-muted">
          {t(POS.tabConfirmHint)} · {t(POS.f2SearchHint)} · {t(POS.f9PayHint)}
        </span>
      </div>

      <div className="flex-shrink-0 border-b border-border px-3 py-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 min-w-[12rem] flex-1">
          <span className="text-xs text-text-secondary">{t(POS.codeCol)} / {t(POS.designationCol)}</span>
          <input
            ref={codeRef}
            value={code}
            onChange={(e) => {
              setLockedHit(null)
              setCode(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && !e.shiftKey && code.trim()) {
                e.preventDefault()
                lockNearestAndFocusQty()
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                submitEntry()
              }
            }}
            placeholder={t(POS.codeCol)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 w-24">
          <span className="text-xs text-text-secondary">{t(POS.qtyCol)}</span>
          <input
            ref={qtyRef}
            inputMode="decimal"
            value={entryQty}
            onChange={(e) => setEntryQty(sanitizeQtyInput(e.target.value))}
            onKeyDown={(e) => {
              preventQtyEmptyOnDelete(e, entryQty, setEntryQty)
              if (e.key === 'Enter') {
                e.preventDefault()
                submitEntry()
              }
            }}
            className="h-11 w-full rounded-md border border-border bg-background px-2 text-right tabular-nums text-sm"
          />
        </label>
        <button
          type="button"
          className="h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          onClick={() => submitEntry()}
        >
          Enter
        </button>
        {activeHit && code.trim() && (
          <div className="w-full flex items-center gap-2 text-xs text-text-secondary min-w-0">
            <ProductThumb photoUrl={activeHit.product.photo_url} name={activeHit.product.name} size="sm" />
            <p className="truncate">
              → {unitCode(activeHit)} · {activeHit.product.name}
              <span className="ml-2 text-[10px] font-normal text-text-muted">Tab</span>
            </p>
          </div>
        )}
      </div>

      {code.trim() && suggestions.length > 0 && !lockedHit && (
        <div className="flex-shrink-0 max-h-40 overflow-auto border-b border-border bg-surface-muted/40 px-2 py-1">
          <ul className="space-y-0.5">
            {suggestions.map((hit) => (
              <li key={`${hit.product.id}:${hit.unit.unit_level}`}>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-surface text-sm flex items-center gap-2"
                  onClick={() => {
                    setLockedHit(hit)
                    setCode(hit.product.name)
                    setFocusQtyToken((n) => n + 1)
                  }}
                >
                  <ProductThumb photoUrl={hit.product.photo_url} name={hit.product.name} size="sm" />
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-text-secondary">{unitCode(hit)}</span>
                    <span className="ml-2 font-medium">{hit.product.name}</span>
                    <span className="ml-2 text-xs text-text-muted">{hit.unit.unit_name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-muted text-xs text-text-secondary">
            <tr>
              <th className="w-12" />
              <th className="text-left px-2 py-2 font-semibold">{t(POS.codeCol)}</th>
              <th className="text-left px-2 py-2 font-semibold">{t(POS.designationCol)}</th>
              <th className="text-left px-2 py-2 font-semibold">{t(POS.unitCol)}</th>
              <th className="text-right px-2 py-2 font-semibold">{t(POS.qtyCol)}</th>
              <th className="text-right px-2 py-2 font-semibold">{t(POS.unitPriceCol)}</th>
              <th className="text-right px-2 py-2 font-semibold">{t(POS.lineDiscountCol)}</th>
              <th className="text-right px-2 py-2 font-semibold">{t(POS.lineAmountCol)}</th>
              <th className="text-right px-2 py-2 font-semibold">{t(POS.stockAvailableCol)}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const stock = getAvailablePieces(row.product_id)
              const belowCost = row.unit_price_cfa < row.cost_price_cfa
              const key = lineKey(row.product_id, row.unit_level)
              const qtyValue = qtyDrafts[key] ?? String(row.quantity_in_unit)
              return (
                <tr key={key} className="border-t border-border">
                  <td className="px-2 py-1.5">
                    <ProductThumb photoUrl={row.product_photo_url} name={row.product_name} size="sm" />
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs text-text-secondary">—</td>
                  <td className="px-2 py-1.5 font-medium">{row.product_name}</td>
                  <td className="px-2 py-1.5">{row.unit_name}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      inputMode="decimal"
                      className="w-16 h-9 rounded-md border border-border px-1 text-right tabular-nums"
                      value={qtyValue}
                      onChange={(e) =>
                        commitLineQty(
                          row.product_id,
                          row.unit_level,
                          e.target.value,
                          stock ?? null,
                        )
                      }
                      onKeyDown={(e) =>
                        preventQtyEmptyOnDelete(e, qtyValue, (next) =>
                          commitLineQty(row.product_id, row.unit_level, next, stock ?? null),
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min={0}
                      className={`w-24 h-9 rounded-md border px-1 text-right tabular-nums ${belowCost ? 'border-warning' : 'border-border'}`}
                      value={row.unit_price_cfa}
                      title={belowCost ? t(POS.belowCostWarning) : undefined}
                      onChange={(e) =>
                        updateLinePrice(row.product_id, row.unit_level, Number(e.target.value))
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min={0}
                      className="w-20 h-9 rounded-md border border-border px-1 text-right tabular-nums"
                      value={row.line_discount_cfa ?? 0}
                      onChange={(e) =>
                        updateLineDiscount(row.product_id, row.unit_level, Number(e.target.value))
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                    {formatCFA(row.line_total_cfa)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
                    {stock == null ? '—' : formatCFA(stock).replace(' CFA', '')}
                  </td>
                  <td className="px-1 py-1.5">
                    <button
                      type="button"
                      className="p-2 text-text-muted hover:text-danger-foreground"
                      onClick={() => removeItem(row.product_id, row.unit_level)}
                      aria-label={t(POS.clearCart)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex-shrink-0 sticky bottom-0 border-t border-border bg-surface-muted px-3 py-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
        <div>
          <span className="text-text-secondary">{t(POS.linesCount(items.length))}</span>
        </div>
        <div>
          <span className="text-text-secondary">{t(POS.articlesCount(articles))}</span>
        </div>
        <div className="tabular-nums">
          {t(POS.total)}: <strong>{formatCFA(totals.subtotal_cfa)}</strong>
        </div>
        <div className="tabular-nums">
          {t(POS.discount)}: <strong>{formatCFA(lineRemise + totals.discount_amount_cfa)}</strong>
        </div>
        <div className="tabular-nums">
          {t(POS.netToPay)}: <strong>{formatCFA(net)}</strong>
        </div>
        {isAdmin && (
          <div className="tabular-nums">
            {t(POS.lineBenefit)}: <strong>{formatCFA(benefit)}</strong>
          </div>
        )}
      </div>

      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20 px-4"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="bg-surface rounded-xl shadow-lg max-w-lg w-full max-h-[60vh] overflow-auto p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold mb-2">
              <BilingualText {...POS.saisieRapide} layout="inline" />
            </p>
            <ul className="space-y-1">
              {(code.trim() ? suggestions : catalogHits.slice(0, 20).map((p) => {
                const unit = p.units.find((u) => u.unit_level === 0) ?? p.units[0]
                if (!unit) return null
                return { product: p, unit, score: 0, matchLabel: 'name_contains' as const }
              }).filter(Boolean) as AchatsResolveHit[]).map((hit) => (
                <li key={`${hit.product.id}:${hit.unit.unit_level}`}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-muted flex items-center gap-3"
                    onClick={() => {
                      setLockedHit(hit)
                      setCode(hit.product.name)
                      setSearchOpen(false)
                      setFocusQtyToken((n) => n + 1)
                    }}
                  >
                    <ProductThumb photoUrl={hit.product.photo_url} name={hit.product.name} />
                    <span className="min-w-0">
                      <span className="font-medium block truncate">{hit.product.name}</span>
                      <span className="block text-xs text-text-muted font-mono">
                        {hit.product.units.map((u) => u.serial_number).filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}