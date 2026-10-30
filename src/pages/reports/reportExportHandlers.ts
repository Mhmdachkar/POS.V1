import { downloadCsv } from '@/lib/csvExport'
import { cfaExportValue, downloadXlsx, printReportSummary } from '@/lib/reportExport'
import {
  buildReportExportAoa,
  downloadStyledWorkbook,
  exportCfaInt,
  exportTable,
  type ExportColumn,
} from '@/lib/tableExport'
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
import { formatReportPieces } from '@/lib/formatters'
import { REPORTS } from '@/lib/bilingual/reports'
import { t } from '@/lib/bilingual/types'


export type ReportTabId =
  | 'overview'
  | 'sales'
  | 'products'
  | 'inventory'
  | 'customers'
  | 'purchases'
  | 'purchases-products'
  | 'purchases-period'
  | 'payments'
  | 'shifts'
  | 'returns'
  | 'voids'
  | 'transfers'
  | 'audit'
  | 'cost'

export interface PurchasesExportData {
  rows: Array<Record<string, unknown>>
  totals: Record<string, unknown>
}

export interface ReportExportContext {
  tab: ReportTabId
  stamp: string
  startDate: string
  endDate: string
  depotName?: string | null
  salesFilters: SalesExportFilters
  sales?: AdminSalesReport
  inventory?: AdminInventoryReport
  customers?: AdminCustomersReport
  cash?: AdminCashReport
  cost?: AdminCostReport
  purchases?: PurchasesExportData
  purchasesProducts?: PurchasesExportData
  purchasesPeriod?: PurchasesExportData
}

function salesSummaryRows(d: AdminSalesReport): unknown[][] {
  return [
    ['Ventes brutes (CFA)', exportCfaInt(d.sales_activity_cfa)],
    ['Retours (CFA)', exportCfaInt(d.returns_activity_cfa)],
    ['Ventes nettes (CFA)', exportCfaInt(d.net_sales_cfa)],
    ['CMV (CFA)', exportCfaInt(d.cogs_cfa)],
    ['Marge brute (CFA)', exportCfaInt(d.gross_profit_cfa)],
    ['Transactions', d.transaction_count],
    ['Vente moyenne (CFA)', exportCfaInt(d.average_sale_cfa)],
    ['Unités vendues', d.units_sold],
    ['Annulations (nombre)', d.voided_count],
    ['Montant annulé (CFA)', exportCfaInt(d.voided_amount_cfa)],
  ]
}

function reportPeriodLine(ctx: ReportExportContext): string {
  return ctx.startDate === ctx.endDate
    ? `Période : ${ctx.startDate}`
    : `Période : ${ctx.startDate} → ${ctx.endDate}`
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
  const { tab, stamp, sales, inventory, customers, cash, cost, purchases, purchasesProducts, purchasesPeriod } = ctx
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
          exportCfaInt(l.unitPriceCfa),
          exportCfaInt(l.lineTotalCfa),
        ]),
        ['Total des ventes (période sélectionnée)', '', '', '', '', '', '', exportCfaInt(dataset.authoritativeTotalCfa)],
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
        exportCfaInt(p.net_sales_cfa),
        exportCfaInt(p.gross_profit_cfa),
        exportCfaInt(p.cogs_cfa),
      ]),
    )
  } else if (tab === 'inventory' && inventory) {
    downloadCsv(
      `inventaire-${stamp}.csv`,
      ['Produit', 'Dépôt', 'Stock (pièces)', 'Valeur CFA', 'Statut'],
      inventory.current_stock.map((r) => [
        r.name,
        r.depot_name,
        r.current_stock_pieces,
        exportCfaInt(r.stock_value_cost_cfa ?? r.value_cfa ?? 0),
        r.stock_status,
      ]),
    )
  } else if ((tab === 'customers' || tab === 'payments') && customers) {
    downloadCsv(
      `clients-${stamp}.csv`,
      ['Métrique', 'Valeur'],
      [
        ['Solde dû (CFA)', exportCfaInt(customers.outstanding_total_cfa)],
        ['Activité crédit (CFA)', exportCfaInt(customers.credit_activity_cfa)],
        ['Paiements (CFA)', exportCfaInt(customers.payment_activity_cfa)],
        ['Non rattachés (CFA)', exportCfaInt(customers.unattributed_payment_activity_cfa)],
      ],
    )
  } else if (tab === 'shifts' && cash) {
    downloadCsv(
      `services-${stamp}.csv`,
      ['Service', 'Fermé', 'Attendu', 'Réel', 'Écart'],
      cash.closed_shifts.map((s) => [
        s.shift_id,
        s.closed_at ?? '',
        s.expected_cash_cfa != null ? exportCfaInt(s.expected_cash_cfa) : '',
        s.actual_cash_cfa != null ? exportCfaInt(s.actual_cash_cfa) : '',
        s.discrepancy_cfa != null ? exportCfaInt(s.discrepancy_cfa) : '',
      ]),
    )
  } else if (tab === 'cost' && cost) {
    downloadCsv(
      `cout-inventaire-${stamp}.csv`,
      ['Produit', 'Dépôt', 'Catégorie', 'Stock (pièces)', 'Prix coût CFA', 'Valeur au coût', 'Valeur vente', 'Bénéfice potentiel'],
      cost.inventory_cost.map((r) => [
        r.product_name,
        r.depot_name,
        r.category_name,
        r.current_stock_pieces,
        exportCfaInt(r.cost_price_cfa),
        exportCfaInt(r.inventory_value_at_cost),
        exportCfaInt(r.inventory_value_at_selling),
        exportCfaInt(r.potential_profit),
      ]),
    )
  } else if (tab === 'purchases' && purchases) {
    downloadCsv(
      `achats-fournisseurs-${stamp}.csv`,
      ['Fournisseur', 'Acheté', 'À crédit', 'Payé à validation', 'BR', 'Solde dû'],
      purchases.rows.map((r) => [
        r.supplier_name,
        exportCfaInt(Number(r.purchased_cfa)),
        exportCfaInt(Number(r.credit_cfa)),
        exportCfaInt(Number(r.paid_at_validate_cfa)),
        r.receipt_count,
        exportCfaInt(Number(r.balance_owed_cfa)),
      ]),
    )
  } else if (tab === 'purchases-products' && purchasesProducts) {
    downloadCsv(
      `achats-produits-${stamp}.csv`,
      ['Produit', 'Pièces', 'Acheté', 'BR'],
      purchasesProducts.rows.map((r) => [
        r.product_name,
        r.quantity_pieces,
        exportCfaInt(Number(r.purchased_cfa)),
        r.receipt_count,
      ]),
    )
  } else if (tab === 'purchases-period' && purchasesPeriod) {
    downloadCsv(
      `achats-periode-${stamp}.csv`,
      ['Date', 'Acheté', 'À crédit', 'Payé à validation', 'BR'],
      purchasesPeriod.rows.map((r) => [
        r.document_date,
        exportCfaInt(Number(r.purchased_cfa)),
        exportCfaInt(Number(r.credit_cfa)),
        exportCfaInt(Number(r.paid_at_validate_cfa)),
        r.receipt_count,
      ]),
    )
  }
}

export async function exportReportXlsx(ctx: ReportExportContext): Promise<void> {
  const { tab, stamp, sales, inventory, customers, cash, cost, purchases, purchasesProducts, purchasesPeriod } = ctx
  if (tab === 'sales') {
    const dataset = await buildSalesLineDataset(ctx)
    if (!dataset) return
    await downloadSalesExportXlsx(dataset, { depotName: ctx.depotName })
    return
  }
  if (tab === 'overview' && sales) {
    const resume = await buildReportExportAoa({
      title: 'Rapport des ventes — Résumé',
      columns: [
        { header: 'Métrique' },
        { header: 'Valeur' },
      ],
      rows: salesSummaryRows(sales).map((row) => ({
        cells: [row[0], typeof row[1] === 'number' ? exportCfaInt(Number(row[1])) : row[1]],
      })),
      depotName: ctx.depotName,
      filterLines: [reportPeriodLine(ctx)],
    })
    const prodCols: ExportColumn[] = [
      { header: 'Produit' },
      { header: 'Pièces nettes', kind: 'qty', total: true },
      { header: 'Ventes nettes', kind: 'money', total: true },
      { header: 'MB', kind: 'money', total: true },
      { header: 'CMV', kind: 'money', total: true },
    ]
    const prod = await buildReportExportAoa({
      title: 'Rapport des ventes — Produits',
      columns: prodCols,
      rows: sales.product_performance.map((p) => ({
        cells: [
          p.name,
          p.net_pieces,
          exportCfaInt(p.net_sales_cfa),
          exportCfaInt(p.gross_profit_cfa),
          exportCfaInt(p.cogs_cfa),
        ],
      })),
      depotName: ctx.depotName,
      filterLines: [reportPeriodLine(ctx)],
    })
    downloadStyledWorkbook(`rapport-${tab}-${stamp}.xlsx`, [
      {
        name: 'Résumé',
        aoa: resume.aoa,
        headerRowIndex: resume.headerRowIndex,
        lastDataRow: resume.dataEndRow,
        freeze: true,
      },
      {
        name: 'Produits',
        aoa: prod.aoa,
        headerRowIndex: prod.headerRowIndex,
        lastDataRow: prod.dataEndRow,
        moneyCols: [2, 3, 4],
        freeze: true,
      },
    ])
  } else if (tab === 'products' && sales) {
    downloadXlsx(`produits-${stamp}.xlsx`, [{
      name: 'Produits',
      headers: ['Produit', 'Dépôt', 'Qté', 'Ventes nettes', 'MB', 'CMV'],
      rows: sales.product_performance.map((p) => [
        p.name, p.depot_name, p.net_pieces, exportCfaInt(p.net_sales_cfa), exportCfaInt(p.gross_profit_cfa), exportCfaInt(p.cogs_cfa),
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
        exportCfaInt(r.stock_value_cost_cfa ?? r.value_cfa ?? 0),
        r.stock_status,
      ]),
    }])
  } else if ((tab === 'customers' || tab === 'payments') && customers) {
    downloadXlsx(`clients-${stamp}.xlsx`, [{
      name: 'Résumé',
      headers: ['Métrique', 'Valeur'],
      rows: [
        ['Solde dû', exportCfaInt(customers.outstanding_total_cfa)],
        ['Paiements', exportCfaInt(customers.payment_activity_cfa)],
        ['Non rattachés', exportCfaInt(customers.unattributed_payment_activity_cfa)],
      ],
    }])
  } else if (tab === 'shifts' && cash) {
    downloadXlsx(`services-${stamp}.xlsx`, [{
      name: 'Fermés',
      headers: ['Service', 'Caissier', 'Attendu', 'Réel', 'Écart'],
      rows: cash.closed_shifts.map((s) => [
        s.shift_id,
        s.cashier_name,
        exportCfaInt(s.expected_cash_cfa),
        exportCfaInt(s.actual_cash_cfa),
        exportCfaInt(s.discrepancy_cfa),
      ]),
    }])
  } else if (tab === 'returns' && sales) {
    downloadXlsx(`retours-${stamp}.xlsx`, [{
      name: 'Retours',
      headers: ['Quand', 'Ticket', 'Remboursement', 'Espèces', 'Avoir client'],
      rows: sales.returns.map((r) => [
        r.created_at,
        r.receipt_number,
        exportCfaInt(r.refund_amount_cfa),
        exportCfaInt(r.cash_refunded_cfa),
        exportCfaInt(r.balance_adjustment_cfa),
      ]),
    }])
  } else if (tab === 'cost' && cost) {
    const invCols: ExportColumn[] = [
      { header: 'Produit' },
      { header: 'Dépôt' },
      { header: 'Catégorie' },
      { header: 'Stock (pièces)', kind: 'qty', total: true },
      { header: 'Prix coût', kind: 'money' },
      { header: 'Valeur@coût', kind: 'money', total: true },
      { header: 'Valeur@vente', kind: 'money', total: true },
      { header: 'Bénéfice potentiel', kind: 'money', total: true },
    ]
    const restockCols: ExportColumn[] = [
      { header: 'Date', kind: 'date' },
      { header: 'Produit' },
      { header: 'Dépôt' },
      { header: 'Unité' },
      { header: 'Qté', kind: 'qty', total: true },
      { header: 'Pièces', kind: 'qty', total: true },
      { header: 'Coût unit.', kind: 'money' },
      { header: 'Coût total', kind: 'money', total: true },
      { header: 'Note' },
    ]
    const inv = await buildReportExportAoa({
      title: 'Stock — Coût (valorisation)',
      columns: invCols,
      rows: cost.inventory_cost.map((r) => ({
        cells: [
          r.product_name,
          r.depot_name,
          r.category_name,
          r.current_stock_pieces,
          exportCfaInt(r.cost_price_cfa),
          exportCfaInt(r.inventory_value_at_cost),
          exportCfaInt(r.inventory_value_at_selling),
          exportCfaInt(r.potential_profit),
        ],
      })),
      depotName: ctx.depotName,
      filterLines: [reportPeriodLine(ctx)],
    })
    const restock = await buildReportExportAoa({
      title: 'Stock — Coût (réappro)',
      columns: restockCols,
      rows: cost.restock_log.map((r) => ({
        cells: [
          r.entered_at,
          r.product_name,
          r.depot_name,
          r.unit_name ?? `N${r.unit_level}`,
          r.quantity_in_unit,
          r.quantity_pieces,
          exportCfaInt(r.unit_cost_price_cfa),
          exportCfaInt(r.total_cost_cfa),
          r.note ?? '',
        ],
      })),
      depotName: ctx.depotName,
      filterLines: [reportPeriodLine(ctx)],
    })
    downloadStyledWorkbook(`cout-${stamp}.xlsx`, [
      {
        name: 'Valorisation',
        aoa: inv.aoa,
        headerRowIndex: inv.headerRowIndex,
        lastDataRow: inv.dataEndRow,
        moneyCols: [4, 5, 6, 7],
        freeze: true,
      },
      {
        name: 'Réappro',
        aoa: restock.aoa,
        headerRowIndex: restock.headerRowIndex,
        lastDataRow: restock.dataEndRow,
        dateCols: [0],
        moneyCols: [6, 7],
        freeze: true,
      },
    ])
  } else if (tab === 'purchases' && purchases) {
    const columns: ExportColumn[] = [
      { header: 'Fournisseur' },
      { header: 'Acheté', kind: 'money', total: true },
      { header: 'À crédit', kind: 'money', total: true },
      { header: 'Payé à validation', kind: 'money', total: true },
      { header: 'BR', kind: 'qty', total: true },
      { header: 'Solde dû', kind: 'money', total: true },
    ]
    await exportTable({
      kind: 'xlsx',
      columns,
      rows: purchases.rows.map((r) => ({
        cells: [
          r.supplier_name,
          exportCfaInt(Number(r.purchased_cfa)),
          exportCfaInt(Number(r.credit_cfa)),
          exportCfaInt(Number(r.paid_at_validate_cfa)),
          Number(r.receipt_count) || 0,
          exportCfaInt(Number(r.balance_owed_cfa)),
        ],
      })),
      meta: {
        title: 'Achats — Fournisseurs',
        sheetName: 'Fournisseurs',
        basename: `achats-fournisseurs-${stamp}`,
        depotName: ctx.depotName,
        filterLines: [reportPeriodLine(ctx)],
      },
    })
  } else if (tab === 'purchases-products' && purchasesProducts) {
    const columns: ExportColumn[] = [
      { header: 'Produit' },
      { header: 'Pièces', kind: 'qty', total: true },
      { header: 'Acheté', kind: 'money', total: true },
      { header: 'BR', kind: 'qty', total: true },
    ]
    await exportTable({
      kind: 'xlsx',
      columns,
      rows: purchasesProducts.rows.map((r) => ({
        cells: [
          r.product_name,
          r.quantity_pieces,
          exportCfaInt(Number(r.purchased_cfa)),
          Number(r.receipt_count) || 0,
        ],
      })),
      meta: {
        title: 'Achats — Produits',
        sheetName: 'Produits',
        basename: `achats-produits-${stamp}`,
        depotName: ctx.depotName,
        filterLines: [reportPeriodLine(ctx)],
      },
    })
  } else if (tab === 'purchases-period' && purchasesPeriod) {
    const columns: ExportColumn[] = [
      { header: 'Date', kind: 'date' },
      { header: 'Acheté', kind: 'money', total: true },
      { header: 'À crédit', kind: 'money', total: true },
      { header: 'Payé à validation', kind: 'money', total: true },
      { header: 'BR', kind: 'qty', total: true },
    ]
    await exportTable({
      kind: 'xlsx',
      columns,
      rows: purchasesPeriod.rows.map((r) => ({
        cells: [
          r.document_date,
          exportCfaInt(Number(r.purchased_cfa)),
          exportCfaInt(Number(r.credit_cfa)),
          exportCfaInt(Number(r.paid_at_validate_cfa)),
          Number(r.receipt_count) || 0,
        ],
      })),
      meta: {
        title: 'Achats — Période',
        sheetName: 'Période',
        basename: `achats-periode-${stamp}`,
        depotName: ctx.depotName,
        filterLines: [reportPeriodLine(ctx)],
      },
    })
  }
}

export async function exportReportPrint(ctx: ReportExportContext): Promise<void> {
  const { tab, sales, inventory, customers, cash, cost, purchases, purchasesProducts, purchasesPeriod } = ctx
  if (tab === 'sales') {
    const dataset = await buildSalesLineDataset(ctx)
    if (!dataset) return
    printSalesExportPdf(dataset)
    return
  }
  const title = `Rapport Aquilux — ${tab}`
  if (tab === 'overview' && sales) {
    printReportSummary(title, [
      { label: t(REPORTS.grossSales), value: cfaExportValue(sales.sales_activity_cfa) },
      { label: t(REPORTS.returnsMetric), value: cfaExportValue(sales.returns_activity_cfa) },
      { label: t(REPORTS.netSales), value: cfaExportValue(sales.net_sales_cfa) },
      { label: t(REPORTS.cogs), value: cfaExportValue(sales.cogs_cfa) },
      { label: t(REPORTS.grossProfit), value: cfaExportValue(sales.gross_profit_cfa) },
      { label: t(REPORTS.transactionCount), value: String(sales.transaction_count) },
      { label: t(REPORTS.unitsSold), value: formatReportPieces(Number(sales.units_sold)) },
    ])
  } else if (tab === 'inventory' && inventory) {
    printReportSummary(title, [
      { label: t(REPORTS.currentInventoryValue), value: cfaExportValue(inventory.inventory_value_cfa) },
      { label: t(REPORTS.lowStock), value: String(inventory.low_stock_count) },
      { label: t(REPORTS.outOfStock), value: String(inventory.out_of_stock_count) },
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
      { label: t(REPORTS.inventoryValueAtCost), value: cfaExportValue(cost.inventory_totals.total_inventory_value_at_cost) },
      { label: t(REPORTS.inventoryValueAtSelling), value: cfaExportValue(cost.inventory_totals.total_inventory_value_at_selling) },
      { label: t(REPORTS.potentialProfit), value: cfaExportValue(cost.inventory_totals.total_potential_profit) },
      { label: t(REPORTS.totalRestockCost), value: cfaExportValue(cost.period_totals.total_restock_cost_cfa) },
      { label: t(REPORTS.totalRestockPieces), value: formatReportPieces(Number(cost.period_totals.total_restock_quantity_pieces)) },
    ])
  } else if (tab === 'purchases' && purchases) {
    printReportSummary(title, [
      { label: t(REPORTS.purchased), value: cfaExportValue(Number(purchases.totals.purchased_cfa ?? 0)) },
      { label: t(REPORTS.creditPurchases), value: cfaExportValue(Number(purchases.totals.credit_cfa ?? 0)) },
      { label: t(REPORTS.paidAtValidate), value: cfaExportValue(Number(purchases.totals.paid_at_validate_cfa ?? 0)) },
      { label: t(REPORTS.receiptCount), value: String(purchases.totals.receipt_count ?? 0) },
    ])
  } else if (tab === 'purchases-products' && purchasesProducts) {
    printReportSummary(title, [
      { label: t(REPORTS.purchased), value: cfaExportValue(Number(purchasesProducts.totals.purchased_cfa ?? 0)) },
      { label: t(REPORTS.purchasePieces), value: formatReportPieces(Number(purchasesProducts.totals.quantity_pieces ?? 0)) },
      { label: t(REPORTS.receiptCount), value: String(purchasesProducts.totals.receipt_count ?? 0) },
    ])
  } else if (tab === 'purchases-period' && purchasesPeriod) {
    printReportSummary(title, [
      { label: t(REPORTS.purchased), value: cfaExportValue(Number(purchasesPeriod.totals.purchased_cfa ?? 0)) },
      { label: t(REPORTS.creditPurchases), value: cfaExportValue(Number(purchasesPeriod.totals.credit_cfa ?? 0)) },
      { label: t(REPORTS.paidAtValidate), value: cfaExportValue(Number(purchasesPeriod.totals.paid_at_validate_cfa ?? 0)) },
      { label: t(REPORTS.receiptCount), value: String(purchasesPeriod.totals.receipt_count ?? 0) },
    ])
  }
}
