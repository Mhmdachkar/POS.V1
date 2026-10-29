/**
 * CustomerDetailDrawer — compact customer account panel.
 *
 * Hierarchy: identity → current balance → financial summary → contact →
 * recent account activity → actions.
 *
 * Recent activity is 3–5 events. Full history lives on
 * /customers/:customerId/activity. Displayed solde is last ledger running balance.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { ADMIN } from '@/lib/bilingual/admin'
import { BiButtonInline, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { Link } from 'react-router-dom'
import { Edit, Banknote, UserX, UserCheck, Download, FileText, MessageCircle } from 'lucide-react'
import { Drawer, Button, LoadingButton, Skeleton } from '@/components/ui'
import { formatDate } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import {
  useCustomer,
  useDeactivateCustomer,
  useReactivateCustomer,
} from '@/hooks/useCustomers'
import {
  CUSTOMER_ACTIVITY_DRAWER_LIMIT,
  emptyActivityMessage,
  useCustomerActivity,
  useCustomerActivitySummary,
  type CustomerActivityTypeFilter,
} from '@/hooks/useCustomerActivity'
import {
  downloadCustomerAccountXlsx,
  fetchCustomerAccountExport,
} from '@/lib/customerAccountExport'
import { exportCustomerStatement } from '@/lib/loadCustomerStatement'
import { authorizedOpenShifts, useOpenShifts } from '@/hooks/useShifts'
import { resolveRequiredShiftId } from '@/lib/posShiftContext'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { useDepotStore } from '@/stores/depotStore'
import { useAuthStore } from '@/stores/authStore'
import { SaleDetailDrawer } from '@/pages/sales/components/SaleDetailDrawer'
import { RecordPaymentModal } from './RecordPaymentModal'
import { CustomerFormModal } from './CustomerFormModal'
import { CustomerFinancialSummary } from './CustomerFinancialSummary'
import { ClientSoldeBlock } from './ClientSoldeBlock'
import { CustomerAvatar, customerAccountTone } from '@/components/customers/CustomerAvatar'
import { clientSoldeKind } from '@/lib/customerAccountBalance'
import { cn } from '@/lib/cn'
import { BilingualText } from '@/components/ui/BilingualText'
import { t } from '@/lib/bilingual/types'
import {
  ActivityEventRow,
  ActivityFilterTabs,
} from './CustomerActivitySection'

function SectionHeader({ title }: { title: ReactNode }) {
  return (
    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2 mt-4 first:mt-0">
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

function contactValue(value: string | null | undefined) {
  return value?.trim() ? value : '—'
}

interface CustomerDetailDrawerProps {
  customerId: string | null
  onClose: () => void
}

export function CustomerDetailDrawer({ customerId, onClose }: CustomerDetailDrawerProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [actionError, setActionError] = useState('')
  const [activityFilter, setActivityFilter] = useState<CustomerActivityTypeFilter>('all')
  const [saleDetailId, setSaleDetailId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const staff = useAuthStore((s) => s.staff)
  const isAdmin = staff?.role === 'admin'
  const currentDepotId = useDepotStore((s) => s.currentDepotId)
  const { data: openShifts } = useOpenShifts()
  const cashierDepotId = staff?.role === 'cashier' ? staff.depot_id : currentDepotId
  const paymentShiftId = resolveRequiredShiftId(
    null,
    cashierDepotId,
    staff?.id,
    authorizedOpenShifts(staff, openShifts),
  )
  const hasOpenShift = !!paymentShiftId

  useEffect(() => {
    setActivityFilter('all')
    setSaleDetailId(null)
    setActionError('')
    setShowPaymentModal(false)
    setShowEditModal(false)
  }, [customerId])

  const { data: customer, isLoading: loadingCustomer } = useCustomer(customerId)
  const {
    data: activity,
    isLoading: loadingActivity,
    isError: activityError,
    refetch: refetchActivity,
  } = useCustomerActivity(customerId, {
    type: activityFilter,
    page: 0,
    pageSize: CUSTOMER_ACTIVITY_DRAWER_LIMIT,
  })
  const { data: summary, isLoading: loadingSummary } = useCustomerActivitySummary(customerId)

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

  const handleExport = async (kind: 'xlsx') => {
    if (!customer) return
    setActionError('')
    setExporting(true)
    try {
      const dataset = await fetchCustomerAccountExport(customer.id)
      downloadCustomerAccountXlsx(dataset)
    } catch (err) {
      setActionError(parseError(err).message || t(CUSTOMERS.exportAccountFailed))
    } finally {
      setExporting(false)
    }
  }

  const handleStatement = async (mode: 'pdf' | 'whatsapp') => {
    if (!customer) return
    setActionError('')
    setExporting(true)
    try {
      await exportCustomerStatement({
        customer,
        depotId: currentDepotId,
        mode,
      })
    } catch (err) {
      setActionError(parseError(err).message || t(CUSTOMERS.exportAccountFailed))
    } finally {
      setExporting(false)
    }
  }

  const events = activity?.data ?? []
  const ledgerBalanceCfa = activity?.accountBalanceCfa
  const soldeLoading = loadingActivity && ledgerBalanceCfa === undefined
  const accountBalanceCfa = ledgerBalanceCfa ?? customer?.balance_owed_cfa ?? 0
  const tone = customer
    ? customerAccountTone({
        balanceOwedCfa: soldeLoading
          ? (customer.balance_owed_cfa ?? 0)
          : Math.max(0, accountBalanceCfa),
        isActive: customer.is_active,
      })
    : 'inactive'
  const hasOutstanding = (customer?.balance_owed_cfa ?? 0) > 0

  return (
    <>
      <Drawer
        open={!!customerId}
        onClose={onClose}
        title={
          customer ? (
            <span className="inline-flex items-center gap-3">
              <CustomerAvatar
                name={customer.name}
                balanceOwedCfa={Math.max(0, accountBalanceCfa)}
                isActive={customer.is_active}
              />
              <span>{customer.name}</span>
            </span>
          ) : (
            loadingCustomer ? t(CUSTOMERS.customerDetails) : t(CUSTOMERS.customerDetails)
          )
        }
        description={
          customer ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>{customer.is_active ? t(CUSTOMERS.activeCustomer) : t(CUSTOMERS.inactiveCustomer)}</span>
              {tone !== 'inactive' && !soldeLoading && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    clientSoldeKind(accountBalanceCfa) === 'due'
                      ? 'bg-danger-bg text-danger-foreground'
                      : 'bg-success-bg text-success-foreground',
                  )}
                >
                  <BilingualText
                    {...(clientSoldeKind(accountBalanceCfa) === 'due'
                      ? CUSTOMERS.accountOwing
                      : clientSoldeKind(accountBalanceCfa) === 'credit'
                        ? CUSTOMERS.accountCreditNote
                        : CUSTOMERS.accountSettled)}
                    variant="caption"
                    layout="inline"
                  />
                </span>
              )}
            </span>
          ) : undefined
        }
        width="lg"
      >
        {loadingCustomer ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : !customer ? (
          <p className="text-sm text-text-muted">{t(CUSTOMERS.notFoundShort)}</p>
        ) : (
          <div className="space-y-1">
            <SectionHeader title={<BiSectionTitle {...CUSTOMERS.balanceSection} />} />
            <div
              className={cn(
                'rounded-xl border p-4',
                tone === 'owing' && 'border-danger/30 bg-danger-bg',
                tone === 'settled' && 'border-success/30 bg-success-bg',
                tone === 'inactive' && 'border-border bg-surface-muted',
              )}
            >
              <ClientSoldeBlock
                accountBalanceCfa={accountBalanceCfa}
                size="medium"
                align="left"
                loading={soldeLoading}
              />
              <p className="text-xs text-text-muted mt-1">
                {t(CUSTOMERS.balanceHelp)}
              </p>
            </div>

            <CustomerFinancialSummary
              className="mt-4"
              summary={summary}
              isLoading={loadingSummary}
              outstandingBalanceCfa={accountBalanceCfa}
              balanceLoading={soldeLoading}
              layout="drawer"
            />

            <SectionHeader title={<BiSectionTitle {...CUSTOMERS.contactSection} />} />
            <DetailRow label={t(CUSTOMERS.phone)} value={contactValue(customer.phone)} />
            <DetailRow label={t(CUSTOMERS.address)} value={contactValue(customer.address)} />
            <DetailRow label={t(CUSTOMERS.colSince)} value={formatDate(customer.created_at)} />
            {!customer.is_active && customer.deactivated_at && (
              <DetailRow
                label={t(ADMIN.deactivatedAt)}
                value={
                  <span className="text-warning-foreground">{formatDate(customer.deactivated_at)}</span>
                }
              />
            )}

            <div className="flex items-end justify-between gap-3 mt-4 mb-2">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t(CUSTOMERS.accountActivity)}
              </p>
              <Link
                to={`/customers/${customer.id}/activity`}
                onClick={onClose}
                className="text-sm font-medium text-primary hover:underline"
              >
                {t(CUSTOMERS.viewAllActivity)}
              </Link>
            </div>
            <ActivityFilterTabs
              value={activityFilter}
              onChange={setActivityFilter}
              className="mb-2"
            />
            {loadingActivity ? (
              <div className="space-y-2" role="status" aria-label={t(CUSTOMERS.loadingActivity)}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : activityError ? (
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-sm text-text-primary">{t(CUSTOMERS.failedActivity)}</p>
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => void refetchActivity()}>
                  {t(CUSTOMERS.tryAgain)}
                </Button>
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-text-muted">{emptyActivityMessage(activityFilter)}</p>
            ) : (
              <div className="rounded-md overflow-hidden border border-border">
                {events.map((event) => (
                  <ActivityEventRow
                    key={`${event.type}-${event.id}`}
                    event={event}
                    onOpenSale={setSaleDetailId}
                  />
                ))}
              </div>
            )}

            {actionError && (
              <div className="mt-4 rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
                <p className="text-sm text-danger-foreground">{actionError}</p>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-border space-y-2">
              {isAdmin && (
                <>
                  <LoadingButton
                    variant="secondary"
                    className="w-full gap-2"
                    loading={exporting}
                    disabled={exporting}
                    onClick={() => { void handleExport('xlsx') }}
                  >
                    <Download className="h-4 w-4" />
                    <BiButtonInline {...CUSTOMERS.exportAccountExcel} />
                  </LoadingButton>
                  <LoadingButton
                    variant="secondary"
                    className="w-full gap-2"
                    loading={exporting}
                    disabled={exporting}
                    onClick={() => { void handleStatement('pdf') }}
                  >
                    <FileText className="h-4 w-4" />
                    <BiButtonInline {...CUSTOMERS.statementPdf} />
                  </LoadingButton>
                  <LoadingButton
                    variant="secondary"
                    className="w-full gap-2"
                    loading={exporting}
                    disabled={exporting}
                    onClick={() => { void handleStatement('whatsapp') }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    <BiButtonInline {...CUSTOMERS.statementWhatsApp} />
                  </LoadingButton>
                </>
              )}

              {!hasOpenShift && (
                <p className="text-xs text-warning-foreground bg-warning-bg border border-warning/20 rounded-md px-3 py-2">
                  {t(SHIFT_COPY.openShiftRequired)}
                </p>
              )}
              <Button
                variant={hasOutstanding ? 'primary' : 'secondary'}
                className="w-full gap-2"
                onClick={() => setShowPaymentModal(true)}
                disabled={!hasOutstanding || !hasOpenShift}
              >
                <Banknote className="h-4 w-4" />
                {t(CUSTOMERS.recordPayment)}
              </Button>

              <Button
                variant="secondary"
                className="w-full gap-2"
                onClick={() => setShowEditModal(true)}
              >
                <Edit className="h-4 w-4" />
                {t(CUSTOMERS.editCustomerBtn)}
              </Button>

              {isAdmin && customer.is_active && (
                <LoadingButton
                  variant="ghost"
                  className="w-full gap-2 text-warning-foreground hover:bg-warning-bg"
                  onClick={handleDeactivate}
                  loading={isDeactivating}
                  disabled={isActioning}
                >
                  <UserX className="h-4 w-4" />
                  {t(CUSTOMERS.deactivateCustomer)}
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
                  {t(CUSTOMERS.reactivateCustomer)}
                </LoadingButton>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {customer && (
        <RecordPaymentModal
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          customer={customer}
          shiftId={null}
        />
      )}

      {customer && (
        <CustomerFormModal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          customer={customer}
        />
      )}

      <SaleDetailDrawer
        saleId={saleDetailId}
        shiftId={null}
        onClose={() => setSaleDetailId(null)}
      />
    </>
  )
}
