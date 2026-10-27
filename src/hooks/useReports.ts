import { useQuery } from '@tanstack/react-query'
import { rpc } from '@/lib/rpc'
import type { AdminCostReport, AdminCostReportParams } from '@/lib/rpc'
import { CACHE_STALE, keepPlaceholderWhen } from '@/lib/cachePolicy'
import type {
  AdminCashReport,
  AdminCustomersReport,
  AdminInventoryReport,
  AdminReportParams,
  AdminSalesReport,
  CashShiftReportRow,
  InventoryStockRow,
  InventoryStockStatus,
  SalesReportProductRow,
  SalesReportReturnRow,
} from '@/types/rpc'

export const reportKeys = {
  all: ['reports'] as const,
  sales: (p: AdminReportParams) => ['reports', 'sales', p] as const,
  inventory: (p: AdminReportParams) => ['reports', 'inventory', p] as const,
  customers: (p: AdminReportParams) => ['reports', 'customers', p] as const,
  cash: (p: AdminReportParams) => ['reports', 'cash', p] as const,
  cost: (p: AdminCostReportParams) => ['reports', 'cost', p] as const,
}

export type ReportFilterParams = Pick<
  AdminReportParams,
  'p_cashier_id' | 'p_category_id' | 'p_product_id' | 'p_shift_id'
>

/**
 * Build RPC params. Optional filter keys are omitted when null so PostgREST
 * can match the Phase 12 3-arg overloads until Phase 18A migration is applied.
 */
function toParams(
  depotId: string | null,
  startDate: string,
  endDate: string,
  filters?: ReportFilterParams,
): AdminReportParams {
  const params: AdminReportParams = {
    p_depot_id: depotId,
    p_start_date: startDate,
    p_end_date: endDate,
  }
  if (filters?.p_cashier_id) params.p_cashier_id = filters.p_cashier_id
  if (filters?.p_category_id) params.p_category_id = filters.p_category_id
  if (filters?.p_product_id) params.p_product_id = filters.p_product_id
  if (filters?.p_shift_id) params.p_shift_id = filters.p_shift_id
  return params
}

function reportPlaceholderScope(previousKey: readonly unknown[], params: AdminReportParams) {
  const prev = previousKey[2] as AdminReportParams | undefined
  if (!prev) return false
  return (
    prev.p_depot_id === params.p_depot_id
    && prev.p_start_date === params.p_start_date
    && prev.p_end_date === params.p_end_date
  )
}

function normalizeProductRow(row: Partial<SalesReportProductRow> & { product_id: string; name: string }): SalesReportProductRow {
  const netSales = Number(row.net_sales_cfa ?? row.net_revenue_cfa ?? 0)
  return {
    product_id: row.product_id,
    name: row.name,
    depot_id: row.depot_id ?? '',
    depot_name: row.depot_name ?? '—',
    category_id: row.category_id ?? null,
    category_name: row.category_name ?? null,
    units_sold: Number(row.units_sold ?? 0),
    returned_qty: Number(row.returned_qty ?? 0),
    net_pieces: Number(row.net_pieces ?? 0),
    gross_sales_cfa: Number(row.gross_sales_cfa ?? netSales),
    returns_cfa: Number(row.returns_cfa ?? 0),
    net_sales_cfa: netSales,
    net_revenue_cfa: Number(row.net_revenue_cfa ?? netSales),
    cogs_cfa: row.margin_status ? null : Number(row.cogs_cfa ?? 0),
    gross_profit_cfa: row.margin_status ? null : Number(row.gross_profit_cfa ?? netSales),
    margin_status: row.margin_status ?? null,
  }
}

function normalizeReturnRow(row: Partial<SalesReportReturnRow> & {
  return_id: string
  sale_id: string
  depot_id: string
  created_at: string
}): SalesReportReturnRow {
  return {
    return_id: row.return_id,
    sale_id: row.sale_id,
    depot_id: row.depot_id,
    refund_amount_cfa: Number(row.refund_amount_cfa ?? 0),
    cash_refunded_cfa: Number(row.cash_refunded_cfa ?? 0),
    balance_adjustment_cfa: Number(row.balance_adjustment_cfa ?? 0),
    created_at: row.created_at,
    receipt_number: row.receipt_number ?? '—',
    cashier_name: row.cashier_name ?? '—',
    shift_id: row.shift_id ?? null,
    items: row.items ?? [],
  }
}

function normalizeStockRow(row: Partial<InventoryStockRow> & {
  product_id: string
  name: string
  depot_id: string
}): InventoryStockRow {
  const rawCost = row.cost_price_cfa ?? row.unit_cost_cfa
  const costNumber = rawCost == null ? null : Number(rawCost)
  const missingCost = costNumber == null || costNumber === 0
  const stock = Number(row.current_stock_pieces ?? 0)
  const tracked = row.track_low_stock ?? false
  const valueCost = missingCost
    ? null
    : Number(row.stock_value_cost_cfa ?? row.value_cfa ?? stock * (costNumber ?? 0))
  const inferredStatus: InventoryStockStatus = !tracked
    ? (stock <= 0 ? 'untracked' : 'normal')
    : stock <= 0
      ? 'out_of_stock'
      : 'normal'
  const stockStatus: InventoryStockStatus = !tracked && stock <= 0
    ? 'untracked'
    : (row.stock_status === 'untracked' ? 'untracked' : (row.stock_status ?? inferredStatus))
  return {
    product_id: row.product_id,
    name: row.name,
    depot_id: row.depot_id,
    depot_name: row.depot_name ?? '—',
    category_id: row.category_id ?? null,
    category_name: row.category_name ?? null,
    current_stock_pieces: stock,
    unit_name: row.unit_name ?? null,
    cost_price_cfa: missingCost ? null : costNumber,
    selling_price_cfa: Number(row.selling_price_cfa ?? 0),
    stock_value_cost_cfa: valueCost,
    stock_value_selling_cfa: Number(row.stock_value_selling_cfa ?? 0),
    stock_status: stockStatus,
    track_low_stock: tracked,
    low_stock_threshold: row.low_stock_threshold ?? null,
    unit_cost_cfa: missingCost ? undefined : (costNumber ?? undefined),
    value_cfa: valueCost ?? undefined,
  }
}

function normalizeShiftRow(row: Partial<CashShiftReportRow> & {
  shift_id: string
  depot_id: string
  cashier_id: string
  opened_at: string
}): CashShiftReportRow {
  return {
    shift_id: row.shift_id,
    depot_id: row.depot_id,
    depot_name: row.depot_name ?? '—',
    cashier_id: row.cashier_id,
    cashier_name: row.cashier_name ?? '—',
    status: row.status ?? 'open',
    opened_at: row.opened_at,
    closed_at: row.closed_at ?? null,
    opening_float_cfa: Number(row.opening_float_cfa ?? 0),
    expected_cash_cfa: row.expected_cash_cfa ?? null,
    actual_cash_cfa: row.actual_cash_cfa ?? null,
    discrepancy_cfa: row.discrepancy_cfa ?? null,
  }
}

/** Fill Phase 18A fields when hosted still returns Phase 12 payloads. */
export function normalizeSalesReport(raw: AdminSalesReport): AdminSalesReport {
  const net = Number(raw.net_sales_cfa ?? 0)
  const txn = Number(raw.transaction_count ?? 0)
  const gp = Number(raw.gross_profit_cfa ?? 0)
  const cogs = raw.cogs_cfa != null
    ? Number(raw.cogs_cfa)
    : Math.round((net - gp) * 100) / 100
  return {
    ...raw,
    cogs_cfa: cogs,
    units_sold: Number(raw.units_sold ?? 0),
    voided_count: Number(raw.voided_count ?? 0),
    voided_amount_cfa: Number(raw.voided_amount_cfa ?? 0),
    no_shift_count: Number(raw.no_shift_count ?? 0),
    no_shift_amount_cfa: Number(raw.no_shift_amount_cfa ?? 0),
    average_sale_cfa: txn > 0 ? Math.round(net / txn) : 0,
    amount_applied_cfa: Number(raw.amount_applied_cfa ?? 0),
    amount_tendered_cfa: Number(raw.amount_tendered_cfa ?? 0),
    balance_added_cfa: Number(raw.balance_added_cfa ?? 0),
    change_cfa: Number(raw.change_cfa ?? 0),
    product_performance: (raw.product_performance ?? []).map(normalizeProductRow),
    returns: (raw.returns ?? []).map(normalizeReturnRow),
    by_depot: raw.by_depot ?? [],
    by_cashier: raw.by_cashier ?? [],
    by_category: raw.by_category ?? [],
    by_shift: raw.by_shift ?? [],
    with_shift_vs_no_shift: raw.with_shift_vs_no_shift ?? {
      with_shift: { count: 0, sales_activity_cfa: 0 },
      no_shift: { count: 0, sales_activity_cfa: 0 },
    },
    daily_series: raw.daily_series ?? [],
  }
}

export function normalizeInventoryReport(raw: AdminInventoryReport): AdminInventoryReport {
  const current = (raw.current_stock ?? []).map(normalizeStockRow)
  const low = (raw.low_stock ?? []).map(normalizeStockRow)
  const out = (raw.out_of_stock ?? [])
    .map(normalizeStockRow)
    .filter((row) => row.track_low_stock && Number(row.current_stock_pieces) <= 0)
  const uncosted = raw.uncosted_stock
    ? raw.uncosted_stock.map(normalizeStockRow)
    : current.filter(
      (row) => Number(row.current_stock_pieces) > 0 && Number(row.cost_price_cfa ?? 0) === 0,
    )
  return {
    ...raw,
    current_stock: current,
    low_stock: low,
    out_of_stock: out,
    uncosted_stock: uncosted,
    uncosted_stock_count: uncosted.length,
    period_movement: (raw.period_movement ?? []).map((m) => ({
      transaction_type: m.transaction_type,
      quantity_pieces: Number(m.quantity_pieces ?? 0),
      transaction_count: Number(m.transaction_count ?? 0),
    })),
    adjustment_breakdown: raw.adjustment_breakdown ?? [],
    low_stock_count: Number(raw.low_stock_count ?? low.length),
    out_of_stock_count: out.length,
  }
}

export function normalizeCustomersReport(raw: AdminCustomersReport): AdminCustomersReport {
  return {
    ...raw,
    reversed_payment_activity_cfa: Number(raw.reversed_payment_activity_cfa ?? 0),
    reversed_payment_activity_count: Number(raw.reversed_payment_activity_count ?? 0),
    payments: (raw.payments ?? []).map((p) => ({
      ...p,
      cashier_name: p.cashier_name ?? null,
    })),
    unattributed_payments: (raw.unattributed_payments ?? []).map((p) => ({
      ...p,
      cashier_name: p.cashier_name ?? null,
    })),
  }
}

export function normalizeCashReport(raw: AdminCashReport): AdminCashReport {
  return {
    ...raw,
    closed_shifts: (raw.closed_shifts ?? []).map(normalizeShiftRow),
    open_shifts: (raw.open_shifts ?? []).map(normalizeShiftRow),
  }
}

export function useSalesReport(
  depotId: string | null,
  startDate: string,
  endDate: string,
  enabled = true,
  filters?: ReportFilterParams,
) {
  const params = toParams(depotId, startDate, endDate, filters)
  return useQuery({
    queryKey: reportKeys.sales(params),
    queryFn: async (): Promise<AdminSalesReport> => {
      const result = await rpc.adminReportSales(params)
      if (result.error) throw result.error
      return normalizeSalesReport(result.data)
    },
    enabled,
    staleTime: CACHE_STALE.reports,
    placeholderData: keepPlaceholderWhen((prevKey) => reportPlaceholderScope(prevKey, params)),
  })
}

export function useInventoryReport(
  depotId: string | null,
  startDate: string,
  endDate: string,
  enabled = true,
  filters?: Pick<AdminReportParams, 'p_category_id' | 'p_product_id'>,
) {
  const params = toParams(depotId, startDate, endDate, filters)
  return useQuery({
    queryKey: reportKeys.inventory(params),
    queryFn: async (): Promise<AdminInventoryReport> => {
      const result = await rpc.adminReportInventory(params)
      if (result.error) throw result.error
      return normalizeInventoryReport(result.data)
    },
    enabled,
    staleTime: CACHE_STALE.reports,
    placeholderData: keepPlaceholderWhen((prevKey) => reportPlaceholderScope(prevKey, params)),
  })
}

export function useCustomersReport(
  depotId: string | null,
  startDate: string,
  endDate: string,
  enabled = true,
) {
  const params = toParams(depotId, startDate, endDate)
  return useQuery({
    queryKey: reportKeys.customers(params),
    queryFn: async (): Promise<AdminCustomersReport> => {
      const result = await rpc.adminReportCustomers(params)
      if (result.error) throw result.error
      return normalizeCustomersReport(result.data)
    },
    enabled,
    staleTime: CACHE_STALE.reports,
    placeholderData: keepPlaceholderWhen((prevKey) => reportPlaceholderScope(prevKey, params)),
  })
}

export function useCashReport(
  depotId: string | null,
  startDate: string,
  endDate: string,
  enabled = true,
) {
  const params = toParams(depotId, startDate, endDate)
  return useQuery({
    queryKey: reportKeys.cash(params),
    queryFn: async (): Promise<AdminCashReport> => {
      const result = await rpc.adminReportCash(params)
      if (result.error) throw result.error
      return normalizeCashReport(result.data)
    },
    enabled,
    staleTime: CACHE_STALE.reports,
    placeholderData: keepPlaceholderWhen((prevKey) => reportPlaceholderScope(prevKey, params)),
  })
}

export function useAdminCostReport(
  params: AdminCostReportParams,
  enabled = true,
) {
  return useQuery({
    queryKey: reportKeys.cost(params),
    queryFn: async (): Promise<AdminCostReport> => {
      const result = await rpc.adminReportCostDetail(params)
      if (result.error) throw result.error
      return result.data
    },
    enabled,
    staleTime: CACHE_STALE.reports,
  })
}
