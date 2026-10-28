import { REPORTS } from '@/lib/bilingual/reports'
import type { BilingualPair } from '@/lib/bilingual/types'

export type ReportFilterKey = 'cashier' | 'category' | 'product' | 'service'

export type ReportId =
  | 'sales-summary'
  | 'sales-products'
  | 'sales-categories'
  | 'sales-cashiers'
  | 'sales-returns'
  | 'sales-voids'
  | 'cash-collections'
  | 'cash-z'
  | 'customers-receivables'
  | 'purchases-suppliers'
  | 'stock-inventory'
  | 'stock-movements'
  | 'stock-low'
  | 'stock-cost'
  | 'stock-transfers'
  | 'control-audit'

export interface ReportDef {
  id: ReportId
  path: string
  group: BilingualPair
  title: BilingualPair
  description: BilingualPair
  filters: ReportFilterKey[]
  exportTab: ReportId
}

export const REPORT_GROUPS: Array<{ title: BilingualPair; items: ReportDef[] }> = [
  {
    title: REPORTS.groupSales,
    items: [
      { id: 'sales-summary', path: '/reports/sales/summary', group: REPORTS.groupSales, title: REPORTS.reportSummary, description: REPORTS.descSummary, filters: ['cashier'], exportTab: 'sales-summary' },
      { id: 'sales-products', path: '/reports/sales/products', group: REPORTS.groupSales, title: REPORTS.reportByProduct, description: REPORTS.descByProduct, filters: ['cashier', 'category', 'product'], exportTab: 'sales-products' },
      { id: 'sales-categories', path: '/reports/sales/categories', group: REPORTS.groupSales, title: REPORTS.reportByCategory, description: REPORTS.descByCategory, filters: ['cashier', 'category'], exportTab: 'sales-categories' },
      { id: 'sales-cashiers', path: '/reports/sales/cashiers', group: REPORTS.groupSales, title: REPORTS.reportByCashier, description: REPORTS.descByCashier, filters: ['cashier'], exportTab: 'sales-cashiers' },
      { id: 'sales-returns', path: '/reports/sales/returns', group: REPORTS.groupSales, title: REPORTS.returns, description: REPORTS.descReturns, filters: ['cashier', 'service'], exportTab: 'sales-returns' },
      { id: 'sales-voids', path: '/reports/sales/voids', group: REPORTS.groupSales, title: REPORTS.voids, description: REPORTS.descVoids, filters: ['cashier', 'service'], exportTab: 'sales-voids' },
    ],
  },
  {
    title: REPORTS.groupCash,
    items: [
      { id: 'cash-collections', path: '/reports/cash/collections', group: REPORTS.groupCash, title: REPORTS.reportCollections, description: REPORTS.descCollections, filters: ['cashier'], exportTab: 'cash-collections' },
      { id: 'cash-z', path: '/reports/cash/z', group: REPORTS.groupCash, title: REPORTS.reportZ, description: REPORTS.descZ, filters: ['cashier', 'service'], exportTab: 'cash-z' },
    ],
  },
  {
    title: REPORTS.groupCustomers,
    items: [
      { id: 'customers-receivables', path: '/reports/customers/receivables', group: REPORTS.groupCustomers, title: REPORTS.reportReceivables, description: REPORTS.descReceivables, filters: [], exportTab: 'customers-receivables' },
    ],
  },
  {
    title: REPORTS.groupPurchases,
    items: [
      { id: 'purchases-suppliers', path: '/reports/purchases/suppliers', group: REPORTS.groupPurchases, title: REPORTS.reportPurchases, description: REPORTS.descPurchases, filters: [], exportTab: 'purchases-suppliers' },
    ],
  },
  {
    title: REPORTS.groupStock,
    items: [
      { id: 'stock-inventory', path: '/reports/stock/inventory', group: REPORTS.groupStock, title: REPORTS.inventory, description: REPORTS.descInventory, filters: ['category', 'product'], exportTab: 'stock-inventory' },
      { id: 'stock-movements', path: '/reports/stock/movements', group: REPORTS.groupStock, title: REPORTS.reportMovements, description: REPORTS.descMovements, filters: ['category', 'product'], exportTab: 'stock-movements' },
      { id: 'stock-low', path: '/reports/stock/low', group: REPORTS.groupStock, title: REPORTS.lowStock, description: REPORTS.descLow, filters: ['category'], exportTab: 'stock-low' },
      { id: 'stock-cost', path: '/reports/stock/cost', group: REPORTS.groupStock, title: REPORTS.cost, description: REPORTS.descCost, filters: ['category', 'product'], exportTab: 'stock-cost' },
      { id: 'stock-transfers', path: '/reports/stock/transfers', group: REPORTS.groupStock, title: REPORTS.transfers, description: REPORTS.descTransfers, filters: [], exportTab: 'stock-transfers' },
    ],
  },
  {
    title: REPORTS.groupControl,
    items: [
      { id: 'control-audit', path: '/reports/control/audit', group: REPORTS.groupControl, title: REPORTS.audit, description: REPORTS.descAudit, filters: [], exportTab: 'control-audit' },
    ],
  },
]

export const REPORTS_FLAT: ReportDef[] = REPORT_GROUPS.flatMap((group) => group.items)

export const DEFAULT_REPORT_PATH = '/reports/sales/summary'

export function reportByPath(pathname: string): ReportDef {
  return REPORTS_FLAT.find((item) => item.path === pathname) ?? REPORTS_FLAT[0]
}

export function reportById(id: ReportId): ReportDef {
  return REPORTS_FLAT.find((item) => item.id === id) ?? REPORTS_FLAT[0]
}
