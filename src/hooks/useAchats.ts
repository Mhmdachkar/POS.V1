import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rpc } from '@/lib/rpc'
import { CACHE_STALE } from '@/lib/cachePolicy'
import { markReportsAndDashboardStale, refreshPosCatalogStock } from '@/lib/cacheInvalidation'
import { asSupplierLedgerRows } from '@/lib/supplierLedger'

export const achatsKeys = {
  all: ['achats'] as const,
  suppliers: (
    activeOnly: boolean,
    search = '',
    sortBy = 'name',
    sortDir = 'asc',
  ) => ['achats', 'suppliers', activeOnly, search, sortBy, sortDir] as const,
  supplier: (id: string) => ['achats', 'supplier', id] as const,
  ledger: (id: string) => ['achats', 'ledger', id] as const,
  supplierReceipts: (id: string) => ['achats', 'supplier-receipts', id] as const,
  receipts: (
    depotId: string | null,
    status: string | null,
    search = '',
    startAt: string | null = null,
    endAt: string | null = null,
  ) => ['achats', 'receipts', depotId, status, search, startAt, endAt] as const,
  receipt: (id: string) => ['achats', 'receipt', id] as const,
  payments: (
    supplierId: string | null,
    search = '',
    startAt: string | null = null,
    endAt: string | null = null,
  ) => ['achats', 'payments', supplierId, search, startAt, endAt] as const,
  report: (depotId: string | null, start: string, end: string, includeZero = false) =>
    ['achats', 'report', depotId, start, end, includeZero] as const,
  reportByProduct: (depotId: string | null, start: string, end: string) =>
    ['achats', 'report-product', depotId, start, end] as const,
  reportByPeriod: (depotId: string | null, start: string, end: string) =>
    ['achats', 'report-period', depotId, start, end] as const,
}

export interface SupplierRow {
  id: string
  name: string
  phone: string | null
  address: string | null
  balance_owed_cfa: number
  is_active: boolean
  created_at: string
  updated_at: string
  email?: string | null
  notes?: string | null
  payment_term_days?: number | null
}

export interface SupplierAccountRow extends SupplierRow {
  purchased_cfa: number
  paid_cfa: number
}

export interface PurchaseReceiptRow {
  id: string
  depot_id: string
  supplier_id: string
  number: string
  status: 'draft' | 'validated' | 'cancelled'
  document_date: string
  external_ref: string | null
  notes: string | null
  subtotal_cfa: number
  total_cfa: number
  payment_mode: 'paid' | 'credit' | null
  payment_method: 'cash' | 'mobile' | 'bank' | null
  validated_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  supplier_name?: string
  /** Joined from suppliers for credit due / En retard. */
  supplier_payment_term_days?: number | null
}

export interface PurchaseReceiptItemRow {
  id: string
  purchase_receipt_id: string
  product_id: string
  unit_level: number
  quantity_in_unit: number
  quantity_pieces: number
  unit_cost_cfa: number
  line_total_cfa: number
  product_name: string
  unit_name: string
  sort_index: number
}

export interface SupplierPaymentRow {
  id: string
  supplier_id: string
  depot_id: string | null
  purchase_receipt_id: string | null
  amount_cfa: number
  method: 'cash' | 'mobile' | 'bank'
  note: string | null
  recorded_by: string
  recorded_at: string
  receipt_number?: string | null
  supplier_name?: string
}

export function useSupplierDetail(id: string | null) {
  return useQuery({
    queryKey: achatsKeys.supplier(id ?? ''),
    queryFn: async () => {
      const result = await rpc.getSupplier(id!)
      if (result.error) throw result.error
      return result.data as SupplierAccountRow
    },
    enabled: !!id,
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function useSupplierLedger(id: string | null) {
  return useQuery({
    queryKey: achatsKeys.ledger(id ?? ''),
    queryFn: async () => {
      const result = await rpc.supplierLedger(id!)
      if (result.error) throw result.error
      return asSupplierLedgerRows(result.data)
    },
    enabled: !!id,
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function useSupplierReceiptList(supplierId: string | null) {
  return useQuery({
    queryKey: achatsKeys.supplierReceipts(supplierId ?? ''),
    queryFn: async () => {
      const result = await rpc.listPurchaseReceipts({
        p_supplier_id: supplierId,
        p_limit: 200,
        p_offset: 0,
      })
      if (result.error) throw result.error
      return result.data as { rows: PurchaseReceiptRow[]; count: number }
    },
    enabled: !!supplierId,
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function useSupplierList(
  activeOnly = true,
  search = '',
  sortBy: 'name' | 'balance_owed_cfa' = 'name',
  sortDir: 'asc' | 'desc' = 'asc',
) {
  return useQuery({
    queryKey: achatsKeys.suppliers(activeOnly, search, sortBy, sortDir),
    queryFn: async () => {
      const result = await rpc.listSuppliers({
        p_active_only: activeOnly,
        p_limit: 200,
        p_offset: 0,
        p_search: search.trim() || null,
        p_sort_by: sortBy,
        p_sort_dir: sortDir,
      })
      if (result.error) throw result.error
      return result.data as { rows: SupplierRow[]; count: number }
    },
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function usePurchaseReceiptList(
  depotId: string | null,
  status: string | null,
  search = '',
  startAt: string | null = null,
  endAt: string | null = null,
  limit = 100,
) {
  return useQuery({
    queryKey: achatsKeys.receipts(depotId, status, search, startAt, endAt),
    queryFn: async () => {
      const result = await rpc.listPurchaseReceipts({
        p_depot_id: depotId,
        p_status: status,
        p_limit: limit,
        p_offset: 0,
        p_search: search.trim() || null,
        p_start_at: startAt,
        p_end_at: endAt,
      })
      if (result.error) throw result.error
      return result.data as { rows: PurchaseReceiptRow[]; count: number }
    },
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function usePurchaseReceiptDetail(id: string | null) {
  return useQuery({
    queryKey: achatsKeys.receipt(id ?? ''),
    queryFn: async () => {
      const result = await rpc.getPurchaseReceipt(id!)
      if (result.error) throw result.error
      return result.data as {
        receipt: PurchaseReceiptRow
        items: PurchaseReceiptItemRow[]
        supplier: {
          id: string
          name: string
          phone: string | null
          address?: string | null
          email?: string | null
          payment_term_days?: number | null
          balance_owed_cfa: number
        }
      }
    },
    enabled: !!id,
  })
}

export function useSupplierPaymentList(
  supplierId: string | null = null,
  search = '',
  startAt: string | null = null,
  endAt: string | null = null,
  limit = 100,
) {
  return useQuery({
    queryKey: achatsKeys.payments(supplierId, search, startAt, endAt),
    queryFn: async () => {
      const result = await rpc.listSupplierPayments({
        ...(supplierId ? { p_supplier_id: supplierId } : {}),
        p_limit: limit,
        p_offset: 0,
        p_search: search.trim() || null,
        p_start_at: startAt,
        p_end_at: endAt,
      })
      if (result.error) throw result.error
      return result.data as { rows: SupplierPaymentRow[]; count: number }
    },
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function usePurchasesReport(
  depotId: string | null,
  startDate: string,
  endDate: string,
  supplierId: string | null = null,
  includeZero = false,
) {
  return useQuery({
    queryKey: achatsKeys.report(depotId, startDate, endDate, includeZero),
    queryFn: async () => {
      const result = await rpc.adminReportPurchases({
        p_depot_id: depotId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_supplier_id: supplierId,
        p_include_zero: includeZero,
      })
      if (result.error) throw result.error
      return result.data as {
        rows: Array<{
          supplier_id: string
          supplier_name: string
          purchased_cfa: number
          credit_cfa: number
          paid_at_validate_cfa: number
          receipt_count: number
          balance_owed_cfa: number
        }>
        totals: {
          purchased_cfa: number
          credit_cfa: number
          paid_at_validate_cfa: number
          receipt_count: number
        }
      }
    },
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function usePurchasesByProductReport(
  depotId: string | null,
  startDate: string,
  endDate: string,
) {
  return useQuery({
    queryKey: achatsKeys.reportByProduct(depotId, startDate, endDate),
    queryFn: async () => {
      const result = await rpc.adminReportPurchasesByProduct({
        p_depot_id: depotId,
        p_start_date: startDate,
        p_end_date: endDate,
      })
      if (result.error) throw result.error
      return result.data as {
        rows: Array<{
          product_id: string
          product_name: string
          quantity_pieces: number
          purchased_cfa: number
          receipt_count: number
        }>
        totals: {
          purchased_cfa: number
          quantity_pieces: number
          receipt_count: number
        }
      }
    },
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function usePurchasesByPeriodReport(
  depotId: string | null,
  startDate: string,
  endDate: string,
) {
  return useQuery({
    queryKey: achatsKeys.reportByPeriod(depotId, startDate, endDate),
    queryFn: async () => {
      const result = await rpc.adminReportPurchasesByPeriod({
        p_depot_id: depotId,
        p_start_date: startDate,
        p_end_date: endDate,
      })
      if (result.error) throw result.error
      return result.data as {
        rows: Array<{
          document_date: string
          purchased_cfa: number
          credit_cfa: number
          paid_at_validate_cfa: number
          receipt_count: number
        }>
        totals: {
          purchased_cfa: number
          credit_cfa: number
          paid_at_validate_cfa: number
          receipt_count: number
        }
      }
    },
    staleTime: CACHE_STALE.customerDetail,
  })
}

function invalidateAchats(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: achatsKeys.all })
  markReportsAndDashboardStale(qc)
}

export function useCreateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      p_name: string
      p_phone?: string | null
      p_address?: string | null
      p_email?: string | null
      p_notes?: string | null
      p_payment_term_days?: number | null
    }) => {
      const result = await rpc.createSupplier(params)
      if (result.error) throw result.error
      return result.data as { id: string }
    },
    onSuccess: () => invalidateAchats(qc),
  })
}

export function useUpdateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      p_supplier_id: string
      p_name?: string | null
      p_phone?: string | null
      p_address?: string | null
      p_is_active?: boolean | null
      p_email?: string | null
      p_notes?: string | null
      p_payment_term_days?: number | null
    }) => {
      const result = await rpc.updateSupplier(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => invalidateAchats(qc),
  })
}

export function useUpsertPurchaseReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: Parameters<typeof rpc.upsertPurchaseReceipt>[0]) => {
      const result = await rpc.upsertPurchaseReceipt(params)
      if (result.error) throw result.error
      return result.data as { id: string; number: string; total_cfa: number; status: string }
    },
    onSuccess: (data) => {
      invalidateAchats(qc)
      void qc.invalidateQueries({ queryKey: achatsKeys.receipt(data.id) })
    },
  })
}

export function useValidatePurchaseReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      p_purchase_receipt_id: string
      p_payment_mode: 'paid' | 'credit'
      p_payment_method?: 'cash' | 'mobile' | 'bank' | null
    }) => {
      const result = await rpc.validatePurchaseReceipt(params)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_d, vars) => {
      invalidateAchats(qc)
      refreshPosCatalogStock(qc)
      void qc.invalidateQueries({ queryKey: achatsKeys.receipt(vars.p_purchase_receipt_id) })
    },
  })
}

export function useCancelPurchaseReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await rpc.cancelPurchaseReceipt(id)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: (_d, id) => {
      invalidateAchats(qc)
      refreshPosCatalogStock(qc)
      void qc.invalidateQueries({ queryKey: achatsKeys.receipt(id) })
    },
  })
}

export function useRecordSupplierPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      p_supplier_id: string
      p_amount_cfa: number
      p_method: 'cash' | 'mobile' | 'bank'
      p_note?: string | null
      p_depot_id?: string | null
    }) => {
      const result = await rpc.recordSupplierPayment(params)
      if (result.error) throw result.error
      return result.data as {
        id: string
        new_balance_owed_cfa: number
        receipt_number?: string
        amount_cfa?: number
      }
    },
    onSuccess: () => invalidateAchats(qc),
  })
}
