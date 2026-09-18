import { downloadCsv } from '@/lib/csvExport'
import { cfaExportValue, downloadXlsx, printReportSummary } from '@/lib/reportExport'
import {
  buildSalesExportDataset,
  downloadSalesExportXlsx,
  fetchSalesExportLines,
  printSalesExportPdf,
  type SalesExportFilters,
} from '@/lib/salesLineExport'
import type {
  AdminCashReport,
  AdminCustomersReport,
  AdminInventoryReport,
  AdminSalesReport,
} from '@/types/rpc'
import type { AdminCostReport } from '@/lib/rpc'
import { formatPieces } from '@/lib/formatters'
import { REPORTS } from '@/lib/bilingual/reports'

export type ReportTabId =
  | 'overview'
  | 'sales'
  | 'products'
  | 'inventory'
  | 'customers'
  | 'payments'
  | 'shifts'
  | 'returns'
  | 'voids'
  | 'transfers'
  | 'audit'
  | 'cost'

export interface ReportExportContext {
  tab: ReportTabId
  stamp: string
  startDate: string
  endDate: string
  salesFilters: SalesExportFilters
  sales?: AdminSalesReport
  inventory?: AdminInventoryReport
  customers?: AdminCustomersReport
  cash?: AdminCashReport
  cost?: AdminCostReport
}

function salesSummaryRows(d: AdminSalesReport): unknown[][] {
  return [
    ['Ventes brutes (CFA)', d.sales_activity_cfa],
    ['Retours (CFA)', d.returns_activity_cfa],
    ['Ventes nettes (CFA)', d.net_sales_cfa],
    ['CMV (CFA)', d.cogs_cfa],
    ['Marge brute (CFA)', d.gross_profit_cfa],
    ['Transactions', d.transaction_count],
    ['Vente moyenne (CFA)', d.average_sale_cfa],
    ['Unités vendues', d.units_sold],
    ['Annulations (nombre)', d.voided_count],
    ['Montant annulé (CFA)', d.voided_amount_cfa],
  ]
}

async function buildSalesLineDataset(ctx: ReportExportContext) {
  if (!ctx.sales) return null
  const lines = await fetchSalesExportLines(ctx.salesFilters)
  return buildSalesExportDataset(lines, {
    startDate: ctx.startDate,
    endDate: ctx.endDate,
    authoritativeTotalCfa: Number(ctx.sales.sales_activity_cfa),
  })
}

export async function exportReportCsv(ctx: ReportExportContext): Promise<void> {
  const { tab, stamp, sales, inventory, customers, cash, cost } = ctx
  if (tab === 'sales') {
    const dataset = await buildSalesLineDataset(ctx)
    if (!dataset) return
    downloadCsv(
      `Rapport_Ventes_${ctx.startDate === ctx.endDate ? ctx.startDate : `${ctx.startDate}_au_${ctx.endDate}`}.csv`,
      [
        'Date',
        'N° ticket',
        'N° série',
        'Produit',
        'Unité',
        'Quantité',
        'Prix unitaire',
        'Total ligne',
      ],
      [
        ...dataset.lines.map((l) => [
          l.saleCreatedAt.slice(0, 10),
          l.receiptNumber,
          l.serialNumber,
          l.productName,
          l.unitName,
          l.quantity,
          l.unitPriceCfa,
          l.lineTotalCfa,
        ]),
        ['Total des ventes (période sélectionnée)', '', '', '', '', '', '', dataset.authoritativeTotalCfa],
      ],
    )
    return
  }
  if (tab === 'overview' || tab === 'returns' || tab === 'voids') {
    if (!sales) return
    downloadCsv(`rapport-ventes-${stamp}.csv`, ['Métrique', 'Valeur'], salesSummaryRows(sales))
  } else if (tab === 'products' && sales) {
    downloadCsv(
      `produits-${stamp}.csv`,
      ['Produit', 'Dépôt', 'Pièces nettes', 'Ventes nettes CFA', 'MB CFA', 'CMV CFA'],
      sales.product_performance.map((p) => [
        p.name,
        p.depot_name,
        p.net_pieces,
        p.net_sales_cfa,
        p.gross_profit_cfa,
        p.cogs_cfa,
      ]),
    )
  } else if (tab === 'inventory' && inventory) {
    downloadCsv(
      `inventaire-${stamp}.csv`,
      ['Produit', 'Dépôt', 'Stock pièces', 'Valeur CFA', 'Statut'],
      inventory.current_stock.map((r) => [
        r.name,
        r.depot_name,
        r.current_stock_pieces,
        r.stock_value_cost_cfa ?? r.value_cfa ?? 0,
        r.stock_status,
      ]),
    )
  } else if ((tab === 'customers' || tab === 'payments') && customers) {
    downloadCsv(
      `clients-${stamp}.csv`,
      ['Métrique', 'Valeur'],
      [
        ['Solde dû (CFA)', customers.outstanding_total_cfa],
        ['Activité crédit (CFA)', customers.credit_activity_cfa],
        ['Paiements (CFA)', customers.payment_activity_cfa],
        ['Non rattachés (CFA)', customers.unattributed_payment_activity_cfa],
      ],
    )
  } else if (tab === 'shifts' && cash) {
    downloadCsv(
      `services-${stamp}.csv`,
      ['Service', 'Fermé', 'Attendu', 'Réel', 'Écart'],
      cash.closed_shifts.map((s) => [
        s.shift_id,
        s.closed_at ?? '',
        s.expected_cash_cfa ?? '',
        s.actual_cash_cfa ?? '',
        s.discrepancy_cfa ?? '',
      ]),
    )
  } else if (tab === 'cost' && cost) {
    downloadCsv(
      `cout-inventaire-${stamp}.csv`,
      ['Produit', 'Dépôt', 'Catégorie', 'Stock pièces', 'Prix coût CFA', 'Valeur au coût', 'Valeur vente', 'Bénéfice potentiel'],
      cost.inventory_cost.map((r) => [
        r.product_name,
        r.depot_name,
        r.category_name,
        r.current_stock_pieces,
        r.cost_price_cfa,
        r.inventory_value_at_cost,
        r.inventory_value_at_selling,
        r.potential_profit,
      ]),
    )
  }
}

export async function exportReportXlsx(ctx: ReportExportContext): Promise<void> {
  const { tab, stamp, sales, inventory, customers, cash, cost } = ctx
  if (tab === 'sales') {
    const dataset = await buildSalesLineDataset(ctx)
    if (!dataset) return
    downloadSalesExportXlsx(dataset)
    return
  }
  if (tab === 'overview' && sales) {
    downloadXlsx(`rapport-${tab}-${stamp}.xlsx`, [
      { name: 'Résumé', headers: ['Métrique', 'Valeur'], rows: salesSummaryRows(sales) },
      {
        name: 'Produits',
        headers: ['Produit', 'Pièces nettes', 'Ventes nettes', 'MB', 'CMV'],
        rows: sales.product_performance.map((p) => [
          p.name,
          p.net_pieces,
          p.net_sales_cfa,
          p.gross_profit_cfa,
          p.cogs_cfa,
        ]),
      },
    ])
  } else if (tab === 'products' && sales) {
    downloadXlsx(`produits-${stamp}.xlsx`, [{
      name: 'Produits',
      headers: ['Produit', 'Dépôt', 'Qté', 'Ventes nettes', 'MB', 'CMV'],
      rows: sales.product_performance.map((p) => [
        p.name, p.depot_name, p.net_pieces, p.net_sales_cfa, p.gross_profit_cfa, p.cogs_cfa,
      ]),
    }])
  } else if (tab === 'inventory' && inventory) {
    downloadXlsx(`inventaire-${stamp}.xlsx`, [{
      name: 'Stock',
      headers: ['Produit', 'Dépôt', 'Pièces', 'Valeur', 'Statut'],
      rows: inventory.current_stock.map((r) => [
        r.name,
        r.depot_name,
        r.current_stock_pieces,
        r.stock_value_cost_cfa ?? r.value_cfa ?? 0,
        r.stock_status,
      ]),
    }])
  } else if ((tab === 'customers' || tab === 'payments') && customers) {
    downloadXlsx(`clients-${stamp}.xlsx`, [{
      name: 'Résumé',
      headers: ['Métrique', 'Valeur'],
      rows: [
        ['Solde dû', customers.outstanding_total_cfa],
        ['Paiements', customers.payment_activity_cfa],
        ['Non rattachés', customers.unattributed_payment_activity_cfa],
      ],
    }])
  } else if (tab === 'shifts' && cash) {
    downloadXlsx(`services-${stamp}.xlsx`, [{
      name: 'Fermés',
      headers: ['Service', 'Caissier', 'Attendu', 'Réel', 'Écart'],
      rows: cash.closed_shifts.map((s) => [
        s.shift_id,
        s.cashier_name,
        s.expected_cash_cfa,
        s.actual_cash_cfa,
        s.discrepancy_cfa,
      ]),
    }])
  } else if (tab === 'returns' && sales) {
    downloadXlsx(`retours-${stamp}.xlsx`, [{
      name: 'Retours',
      headers: ['Quand', 'Ticket', 'Remboursement', 'Espèces', 'Ajust. solde'],
      rows: sales.returns.map((r) => [
        r.created_at,
        r.receipt_number,
        r.refund_amount_cfa,
        r.cash_refunded_cfa,
        r.balance_adjustment_cfa,
      ]),
    }])
  } else if (tab === 'cost' && cost) {
    downloadXlsx(`cout-${stamp}.xlsx`, [
      {
        name: 'Valorisation inventaire',
        headers: ['Produit', 'Dépôt', 'Catégorie', 'Stock', 'Prix coût', 'Valeur@coût', 'Valeur@vente', 'Bénéfice potentiel'],
        rows: cost.inventory_cost.map((r) => [
          r.product_name,
          r.depot_name,
          r.category_name,
          r.current_stock_pieces,
          r.cost_price_cfa,
          r.inventory_value_at_cost,
          r.inventory_value_at_selling,
          r.potential_profit,
        ]),
      },
      {
        name: 'Journal réappro',
        headers: ['Date', 'Produit', 'Dépôt', 'Unité', 'Qté', 'Pièces', 'Coût unit.', 'Coût total', 'Note'],
        rows: cost.restock_log.map((r) => [
          r.entered_at.slice(0, 10),
          r.product_name,
          r.depot_name,
          r.unit_name ?? `N${r.unit_level}`,
          r.quantity_in_unit,
          r.quantity_pieces,
          r.unit_cost_price_cfa,
          r.total_cost_cfa,
          r.note ?? '',
        ]),
      },
    ])
  }
}

export async function exportReportPrint(ctx: ReportExportContext): Promise<void> {
  const { tab, sales, inventory, customers, cash, cost } = ctx
  if (tab === 'sales') {
    const dataset = await buildSalesLineDataset(ctx)
    if (!dataset) return
    printSalesExportPdf(dataset)
    return
  }
  const title = `Rapport VHM — ${tab}`
  if (tab === 'overview' && sales) {
    printReportSummary(title, [
      { label: REPORTS.grossSales.fr, value: cfaExportValue(sales.sales_activity_cfa) },
      { label: REPORTS.returnsMetric.fr, value: cfaExportValue(sales.returns_activity_cfa) },
      { label: REPORTS.netSales.fr, value: cfaExportValue(sales.net_sales_cfa) },
      { label: REPORTS.cogs.fr, value: cfaExportValue(sales.cogs_cfa) },
      { label: REPORTS.grossProfit.fr, value: cfaExportValue(sales.gross_profit_cfa) },
      { label: REPORTS.transactionCount.fr, value: String(sales.transaction_count) },
      { label: REPORTS.unitsSold.fr, value: formatPieces(Number(sales.units_sold)) },
    ])
  } else if (tab === 'inventory' && inventory) {
    printReportSummary(title, [
      { label: REPORTS.currentInventoryValue.fr, value: cfaExportValue(inventory.inventory_value_cfa) },
      { label: REPORTS.lowStock.fr, value: String(inventory.low_stock_count) },
      { label: REPORTS.outOfStock.fr, value: String(inventory.out_of_stock_count) },
    ])
  } else if (tab === 'customers' && customers) {
    printReportSummary(title, [
      { label: 'Solde dû', value: cfaExportValue(customers.outstanding_total_cfa) },
      { label: 'Paiements (période)', value: cfaExportValue(customers.payment_activity_cfa) },
    ])
  } else if (tab === 'shifts' && cash) {
    printReportSummary(title, [
      { label: 'Attendu (fermés)', value: cfaExportValue(cash.closed_expected_total_cfa) },
      { label: 'Réel (fermés)', value: cfaExportValue(cash.closed_actual_total_cfa) },
      { label: 'Écart', value: cfaExportValue(cash.closed_discrepancy_total_cfa) },
    ])
  } else if (tab === 'cost' && cost) {
    printReportSummary(title, [
      { label: REPORTS.inventoryValueAtCost.fr, value: cfaExportValue(cost.inventory_totals.total_inventory_value_at_cost) },
      { label: REPORTS.inventoryValueAtSelling.fr, value: cfaExportValue(cost.inventory_totals.total_inventory_value_at_selling) },
      { label: REPORTS.potentialProfit.fr, value: cfaExportValue(cost.inventory_totals.total_potential_profit) },
      { label: REPORTS.totalRestockCost.fr, value: cfaExportValue(cost.period_totals.total_restock_cost_cfa) },
      { label: REPORTS.totalRestockPieces.fr, value: formatPieces(Number(cost.period_totals.total_restock_quantity_pieces)) },
    ])
  }
}
