import { useState } from 'react'
import { BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { INVENTORY, STOCK_TXN_TYPE } from '@/lib/bilingual/inventory'
import { cn } from '@/lib/cn'
import { MoneyDisplay, StockStatusBadge } from '@/components/ui'
import { formatPieces } from '@/lib/formatters'
import type { AdminInventoryReport, InventoryStockRow, InventoryStockStatus } from '@/types/rpc'
import type { StockStatus } from '@/types'
import { ProductDetailDrawer } from '@/pages/inventory/components/ProductDetailDrawer'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'
import { t } from '@/lib/bilingual/types'


interface ReportInventoryTabProps {
  inventory: AdminInventoryReport
  showDepotColumn: boolean
}

function toStockBadgeStatus(status: InventoryStockStatus): StockStatus {
  if (status === 'normal') return 'healthy'
  return status
}

function StockTable({
  rows,
  showDepotColumn,
  onRowClick,
}: {
  rows: InventoryStockRow[]
  showDepotColumn: boolean
  onRowClick: (id: string) => void
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">Aucun</p>
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface-muted">
      {rows.map((r) => (
        <li key={`${r.product_id}-${r.depot_id}`}>
          <button
            type="button"
            onClick={() => onRowClick(r.product_id)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm bg-surface hover:bg-surface-alt text-left"
          >
            <span className="min-w-0">
              <span className="font-medium truncate block">{r.name}</span>
              <span className="text-xs text-text-muted">
                {showDepotColumn && `${r.depot_name} · `}
                {formatPieces(Number(r.current_stock_pieces))}
                {r.low_stock_threshold != null && r.track_low_stock && (
                  <> · {t(INVENTORY.threshold)} {formatPieces(Number(r.low_stock_threshold))}</>
                )}
                {' · '}
                {t(r.track_low_stock ? REPORTS.tracked : REPORTS.untracked)}
              </span>
            </span>
            <StockStatusBadge status={toStockBadgeStatus(r.stock_status)} />
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ReportInventoryTab({ inventory, showDepotColumn }: ReportInventoryTabProps) {
  const [productId, setProductId] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      <ReportMetric label={t(REPORTS.currentInventoryValue)} amount={Number(inventory.inventory_value_cfa)} className="max-w-xs" />

      <ReportSection title={<BiSectionTitle {...REPORTS.currentStock} />}>
        {inventory.current_stock.length === 0 ? (
          <p className="text-sm text-text-muted">{t(REPORTS.noStockRows)}</p>
        ) : (
          <div className="max-h-80 overflow-x-auto overflow-y-auto rounded-xl bg-surface-muted">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-muted text-xs text-text-secondary">
                <tr>
                  <th className="text-left px-3 py-2">Produit</th>
                  {showDepotColumn && <th className="text-left px-3 py-2">Dépôt</th>}
                  <th className="text-right px-3 py-2">Pièces</th>
                  <th className="text-right px-3 py-2">Valeur</th>
                  <th className="text-right px-3 py-2">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inventory.current_stock.map((r) => (
                  <tr
                    key={`${r.product_id}-${r.depot_id}`}
                    className={cn('hover:bg-surface-alt cursor-pointer')}
                    onClick={() => setProductId(r.product_id)}
                  >
                    <td className="px-3 py-2">{r.name}</td>
                    {showDepotColumn && <td className="px-3 py-2 text-text-secondary">{r.depot_name}</td>}
                    <td className="px-3 py-2 text-right tabular-nums">{formatPieces(Number(r.current_stock_pieces))}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyDisplay amount={r.stock_value_cost_cfa ?? r.value_cfa ?? 0} size="small" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <StockStatusBadge status={toStockBadgeStatus(r.stock_status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>

      <div className="grid md:grid-cols-2 gap-6">
        <ReportSection title={<BiSectionTitle {...REPORTS.periodMovement} />}>
          {inventory.period_movement.length === 0 ? (
            <p className="text-sm text-text-muted">{t(REPORTS.noLedgerActivity)}</p>
          ) : (
            <ul className="text-sm space-y-1">
              {inventory.period_movement.map((m) => (
                <li key={m.transaction_type} className="flex justify-between">
                  <span>{t(STOCK_TXN_TYPE[m.transaction_type as keyof typeof STOCK_TXN_TYPE] ?? { fr: m.transaction_type, en: m.transaction_type })}</span>
                  <span className="tabular-nums">{formatPieces(Number(m.quantity_pieces))}</span>
                </li>
              ))}
            </ul>
          )}
        </ReportSection>
        <ReportSection title={<BiSectionTitle {...REPORTS.adjustments} />}>
          {inventory.adjustment_breakdown.length === 0 ? (
            <p className="text-sm text-text-muted">{t(REPORTS.noAdjustments)}</p>
          ) : (
            <ul className="text-sm space-y-1">
              {inventory.adjustment_breakdown.map((a) => (
                <li key={a.adjustment_type} className="flex justify-between">
                  <span>{a.adjustment_type}</span>
                  <span className="tabular-nums">{formatPieces(Number(a.quantity_pieces))}</span>
                </li>
              ))}
            </ul>
          )}
        </ReportSection>
      </div>

      <ReportSection title={<BiSectionTitle {...REPORTS.lowStock} />}>
        <StockTable rows={inventory.low_stock} showDepotColumn={showDepotColumn} onRowClick={setProductId} />
      </ReportSection>

      {(inventory.uncosted_stock_count ?? 0) > 0 && (
        <ReportSection title={<BiSectionTitle {...REPORTS.uncostedStock} />}>
          <p className="text-sm text-text-secondary mb-3">{t(REPORTS.uncostedHint)}</p>
          <StockTable rows={inventory.uncosted_stock ?? []} showDepotColumn={showDepotColumn} onRowClick={setProductId} />
        </ReportSection>
      )}

      <ReportSection title={<BiSectionTitle {...REPORTS.outOfStock} />}>
        <StockTable rows={inventory.out_of_stock} showDepotColumn={showDepotColumn} onRowClick={setProductId} />
      </ReportSection>

      <ProductDetailDrawer productId={productId} onClose={() => setProductId(null)} />
    </div>
  )
}
