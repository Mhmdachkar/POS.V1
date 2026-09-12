/**
 * CustomerDetailDrawer — Slide-out panel with full customer details.
 *
 * Sections:
 *   1. Identity (name, phone, address, status, created date)
 *   2. Balance summary (authoritative balance_owed_cfa)
 *   3. Recent sales (last 10 for this customer, depot-scoped by RLS)
 *   4. Payment history (last 10 customer_payment records, depot-scoped by RLS)
 *   5. Action bar: Record Payment | Edit | Deactivate/Reactivate (role-gated)
 *
 * Payment model display:
 *   "Credit extended" and "Payment received" — never "allocated to sale".
 *   The sale_id on a sale_payment is informational only.
 *   Customer balance timeline is displayed as independent events.
 *
 * Lifecycle policy displayed:
 *   - Inactive badge shown when is_active=false
 *   - Record Payment available for inactive customers with outstanding balance
 *     (existing debt is still repayable without reactivation)
 *   - Deactivate/Reactivate actions are admin-only
 */

import { useState } from 'react'
import { Edit, Banknote, UserX, UserCheck, Receipt } from 'lucide-react'
import { Drawer, Button, LoadingButton, Badge, Skeleton } from '@/components/ui'
import { formatCFA, formatDate, formatDateTime } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import {
  useCustomer,
  useCustomerPayments,
  useDeactivateCustomer,
  useReactivateCustomer,
} from '@/hooks/useCustomers'
import { useSalesList } from '@/hooks/useSales'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'
import { RecordPaymentModal } from './RecordPaymentModal'
import { CustomerFormModal } from './CustomerFormModal'
import type { Customer } from '@/types/database'

// ─────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mt-5 mb-2 first:mt-0">
      {title}
    </p>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary flex-shrink-0">{label}</span>
      <span className="text-sm text-text-primary text-right font-medium">{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CustomerDetailDrawer (main export)
// ─────────────────────────────────────────────────────────────────

interface CustomerDetailDrawerProps {
  customerId: string | null
  onClose: () => void
}

export function CustomerDetailDrawer({ customerId, onClose }: CustomerDetailDrawerProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showEditModal, setShowEditModal]       = useState(false)
  const [actionError, setActionError]            = useState('')

  const staff  = useAuthStore((s) => s.staff)
  const shiftId = usePOSStore((s) => s.shiftId)
  const isAdmin = staff?.role === 'admin'

  const { data: customer, isLoading: loadingCustomer } = useCustomer(customerId)
  const { data: payments, isLoading: loadingPayments } = useCustomerPayments(customerId)
  const { data: salesData, isLoading: loadingSales }   = useSalesList({
    customerId: customerId ?? undefined,
    depotId: null,   // admin sees all, cashier RLS scopes to their depot
    page: 0,
    pageSize: 10,
  })

  const { mutateAsync: deactivate, isPending: isDeactivating } = useDeactivateCustomer()
  const { mutateAsync: reactivate, isPending: isReactivating } = useReactivateCustomer()
  const isActioning = isDeactivating || isReactivating

  const handleDeactivate = async () => {
    if (!customer) return
    setActionError('')
    try {
      await deactivate({ p_customer_id: customer.id })
    } catch (err) {
      setActionError(parseError(err).message)
    }
  }

  const handleReactivate = async () => {
    if (!customer) return
    setActionError('')
    try {
      await reactivate({ p_customer_id: customer.id })
    } catch (err) {
      setActionError(parseError(err).message)
    }
  }

  const sales = salesData?.data ?? []

  return (
    <>
      <Drawer
        open={!!customerId}
        onClose={onClose}
        title={loadingCustomer ? 'Customer Details' : (customer?.name ?? 'Customer Details')}
        description={customer && !customer.is_active ? 'Inactive customer' : undefined}
        width="md"
      >
        {loadingCustomer ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : !customer ? (
          <p className="text-sm text-text-muted">Customer not found.</p>
        ) : (
          <div>
            {/* ── Section 1: Identity ─── */}
            <SectionHeader title="Customer Info" />
            <div className="space-y-0">
              <DetailRow label="Name" value={
                <span className="flex items-center gap-2">
                  {customer.name}
                  {!customer.is_active && <Badge variant="neutral">Inactive</Badge>}
                </span>
              } />
              <DetailRow label="Phone"   value={customer.phone   ?? <span className="text-text-muted italic">—</span>} />
              <DetailRow label="Address" value={customer.address ?? <span className="text-text-muted italic">—</span>} />
              <DetailRow label="Customer since" value={formatDate(customer.created_at)} />
              {!customer.is_active && customer.deactivated_at && (
                <DetailRow label="Deactivated" value={
                  <span className="text-warning-foreground">{formatDate(customer.deactivated_at)}</span>
                } />
              )}
            </div>

            {/* ── Section 2: Balance ─── */}
            <SectionHeader title="Balance" />
            <div className="rounded-xl border border-border bg-surface-muted p-4">
              <p className="text-xs text-text-secondary mb-1">Outstanding balance owed</p>
              <p className={`text-2xl font-bold tabular-nums ${customer.balance_owed_cfa > 0 ? 'text-danger' : 'text-text-primary'}`}>
                {formatCFA(customer.balance_owed_cfa)}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Pooled balance — not allocated to individual sales.
              </p>
            </div>

            {/* ── Section 3: Recent Sales ─── */}
            <SectionHeader title="Recent Sales" />
            {loadingSales ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : sales.length === 0 ? (
              <p className="text-sm text-text-muted">No sales on record.</p>
            ) : (
              <div className="space-y-px rounded-lg overflow-hidden border border-border">
                {sales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border last:border-0 text-sm">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-3.5 w-3.5 text-text-muted flex-shrink-0" />
                      <span className="font-mono text-xs text-text-secondary">{sale.receipt_number}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-muted">{formatDate(sale.created_at)}</span>
                      <span className="font-semibold tabular-nums text-text-primary">{formatCFA(sale.total_cfa)}</span>
                      {(sale as any).balance_added_cfa > 0 && (
                        <span className="text-xs text-warning-foreground">
                          +{formatCFA((sale as any).balance_added_cfa)} credit
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Section 4: Payment History ─── */}
            <SectionHeader title="Payment History" />
            {loadingPayments ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !payments || payments.length === 0 ? (
              <p className="text-sm text-text-muted">No payments recorded.</p>
            ) : (
              <div className="space-y-px rounded-lg overflow-hidden border border-border">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border last:border-0 text-sm">
                    <div>
                      <p className="text-xs text-text-muted">{formatDateTime(p.recorded_at)}</p>
                      {p.note && <p className="text-xs text-text-secondary italic mt-0.5">{p.note}</p>}
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold tabular-nums ${p.is_reversed ? 'line-through text-text-muted' : 'text-success-foreground'}`}>
                        −{formatCFA(p.amount_cfa)}
                      </p>
                      {p.is_reversed && <Badge variant="neutral" className="text-[10px]">Reversed</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Action error ─── */}
            {actionError && (
              <div className="mt-4 rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
                <p className="text-sm text-danger">{actionError}</p>
              </div>
            )}

            {/* ── Section 5: Actions ─── */}
            <div className="mt-6 pt-4 border-t border-border space-y-2">
              {/* Record Payment — available for any authorized user if balance > 0,
                  including for inactive customers (existing debt is still payable) */}
              {customer.balance_owed_cfa > 0 && (
                <Button
                  className="w-full gap-2"
                  onClick={() => setShowPaymentModal(true)}
                >
                  <Banknote className="h-4 w-4" />
                  Record Payment ({formatCFA(customer.balance_owed_cfa)})
                </Button>
              )}

              {/* Edit — cashier and admin */}
              <Button
                variant="secondary"
                className="w-full gap-2"
                onClick={() => setShowEditModal(true)}
              >
                <Edit className="h-4 w-4" />
                Edit Customer
              </Button>

              {/* Deactivate / Reactivate — admin only */}
              {isAdmin && customer.is_active && (
                <LoadingButton
                  variant="ghost"
                  className="w-full gap-2 text-warning-foreground hover:bg-warning-bg"
                  onClick={handleDeactivate}
                  loading={isDeactivating}
                  disabled={isActioning}
                >
                  <UserX className="h-4 w-4" />
                  Deactivate Customer
                </LoadingButton>
              )}
              {isAdmin && !customer.is_active && (
                <LoadingButton
                  variant="ghost"
                  className="w-full gap-2 text-success-foreground hover:bg-success-bg"
                  onClick={handleReactivate}
                  loading={isReactivating}
                  disabled={isActioning}
                >
                  <UserCheck className="h-4 w-4" />
                  Reactivate Customer
                </LoadingButton>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Record Payment modal */}
      {customer && (
        <RecordPaymentModal
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          customer={customer}
          shiftId={shiftId}
        />
      )}

      {/* Edit Customer modal */}
      {customer && (
        <CustomerFormModal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          customer={customer}
        />
      )}
    </>
  )
}
