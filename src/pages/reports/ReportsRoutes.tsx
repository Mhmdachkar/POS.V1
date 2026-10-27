import { Navigate, Route } from 'react-router-dom'
import { ReportsLayout } from './ReportsLayout'
import {
  CashCollectionsPage,
  CashZPage,
  ControlAuditPage,
  CustomersReceivablesPage,
  SalesCashiersPage,
  SalesCategoriesPage,
  SalesProductsPage,
  SalesReturnsPage,
  SalesSummaryPage,
  SalesVoidsPage,
  StockCostPage,
  StockInventoryPage,
  StockLowPage,
  StockMovementsPage,
  StockTransfersPage,
} from './ReportsViews'

export function reportsRouteTree() {
  return (
    <Route path="/reports" element={<ReportsLayout />}>
      <Route index element={<Navigate to="sales/summary" replace />} />
      <Route path="sales/summary" element={<SalesSummaryPage />} />
      <Route path="sales/products" element={<SalesProductsPage />} />
      <Route path="sales/categories" element={<SalesCategoriesPage />} />
      <Route path="sales/cashiers" element={<SalesCashiersPage />} />
      <Route path="sales/returns" element={<SalesReturnsPage />} />
      <Route path="sales/voids" element={<SalesVoidsPage />} />
      <Route path="cash/collections" element={<CashCollectionsPage />} />
      <Route path="cash/z" element={<CashZPage />} />
      <Route path="customers/receivables" element={<CustomersReceivablesPage />} />
      <Route path="stock/inventory" element={<StockInventoryPage />} />
      <Route path="stock/movements" element={<StockMovementsPage />} />
      <Route path="stock/low" element={<StockLowPage />} />
      <Route path="stock/cost" element={<StockCostPage />} />
      <Route path="stock/transfers" element={<StockTransfersPage />} />
      <Route path="control/audit" element={<ControlAuditPage />} />
    </Route>
  )
}
