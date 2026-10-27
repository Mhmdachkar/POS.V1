import { BiModalTitle as BiSectionTitle, BiEmptyTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { MoneyDisplay } from '@/components/ui'
import { formatReportDateTime, formatReportPieces } from '@/lib/formatters'
import { t } from '@/lib/bilingual/types'
import { InfoTip } from '../components/InfoTip'
import type { AdminCostReport, AdminCostInventoryRow, AdminCostRestockRow } from '@/lib/rpc'
import { ReportMetric } from '../components/ReportMetric'
import { ReportSection } from '../components/ReportSection'

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
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted"><BiEmptyTitle {...REPORTS.noInventoryCostRows} /></p>
  }
  return (
    <div className="overflow-x-auto border border-border rounded-md">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-alt text-xs">
          <tr>
            <th className="text-left px-3 py-2">Produit</th>
            {showDepotColumn && <th className="text-left px-3 py-2">Dépôt</th>}
            <th className="text-right px-3 py-2">Stock (pcs)</th>
            <th className="text-right px-3 py-2">Coût unit.</th>
            <th className="text-right px-3 py-2">Valeur coût</th>
            <th className="text-right px-3 py-2">Valeur vente</th>
            <th className="text-right px-3 py-2">Bénéfice</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
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
              <td className="px-3 py-2 text-right">
                <MoneyDisplay amount={Number(r.cost_price_cfa)} size="small" />
              </td>
              <td className="px-3 py-2 text-right">
                <MoneyDisplay amount={Number(r.inventory_value_at_cost)} size="small" />
              </td>
              <td className="px-3 py-2 text-right">
                <MoneyDisplay amount={Number(r.inventory_value_at_selling)} size="small" />
              </td>
              <td className="px-3 py-2 text-right">
                <MoneyDisplay
                  amount={Number(r.potential_profit)}
                  size="small"
                  danger={Number(r.potential_profit) < 0}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-text-muted">{t(REPORTS.noDataPeriod)}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-alt text-xs">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Produit</th>
              {showDepotColumn && <th className="text-left px-3 py-2">Dépôt</th>}
              <th className="text-left px-3 py-2">Unité</th>
              <th className="text-right px-3 py-2">Qté</th>
              <th className="text-right px-3 py-2">Pièces</th>
              <th className="text-right px-3 py-2">Coût unit.</th>
              <th className="text-right px-3 py-2">Total coût</th>
              <th className="text-left px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
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
                  {r.unit_name ?? (r.unit_level === 0 ? 'Pièce' : `L${r.unit_level}`)}
                  {r.serial_number && (
                    <span className="block text-xs text-text-muted">{r.serial_number}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.quantity_in_unit}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatReportPieces(Number(r.quantity_pieces))}
                </td>
                <td className="px-3 py-2 text-right">
                  <MoneyDisplay amount={Number(r.unit_cost_price_cfa)} size="small" />
                </td>
                <td className="px-3 py-2 text-right">
                  <MoneyDisplay amount={Number(r.total_cost_cfa)} size="small" />
                </td>
                <td className="px-3 py-2 text-text-muted text-xs">{r.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InfoTip text={t(REPORTS.historicalCostNote)} />
    </div>
  )
}

export function ReportCostTab({ cost, showDepotColumn }: ReportCostTabProps) {
  const inv = cost.inventory_totals
  const period = cost.period_totals
  const missingCost = cost.inventory_cost.filter((row) => !Number(row.cost_price_cfa)).length

  return (
    <div className="space-y-8">
      {/* Inventory value metrics */}
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

      {/* Restock period metrics */}
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

      {/* Current inventory cost valuation table */}
      {missingCost > 0 && (
        <p className="text-sm text-text-secondary">{t(REPORTS.partialValue(missingCost))}</p>
      )}

      <ReportSection title={<BiSectionTitle {...REPORTS.currentInventoryCost} />}>
        <InventoryValueTable
          rows={cost.inventory_cost}
          showDepotColumn={showDepotColumn}
        />
      </ReportSection>

      {/* Restock log table */}
      <ReportSection title={<span className="inline-flex items-center"><BiSectionTitle {...REPORTS.restockLog} /> <InfoTip text={t(REPORTS.historicalCostNote)} /></span>}>
        <RestockLogTable
          rows={cost.restock_log}
          showDepotColumn={showDepotColumn}
        />
      </ReportSection>
    </div>
  )
}
