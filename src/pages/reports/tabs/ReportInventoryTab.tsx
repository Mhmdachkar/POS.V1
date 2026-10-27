import { useCallback, useState } from 'react'
import { BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { COMMON } from '@/lib/bilingual/common'
import { INVENTORY, STOCK_TXN_TYPE } from '@/lib/bilingual/inventory'
import { cn } from '@/lib/cn'
import { MoneyDisplay, PaginationBar, StockStatusBadge } from '@/components/ui'
import { formatReportPieces } from '@/lib/formatters'
import { adjustmentTypeLabel } from '@/lib/auditPresentation'
import type { AdminInventoryReport, InventoryStockRow, InventoryStockStatus } from '@/types/rpc'
import type { StockStatus } from '@/types'
import { ProductDetailDrawer } from '@/pages/inventory/components/ProductDetailDrawer'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'
import { ReportSearchField, useReportSearchPager } from '../components/ReportSearchPager'
import { t } from '@/lib/bilingual/types'


interface ReportInventoryTabProps {
  inventory: AdminInventoryReport
  showDepotColumn: boolean
}

function toStockBadgeStatus(status: InventoryStockStatus): StockStatus {
  if (status === 'normal') return 'healthy'
  if (status === 'untracked') return 'untracked'
  return status
}

function missingCost(row: InventoryStockRow): boolean {
  return row.cost_price_cfa == null || Number(row.cost_price_cfa) === 0
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
    return <p className="text-sm text-text-muted">{t(REPORTS.noneShort)}</p>
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
                {formatReportPieces(Number(r.current_stock_pieces))}
                {r.low_stock_threshold != null && r.track_low_stock && (
                  <> · {t(INVENTORY.threshold)} {formatReportPieces(Number(r.low_stock_threshold))}</>
                )}
                {' · '}
                {t(r.track_low_stock ? REPORTS.tracked : REPORTS.untracked)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {missingCost(r) && (
                <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-medium text-warning-foreground">
                  {t(REPORTS.uncostedStock)}
                </span>
              )}
              <StockStatusBadge status={toStockBadgeStatus(r.stock_status)} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ReportInventoryTab({ inventory, showDepotColumn }: ReportInventoryTabProps) {
  const [productId, setProductId] = useState<string | null>(null)
  const getText = useCallback((r: InventoryStockRow) => `${r.name} ${r.depot_name ?? ''}`, [])
  const pager = useReportSearchPager(inventory.current_stock, getText)
  const piecesTotal = pager.filtered.reduce((s, r) => s + Number(r.current_stock_pieces), 0)
  const valueTotal = pager.filtered.reduce(
    (s, r) => s + (missingCost(r) ? 0 : Number(r.stock_value_cost_cfa ?? r.value_cfa ?? 0)),
    0,
  )

  return (
    <div className="space-y-8">
      <ReportMetric label={t(REPORTS.currentInventoryValue)} amount={Number(inventory.value_at_cost ?? inventory.inventory_value_cfa)} className="max-w-xs" />
      {(inventory.products_without_cost_count ?? inventory.uncosted_stock_count ?? 0) > 0 && (
        <a href="#uncosted-stock" className="inline-flex text-sm font-medium text-warning-foreground underline">
          {t(REPORTS.partialValue(inventory.products_without_cost_count ?? inventory.uncosted_stock_count ?? 0))}
        </a>
      )}

      <ReportSection title={<BiSectionTitle {...REPORTS.currentStock} />}>
        {inventory.current_stock.length === 0 ? (
          <p className="text-sm text-text-muted">{t(REPORTS.noStockRows)}</p>
        ) : (
          <div className="space-y-3">
            <ReportSearchField value={pager.query} onChange={pager.setQuery} />
            <div className="overflow-x-auto rounded-xl bg-surface-muted">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-xs text-text-secondary">
                  <tr>
                    <th className="text-left px-3 py-2">{t(REPORTS.productCol)}</th>
                    {showDepotColumn && <th className="text-left px-3 py-2">{t(REPORTS.depotCol)}</th>}
                    <th className="text-right px-3 py-2">{t(REPORTS.piecesCol)}</th>
                    <th className="text-right px-3 py-2">{t(REPORTS.valueCol)}</th>
                    <th className="text-right px-3 py-2">{t(REPORTS.statusCol)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pager.slice.map((r) => (
                    <tr
                      key={`${r.product_id}-${r.depot_id}`}
                      className={cn('hover:bg-surface-alt cursor-pointer')}
                      onClick={() => setProductId(r.product_id)}
                    >
                      <td className="px-3 py-2">{r.name}</td>
                      {showDepotColumn && <td className="px-3 py-2 text-text-secondary">{r.depot_name}</td>}
                      <td className="px-3 py-2 text-right tabular-nums">{formatReportPieces(Number(r.current_stock_pieces))}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {missingCost(r) ? (
                          <span className="text-text-muted">—</span>
                        ) : (
                          <MoneyDisplay amount={Number(r.stock_value_cost_cfa ?? r.value_cfa ?? 0)} size="small" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="flex shrink-0 items-center justify-end gap-1">
                          {missingCost(r) && (
                            <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-medium text-warning-foreground">
                              {t(REPORTS.uncostedStock)}
                            </span>
                          )}
                          <StockStatusBadge status={toStockBadgeStatus(r.stock_status)} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface font-semibold">
                    <td className="px-3 py-2" colSpan={showDepotColumn ? 2 : 1}>{t(COMMON.total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatReportPieces(piecesTotal)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap"><MoneyDisplay amount={valueTotal} size="small" /></td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <PaginationBar page={pager.page} totalPages={pager.pages} onPageChange={pager.setPage} />
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
                  <span className="tabular-nums">{formatReportPieces(Number(m.quantity_pieces))}</span>
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
                  <span>{adjustmentTypeLabel(a.adjustment_type)}</span>
                  <span className="tabular-nums">{formatReportPieces(Number(a.quantity_pieces))}</span>
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
          <div id="uncosted-stock" />
          <p className="text-sm text-text-secondary mb-3">{t(REPORTS.uncostedHint)}</p>
          <StockTable rows={inventory.uncosted_stock ?? []} showDepotColumn={showDepotColumn} onRowClick={setProductId} />
        </ReportSection>
      )}

      <ReportSection title={<BiSectionTitle {...REPORTS.trackedOutOfStock} />}>
        <StockTable rows={inventory.out_of_stock} showDepotColumn={showDepotColumn} onRowClick={setProductId} />
      </ReportSection>

      <ReportSection title={<BiSectionTitle {...REPORTS.untrackedZeroStock} />}>
        <StockTable
          rows={inventory.current_stock.filter((row) => row.stock_status === 'untracked' && Number(row.current_stock_pieces) <= 0)}
          showDepotColumn={showDepotColumn}
          onRowClick={setProductId}
        />
      </ReportSection>

      <ProductDetailDrawer productId={productId} onClose={() => setProductId(null)} />
    </div>
  )
}
