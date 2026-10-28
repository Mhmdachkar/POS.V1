import { Navigate, Route } from 'react-router-dom'
import { lastReportPath } from './lastReport'
import { ReportsLayout } from './ReportsLayout'

function LastReportRedirect() {
  return <Navigate to={lastReportPath()} replace />
}
import {
  CashCollectionsPage,
  CashZPage,
  ControlAuditPage,
  CustomersReceivablesPage,
  PurchasesSuppliersPage,
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
      <Route index element={<LastReportRedirect />} />
      <Route path="sales/summary" element={<SalesSummaryPage />} />
      <Route path="sales/products" element={<SalesProductsPage />} />
      <Route path="sales/categories" element={<SalesCategoriesPage />} />
      <Route path="sales/cashiers" element={<SalesCashiersPage />} />
      <Route path="sales/returns" element={<SalesReturnsPage />} />
      <Route path="sales/voids" element={<SalesVoidsPage />} />
      <Route path="cash/collections" element={<CashCollectionsPage />} />
      <Route path="cash/z" element={<CashZPage />} />
      <Route path="customers/receivables" element={<CustomersReceivablesPage />} />
      <Route path="purchases/suppliers" element={<PurchasesSuppliersPage />} />
      <Route path="stock/inventory" element={<StockInventoryPage />} />
      <Route path="stock/movements" element={<StockMovementsPage />} />
      <Route path="stock/low" element={<StockLowPage />} />
      <Route path="stock/cost" element={<StockCostPage />} />
      <Route path="stock/transfers" element={<StockTransfersPage />} />
      <Route path="control/audit" element={<ControlAuditPage />} />
    </Route>
  )
}
