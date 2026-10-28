import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rpc } from '@/lib/rpc'
import { CACHE_STALE } from '@/lib/cachePolicy'
import { markReportsAndDashboardStale, refreshPosCatalogStock } from '@/lib/cacheInvalidation'

export const achatsKeys = {
  all: ['achats'] as const,
  suppliers: (activeOnly: boolean) => ['achats', 'suppliers', activeOnly] as const,
  receipts: (depotId: string | null, status: string | null) =>
    ['achats', 'receipts', depotId, status] as const,
  receipt: (id: string) => ['achats', 'receipt', id] as const,
  payments: (supplierId: string | null) => ['achats', 'payments', supplierId] as const,
  report: (depotId: string | null, start: string, end: string) =>
    ['achats', 'report', depotId, start, end] as const,
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
  supplier_name?: string
}

export function useSupplierList(activeOnly = true) {
  return useQuery({
    queryKey: achatsKeys.suppliers(activeOnly),
    queryFn: async () => {
      const result = await rpc.listSuppliers({
        p_active_only: activeOnly,
        p_limit: 200,
        p_offset: 0,
      })
      if (result.error) throw result.error
      return result.data as { rows: SupplierRow[]; count: number }
    },
    staleTime: CACHE_STALE.customerDetail,
  })
}

export function usePurchaseReceiptList(depotId: string | null, status: string | null) {
  return useQuery({
    queryKey: achatsKeys.receipts(depotId, status),
    queryFn: async () => {
      const result = await rpc.listPurchaseReceipts({
        p_depot_id: depotId,
        p_status: status,
        p_limit: 100,
        p_offset: 0,
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
        supplier: { id: string; name: string; phone: string | null; balance_owed_cfa: number }
      }
    },
    enabled: !!id,
  })
}

export function useSupplierPaymentList(supplierId: string | null = null) {
  return useQuery({
    queryKey: achatsKeys.payments(supplierId),
    queryFn: async () => {
      const result = await rpc.listSupplierPayments({
        p_supplier_id: supplierId,
        p_limit: 100,
        p_offset: 0,
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
) {
  return useQuery({
    queryKey: achatsKeys.report(depotId, startDate, endDate),
    queryFn: async () => {
      const result = await rpc.adminReportPurchases({
        p_depot_id: depotId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_supplier_id: supplierId,
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

function invalidateAchats(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: achatsKeys.all })
  markReportsAndDashboardStale(qc)
}

export function useCreateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { p_name: string; p_phone?: string | null; p_address?: string | null }) => {
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
      return result.data as { id: string; new_balance_owed_cfa: number }
    },
    onSuccess: () => invalidateAchats(qc),
  })
}
