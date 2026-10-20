import { useMemo, useState, type ReactNode } from 'react'
import { BiEmptyTitle, BiPageDescription, BiPageTitle, BiTabLabel } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { BarChart2 } from 'lucide-react'
import { EmptyState, PageHeader, Skeleton, Tabs } from '@/components/ui'
import { resolveReportDateRange, type ReportPreset } from '@/lib/reportDates'
import type { ReportFilterParams } from '@/hooks/useReports'
import {
  useCashReport,
  useCustomersReport,
  useInventoryReport,
  useSalesReport,
  useAdminCostReport,
} from '@/hooks/useReports'
import { useCategories } from '@/hooks/useInventory'
import { useStaffList } from '@/hooks/useStaff'
import { useDepotStore } from '@/stores/depotStore'
import { ReportToolbar } from './components/ReportToolbar'
import { UpdatingBanner } from './components/UpdatingBanner'
import { ReportOverviewTab } from './tabs/ReportOverviewTab'
import { ReportSalesTab } from './tabs/ReportSalesTab'
import { ReportProductsTab } from './tabs/ReportProductsTab'
import { ReportInventoryTab } from './tabs/ReportInventoryTab'
import { ReportCustomersTab } from './tabs/ReportCustomersTab'
import { ReportPaymentsTab } from './tabs/ReportPaymentsTab'
import { ReportShiftsTab } from './tabs/ReportShiftsTab'
import { ReportReturnsTab } from './tabs/ReportReturnsTab'
import { ReportVoidsTab } from './tabs/ReportVoidsTab'
import { ReportTransfersTab } from './tabs/ReportTransfersTab'
import { ReportAuditTab } from './tabs/ReportAuditTab'
import { ReportCostTab } from './tabs/ReportCostTab'
import { t } from '@/lib/bilingual/types'
import {
  exportReportCsv,
  exportReportPrint,
  exportReportXlsx,
  type ReportTabId,
} from './reportExportHandlers'

const TAB_ITEMS = [
  { value: 'overview' as const, label: <BiTabLabel {...REPORTS.overview} /> },
  { value: 'sales' as const, label: <BiTabLabel {...REPORTS.sales} /> },
  { value: 'products' as const, label: <BiTabLabel {...REPORTS.products} /> },
  { value: 'inventory' as const, label: <BiTabLabel {...REPORTS.inventory} /> },
  { value: 'customers' as const, label: <BiTabLabel {...REPORTS.customers} /> },
  { value: 'payments' as const, label: <BiTabLabel {...REPORTS.payments} /> },
  { value: 'shifts' as const, label: <BiTabLabel {...REPORTS.shifts} /> },
  { value: 'returns' as const, label: <BiTabLabel {...REPORTS.returns} /> },
  { value: 'voids' as const, label: <BiTabLabel {...REPORTS.voids} /> },
  { value: 'transfers' as const, label: <BiTabLabel {...REPORTS.transfers} /> },
  { value: 'audit' as const, label: <BiTabLabel {...REPORTS.audit} /> },
  { value: 'cost' as const, label: <BiTabLabel {...REPORTS.cost} /> },
] satisfies Array<{ value: ReportTabId; label: ReactNode }>

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTabId>('overview')
  const [preset, setPreset] = useState<ReportPreset>('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [cashierId, setCashierId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [productId, setProductId] = useState('')
  const [shiftId, setShiftId] = useState('')

  const depotId = useDepotStore((s) => s.currentDepotId)
  const showDepotColumn = !depotId

  const range = useMemo(
    () => resolveReportDateRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  )

  const reportFilters = useMemo((): ReportFilterParams => ({
    p_cashier_id: cashierId || null,
    p_category_id: categoryId || null,
    p_product_id: productId || null,
    // Shift filter is only for returns/voids presentation — not Sales report.
    p_shift_id: (tab === 'returns' || tab === 'voids') ? (shiftId || null) : null,
  }), [cashierId, categoryId, productId, shiftId, tab])

  const salesEnabled =
    tab === 'overview' || tab === 'sales' || tab === 'products' || tab === 'returns' || tab === 'voids' || tab === 'shifts'
  const inventoryEnabled = tab === 'overview' || tab === 'inventory'
  const customersEnabled = tab === 'overview' || tab === 'customers' || tab === 'payments'
  const cashEnabled = tab === 'shifts'
  const costEnabled = tab === 'cost'

  const salesQ = useSalesReport(
    depotId,
    range.startDate,
    range.endDate,
    salesEnabled,
    reportFilters,
  )
  const inventoryQ = useInventoryReport(
    depotId,
    range.startDate,
    range.endDate,
    inventoryEnabled,
    {
      p_category_id: categoryId || null,
      p_product_id: productId || null,
    },
  )
  const customersQ = useCustomersReport(
    depotId,
    range.startDate,
    range.endDate,
    customersEnabled,
  )
  const cashQ = useCashReport(depotId, range.startDate, range.endDate, cashEnabled)
  const costQ = useAdminCostReport(
    {
      p_depot_id: depotId ?? null,
      p_start_date: range.startDate,
      p_end_date: range.endDate,
      p_category_id: categoryId || null,
      p_product_id: productId || null,
    },
    costEnabled,
  )

  const { data: staffList } = useStaffList({
    page: 0,
    pageSize: 200,
    search: '',
    status: 'active',
    role: 'all',
  })
  const { data: categories } = useCategories()

  const cashierOptions = useMemo(
    () => (staffList?.data ?? []).map((s) => ({ value: s.id, label: s.full_name })),
    [staffList],
  )
  const categoryOptions = useMemo(
    () => (categories ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categories],
  )
  const productOptions = useMemo(
    () =>
      (salesQ.data?.product_performance ?? []).map((p) => ({
        value: p.product_id,
        label: p.name,
      })),
    [salesQ.data],
  )
  const shiftOptions = useMemo(
    () =>
      (salesQ.data?.by_shift ?? [])
        .filter((s) => s.shift_id)
        .map((s) => ({
          value: s.shift_id!,
          label: s.opened_at ? s.opened_at.slice(0, 16).replace('T', ' ') : s.shift_id!,
        })),
    [salesQ.data],
  )

  const activeQuery =
    tab === 'overview' || tab === 'sales' || tab === 'products' || tab === 'returns' || tab === 'voids'
      ? salesQ
      : tab === 'inventory'
        ? inventoryQ
        : tab === 'customers' || tab === 'payments'
          ? customersQ
          : tab === 'shifts'
            ? cashQ
            : tab === 'cost'
              ? costQ
              : salesQ

  const isFetching =
    (salesEnabled && salesQ.isFetching)
    || (inventoryEnabled && inventoryQ.isFetching)
    || (customersEnabled && customersQ.isFetching)
    || (cashEnabled && cashQ.isFetching)
    || (costEnabled && costQ.isFetching)

  const hasActiveData = !!activeQuery.data

  const showCashier =
    tab === 'sales' || tab === 'products' || tab === 'returns' || tab === 'voids' || tab === 'shifts'
  const showCategory = tab === 'sales' || tab === 'products' || tab === 'inventory' || tab === 'cost'
  const showProduct = tab === 'sales' || tab === 'products' || tab === 'inventory' || tab === 'cost'
  // Sales report no longer filters by shift (active shift workflow removed).
  const showShift = tab === 'returns' || tab === 'voids'

  const exportCtx = useMemo(
    () => ({
      tab,
      stamp: `${range.startDate}_${range.endDate}`,
      startDate: range.startDate,
      endDate: range.endDate,
      salesFilters: {
        depotId,
        startDate: range.startDate,
        endDate: range.endDate,
        cashierId: cashierId || null,
        shiftId: tab === 'sales' ? null : (shiftId || null),
        categoryId: categoryId || null,
        productId: productId || null,
      },
      sales: salesQ.data,
      inventory: inventoryQ.data,
      customers: customersQ.data,
      cash: cashQ.data,
      cost: costQ.data,
    }),
    [
      tab,
      range,
      depotId,
      cashierId,
      shiftId,
      categoryId,
      productId,
      salesQ.data,
      inventoryQ.data,
      customersQ.data,
      cashQ.data,
      costQ.data,
    ],
  )

  function exportDisabled() {
    if (tab === 'transfers' || tab === 'audit') return true
    if (tab === 'inventory') return !inventoryQ.data
    if (tab === 'customers' || tab === 'payments') return !customersQ.data
    if (tab === 'shifts') return !cashQ.data
    if (tab === 'cost') return !costQ.data
    return !salesQ.data
  }

  async function runExport(kind: 'csv' | 'xlsx' | 'print') {
    try {
      if (kind === 'csv') await exportReportCsv(exportCtx)
      else if (kind === 'xlsx') await exportReportXlsx(exportCtx)
      else await exportReportPrint(exportCtx)
    } catch (err) {
      console.error('Report export failed', err)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-surface flex-shrink-0">
        <PageHeader
          title={<BiPageTitle {...REPORTS.pageTitle} />}
          description={<BiPageDescription {...REPORTS.pageDescription} />}
          icon={<BarChart2 className="h-5 w-5" />}
          className="border-b-0"
        />
        <div className="px-3 sm:px-6 pb-3 sm:pb-4 space-y-3">
          <ReportToolbar
            preset={preset}
            onPresetChange={setPreset}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            showCashierFilter={showCashier}
            showCategoryFilter={showCategory}
            showProductFilter={showProduct}
            showShiftFilter={showShift}
            cashierId={cashierId}
            onCashierIdChange={setCashierId}
            categoryId={categoryId}
            onCategoryIdChange={setCategoryId}
            productId={productId}
            onProductIdChange={setProductId}
            shiftId={shiftId}
            onShiftIdChange={setShiftId}
            cashierOptions={cashierOptions}
            categoryOptions={categoryOptions}
            productOptions={productOptions}
            shiftOptions={shiftOptions}
            exportDisabled={exportDisabled()}
            onExportCsv={() => { void runExport('csv') }}
            onExportXlsx={() => { void runExport('xlsx') }}
            onExportPrint={() => { void runExport('print') }}
          />
          <Tabs tabs={TAB_ITEMS} active={tab} onChange={(v) => setTab(v as ReportTabId)} />
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto p-6">
        <UpdatingBanner visible={isFetching && hasActiveData} />

        {activeQuery.isLoading && !hasActiveData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )}

        {activeQuery.isError && !hasActiveData && (
          <EmptyState icon={<BarChart2 className="h-8 w-8" />} title={<BiEmptyTitle {...REPORTS.failedReport} />} />
        )}

        {tab === 'overview' && salesQ.data && (
          <ReportOverviewTab
            sales={salesQ.data}
            inventory={inventoryQ.data}
            customers={customersQ.data}
          />
        )}

        {tab === 'sales' && salesQ.data && (
          <ReportSalesTab
            sales={salesQ.data}
            depotId={depotId}
            startDate={range.startDate}
            endDate={range.endDate}
            cashierId={cashierId || undefined}
          />
        )}

        {tab === 'products' && salesQ.data && (
          <ReportProductsTab sales={salesQ.data} showDepotColumn={showDepotColumn} />
        )}

        {tab === 'inventory' && inventoryQ.data && (
          <ReportInventoryTab inventory={inventoryQ.data} showDepotColumn={showDepotColumn} />
        )}

        {tab === 'customers' && customersQ.data && (
          <ReportCustomersTab customers={customersQ.data} depotScoped={!!depotId} />
        )}

        {tab === 'payments' && customersQ.data && (
          <ReportPaymentsTab customers={customersQ.data} />
        )}

        {tab === 'shifts' && cashQ.data && (
          <ReportShiftsTab cash={cashQ.data} sales={salesQ.data} />
        )}

        {tab === 'returns' && salesQ.data && (
          <ReportReturnsTab sales={salesQ.data} />
        )}

        {tab === 'voids' && salesQ.data && (
          <ReportVoidsTab
            sales={salesQ.data}
            depotId={depotId}
            startDate={range.startDate}
            endDate={range.endDate}
            cashierId={cashierId || undefined}
            shiftId={shiftId || undefined}
          />
        )}

        {tab === 'transfers' && (
          <ReportTransfersTab depotId={depotId} />
        )}

        {tab === 'audit' && (
          <ReportAuditTab
            depotId={depotId}
            startDate={range.startDate}
            endDate={range.endDate}
          />
        )}

        {tab === 'cost' && costQ.data && (
          <ReportCostTab cost={costQ.data} showDepotColumn={showDepotColumn} />
        )}
      </div>
    </div>
  )
}
