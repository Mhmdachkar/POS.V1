/**
 * Admin saisie rapide — keyboard-first line grid on /pos.
 * Shares cart + PaymentPanel; open shift still required.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { BilingualText } from '@/components/ui/BilingualText'
import { CustomerChip } from '@/components/pos/CustomerChip'
import { formatCFA } from '@/lib/formatters'
import { POS } from '@/lib/bilingual/pos'
import { toastErrorBi } from '@/lib/bilingual/toast'
import { t } from '@/lib/bilingual/types'
import { tryAddCartItem, tryUpdateCartQuantity } from '@/lib/posCartActions'
import { usePosCatalogStock } from '@/hooks/usePosCatalogStock'
import { fetchProductSearch } from '@/hooks/useProducts'
import { effectiveFinalTotal, usePOSStore } from '@/stores/posStore'
import { useAuthStore } from '@/stores/authStore'
import type { ProductWithUnits } from '@/types'
interface FastEntryPanelProps {
  depotId: string | null
  onRequestPay: () => void
}

export function FastEntryPanel({ depotId, onRequestPay }: FastEntryPanelProps) {
  const staff = useAuthStore((s) => s.staff)
  const isAdmin = staff?.role === 'admin'
  const { getAvailablePieces } = usePosCatalogStock()
  const codeRef = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchHits, setSearchHits] = useState<ProductWithUnits[]>([])

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
  } = usePOSStore(useShallow((s) => ({
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
  })))

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

  const resolveByCode = useCallback(async (raw: string) => {
    if (!depotId || !raw.trim()) return null
    const hits = await fetchProductSearch(raw.trim(), depotId, null)
    if (hits.length === 0) return null
    // Prefer exact serial match on any unit
    const needle = raw.trim().toLowerCase()
    for (const p of hits) {
      const exact = p.units.find((u) => u.serial_number?.trim().toLowerCase() === needle)
      if (exact) return { product: p, unit: exact }
    }
    const p = hits[0]!
    const unit = p.units.find((u) => u.unit_level === 0) ?? p.units[0]
    if (!unit) return null
    return { product: p, unit }
  }, [depotId])

  const addFromCode = useCallback(async () => {
    const resolved = await resolveByCode(code)
    if (!resolved) {
      toastErrorBi(POS.searchProducts)
      return
    }
    const { product, unit } = resolved
    const result = tryAddCartItem(
      {
        product_id: product.id,
        product_name: product.name,
        product_photo_url: product.photo_url,
        unit_level: unit.unit_level as 0 | 1 | 2,
        unit_name: unit.unit_name,
        quantity_in_unit: 1,
        unit_price_cfa: unit.selling_price_cfa,
        cost_price_cfa: unit.cost_price_cfa,
        conversion_to_base: unit.conversion_to_base,
        line_discount_cfa: 0,
      },
      product.current_stock_pieces,
    )
    if (!result.ok) {
      toastErrorBi(POS.insufficientStock)
      return
    }
    setCode('')
    codeRef.current?.focus()
  }, [code, resolveByCode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        setSearchOpen(true)
        void (async () => {
          if (!depotId) return
          const hits = await fetchProductSearch(code.trim() || '', depotId, null)
          setSearchHits(hits.slice(0, 20))
        })()
      }
      if (e.key === 'F9') {
        e.preventDefault()
        onRequestPay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [code, depotId, onRequestPay])

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
        <span className="text-xs text-text-muted">{t(POS.f2SearchHint)} · {t(POS.f9PayHint)}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-muted text-xs text-text-secondary">
            <tr>
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
              return (
                <tr key={`${row.product_id}:${row.unit_level}`} className="border-t border-border">
                  <td className="px-2 py-1.5 font-mono text-xs text-text-secondary">—</td>
                  <td className="px-2 py-1.5 font-medium">{row.product_name}</td>
                  <td className="px-2 py-1.5">{row.unit_name}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min={1}
                      className="w-16 h-9 rounded-md border border-border px-1 text-right tabular-nums"
                      value={row.quantity_in_unit}
                      onChange={(e) => {
                        const qty = Number(e.target.value)
                        const r = tryUpdateCartQuantity(
                          row.product_id,
                          row.unit_level,
                          qty,
                          stock,
                        )
                        if (!r.ok) toastErrorBi(POS.insufficientStock)
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min={0}
                      className={`w-24 h-9 rounded-md border px-1 text-right tabular-nums ${belowCost ? 'border-warning' : 'border-border'}`}
                      value={row.unit_price_cfa}
                      title={belowCost ? t(POS.belowCostWarning) : undefined}
                      onChange={(e) => updateLinePrice(row.product_id, row.unit_level, Number(e.target.value))}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min={0}
                      className="w-20 h-9 rounded-md border border-border px-1 text-right tabular-nums"
                      value={row.line_discount_cfa ?? 0}
                      onChange={(e) => updateLineDiscount(row.product_id, row.unit_level, Number(e.target.value))}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">{formatCFA(row.line_total_cfa)}</td>
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

      <div className="flex-shrink-0 border-t border-border px-3 py-2 flex flex-wrap items-center gap-2">
        <input
          ref={codeRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void addFromCode()
            }
          }}
          placeholder={t(POS.codeCol)}
          className="h-11 min-w-[10rem] flex-1 rounded-md border border-border bg-background px-3 font-mono text-sm"
          autoFocus
        />
        <button
          type="button"
          className="h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          onClick={() => { void addFromCode() }}
        >
          Enter
        </button>
      </div>

      <div className="flex-shrink-0 sticky bottom-0 border-t border-border bg-surface-muted px-3 py-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
        <div><span className="text-text-secondary">{t(POS.linesCount(items.length))}</span></div>
        <div><span className="text-text-secondary">{t(POS.articlesCount(articles))}</span></div>
        <div className="tabular-nums">{t(POS.total)}: <strong>{formatCFA(totals.subtotal_cfa)}</strong></div>
        <div className="tabular-nums">{t(POS.discount)}: <strong>{formatCFA(lineRemise + totals.discount_amount_cfa)}</strong></div>
        <div className="tabular-nums">{t(POS.netToPay)}: <strong>{formatCFA(net)}</strong></div>
        {isAdmin && (
          <div className="tabular-nums">{t(POS.lineBenefit)}: <strong>{formatCFA(benefit)}</strong></div>
        )}
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20 px-4" onClick={() => setSearchOpen(false)}>
          <div className="bg-surface rounded-xl shadow-lg max-w-lg w-full max-h-[60vh] overflow-auto p-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold mb-2"><BilingualText {...POS.saisieRapide} layout="inline" /></p>
            <ul className="space-y-1">
              {searchHits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-muted"
                    onClick={() => {
                      const unit = p.units.find((u) => u.unit_level === 0) ?? p.units[0]
                      if (!unit) return
                      const r = tryAddCartItem(
                        {
                          product_id: p.id,
                          product_name: p.name,
                          product_photo_url: p.photo_url,
                          unit_level: unit.unit_level as 0 | 1 | 2,
                          unit_name: unit.unit_name,
                          quantity_in_unit: 1,
                          unit_price_cfa: unit.selling_price_cfa,
                          cost_price_cfa: unit.cost_price_cfa,
                          conversion_to_base: unit.conversion_to_base,
                          line_discount_cfa: 0,
                        },
                        p.current_stock_pieces,
                      )
                      if (!r.ok) toastErrorBi(POS.insufficientStock)
                      setSearchOpen(false)
                    }}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-xs text-text-muted font-mono">
                      {p.units.map((u) => u.serial_number).filter(Boolean).join(' · ')}
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