import { useCallback } from 'react'
import { BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { COMMON } from '@/lib/bilingual/common'
import { MoneyDisplay, PaginationBar } from '@/components/ui'
import { formatReportDateTime, formatReportPieces } from '@/lib/formatters'
import { localizedUnitLabel } from '@/lib/localizedUnits'
import { t } from '@/lib/bilingual/types'
import { InfoTip } from '../components/InfoTip'
import type { AdminCostReport, AdminCostInventoryRow, AdminCostRestockRow } from '@/lib/rpc'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'
import { ReportSearchField, useReportSearchPager } from '../components/ReportSearchPager'

interface ReportCostTabProps {
  cost: AdminCostReport
  showDepotColumn: boolean
}

function InventoryValueTable({
  rows,
  showDepotColumn,
}: {
  rows: AdminCostInventoryRow[]
  showDepotColumn: boolean
}) {
  const getText = useCallback((r: AdminCostInventoryRow) => `${r.product_name} ${r.depot_name ?? ''} ${r.category_name ?? ''}`, [])
  const pager = useReportSearchPager(rows, getText)
  const tot = pager.filtered.reduce(
    (s, r) => ({
      pieces: s.pieces + Number(r.current_stock_pieces),
      cost: s.cost + Number(r.inventory_value_at_cost),
      sell: s.sell + Number(r.inventory_value_at_selling),
      profit: s.profit + (r.potential_profit == null ? 0 : Number(r.potential_profit)),
    }),
    { pieces: 0, cost: 0, sell: 0, profit: 0 },
  )
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">{t(REPORTS.noDataPeriod)}</p>
  }
  return (
    <div className="space-y-3">
      <ReportSearchField value={pager.query} onChange={pager.setQuery} />
      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-xs">
            <tr>
              <th className="text-left px-3 py-2">{t(REPORTS.productCol)}</th>
              {showDepotColumn && <th className="text-left px-3 py-2">{t(REPORTS.depotCol)}</th>}
              <th className="text-right px-3 py-2">{t(REPORTS.stockPcs)}</th>
              <th className="text-right px-3 py-2">{t(REPORTS.unitCost)}</th>
              <th className="text-right px-3 py-2">{t(REPORTS.valueAtCost)}</th>
              <th className="text-right px-3 py-2">{t(REPORTS.valueAtSale)}</th>
              <th className="text-right px-3 py-2">{t(REPORTS.profitCol)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pager.slice.map((r) => (
              <tr key={`${r.product_id}-${r.depot_id}`} className="hover:bg-surface-alt">
                <td className="px-3 py-2">
                  <span className="font-medium">{r.product_name}</span>
                  {!Number(r.cost_price_cfa) && (
                    <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">{t(REPORTS.uncostedStock)}</span>
                  )}
                  {r.serial_number && (
                    <span className="block text-xs text-text-muted">{r.serial_number}</span>
                  )}
                  <span className="block text-xs text-text-muted">{r.category_name}</span>
                </td>
                {showDepotColumn && (
                  <td className="px-3 py-2 text-text-secondary">{r.depot_name}</td>
                )}
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatReportPieces(Number(r.current_stock_pieces))}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <MoneyDisplay amount={Number(r.cost_price_cfa)} size="small" />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <MoneyDisplay amount={Number(r.inventory_value_at_cost)} size="small" />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <MoneyDisplay amount={Number(r.inventory_value_at_selling)} size="small" />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {r.potential_profit == null ? (
                    <span className="text-text-muted" title={t(REPORTS.missingValue)}>—</span>
                  ) : (
                    <MoneyDisplay
                      amount={Number(r.potential_profit)}
                      size="small"
                      danger={Number(r.potential_profit) < 0}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-muted font-semibold">
              <td className="px-3 py-2" colSpan={showDepotColumn ? 2 : 1}>{t(COMMON.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatReportPieces(tot.pieces)}</td>
              <td />
              <td className="px-3 py-2 text-right whitespace-nowrap"><MoneyDisplay amount={tot.cost} size="small" /></td>
              <td className="px-3 py-2 text-right whitespace-nowrap"><MoneyDisplay amount={tot.sell} size="small" /></td>
              <td className="px-3 py-2 text-right whitespace-nowrap"><MoneyDisplay amount={tot.profit} size="small" danger={tot.profit < 0} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <PaginationBar page={pager.page} totalPages={pager.pages} onPageChange={pager.setPage} />
    </div>
  )
}

function RestockLogTable({
  rows,
  showDepotColumn,
}: {
  rows: AdminCostRestockRow[]
  showDepotColumn: boolean
}) {
  const getText = useCallback((r: AdminCostRestockRow) => `${r.product_name} ${r.depot_name ?? ''}`, [])
  const pager = useReportSearchPager(rows, getText)
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">{t(REPORTS.noDataPeriod)}</p>
  }
  return (
    <div className="space-y-3">
      <ReportSearchField value={pager.query} onChange={pager.setQuery} />
      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-xs">
            <tr>
              <th className="text-left px-3 py-2">{t(REPORTS.dateCol)}</th>
              <th className="text-left px-3 py-2">{t(REPORTS.productCol)}</th>
              {showDepotColumn && <th className="text-left px-3 py-2">{t(REPORTS.depotCol)}</th>}
              <th className="text-left px-3 py-2">{t(REPORTS.unitCol)}</th>
              <th className="text-right px-3 py-2">{t(REPORTS.qtyCol)}</th>
              <th className="text-right px-3 py-2">{t(REPORTS.piecesCol)}</th>
              <th className="text-right px-3 py-2">{t(REPORTS.unitCost)}</th>
              <th className="text-right px-3 py-2">{t(REPORTS.valueAtCost)}</th>
              <th className="text-left px-3 py-2">{t(REPORTS.noteCol)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pager.slice.map((r) => (
              <tr key={r.stock_entry_id} className="hover:bg-surface-alt">
                <td className="px-3 py-2 text-text-secondary whitespace-nowrap">
                  {formatReportDateTime(r.entered_at)}
                </td>
                <td className="px-3 py-2">
                  <span className="font-medium">{r.product_name}</span>
                  <span className="block text-xs text-text-muted">{r.category_name}</span>
                </td>
                {showDepotColumn && (
                  <td className="px-3 py-2 text-text-secondary">{r.depot_name}</td>
                )}
                <td className="px-3 py-2">
                  {localizedUnitLabel(r.unit_name, r.unit_level)}
                  {r.serial_number && (
                    <span className="block text-xs text-text-muted">{r.serial_number}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.quantity_in_unit}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatReportPieces(Number(r.quantity_pieces))}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <MoneyDisplay amount={Number(r.unit_cost_price_cfa)} size="small" />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <MoneyDisplay amount={Number(r.total_cost_cfa)} size="small" />
                </td>
                <td className="px-3 py-2 text-text-muted text-xs">{r.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationBar page={pager.page} totalPages={pager.pages} onPageChange={pager.setPage} />
    </div>
  )
}

export function ReportCostTab({ cost, showDepotColumn }: ReportCostTabProps) {
  const inv = cost.inventory_totals
  const period = cost.period_totals
  const missingCost = cost.inventory_cost.filter((row) => !Number(row.cost_price_cfa)).length

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ReportMetric
          label={<BiSectionTitle {...REPORTS.inventoryValueAtCost} />}
          amount={Number(inv.total_inventory_value_at_cost)}
        />
        <ReportMetric
          label={<BiSectionTitle {...REPORTS.inventoryValueAtSelling} />}
          amount={Number(inv.total_inventory_value_at_selling)}
        />
        <ReportMetric
          label={<BiSectionTitle {...REPORTS.potentialProfit} />}
          amount={Number(inv.total_potential_profit)}
          danger={Number(inv.total_potential_profit) < 0}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ReportMetric
          label={<BiSectionTitle {...REPORTS.totalRestockCost} />}
          amount={Number(period.total_restock_cost_cfa)}
        />
        <div className="rounded-2xl bg-surface px-4 py-4 shadow-sm ring-1 ring-border">
          <p className="text-xs font-medium text-text-secondary">
            <BiSectionTitle {...REPORTS.totalRestockPieces} />
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {formatReportPieces(Number(period.total_restock_quantity_pieces))}
          </p>
        </div>
      </div>

      {missingCost > 0 && (
        <p className="text-sm text-text-secondary">{t(REPORTS.partialValue(missingCost))}</p>
      )}

      <ReportSection title={<BiSectionTitle {...REPORTS.currentInventoryCost} />}>
        <InventoryValueTable rows={cost.inventory_cost} showDepotColumn={showDepotColumn} />
      </ReportSection>

      <ReportSection title={<span className="inline-flex items-center"><BiSectionTitle {...REPORTS.restockLog} /> <InfoTip text={t(REPORTS.historicalCostNote)} /></span>}>
        <RestockLogTable rows={cost.restock_log} showDepotColumn={showDepotColumn} />
      </ReportSection>
    </div>
  )
}
