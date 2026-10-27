/**
 * TransferDetailDrawer — pending / completed / cancelled transfer detail.
 *
 * Drafts are immutable. Pending + authorized source/admin: Complete or Cancel.
 * Destination-only depot_staff can view incoming transfers but cannot mutate.
 */

import { useState, type ReactNode } from 'react'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { COMMON } from '@/lib/bilingual/common'
import { BiModalTitle, BiModalTitle as BiSectionTitle, BiButtonInline } from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button, Drawer, Skeleton, TransferStatusBadge } from '@/components/ui'
import { formatDateTime, formatPieces } from '@/lib/formatters'
import { canMutateTransfer, useTransferDetail } from '@/hooks/useTransfers'
import { useAuthStore } from '@/stores/authStore'
import { CompleteTransferModal } from './CompleteTransferModal'
import { CancelTransferModal } from './CancelTransferModal'
import { t } from '@/lib/bilingual/types'


function SectionHeader({ title }: { title: ReactNode }) {
  return (
    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2 mt-4 first:mt-0">
      {title}
    </p>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary flex-shrink-0">{label}</span>
      <span className={cn('text-sm text-right text-text-primary', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  )
}

interface TransferDetailDrawerProps {
  transferId: string | null
  onClose: () => void
}

export function TransferDetailDrawer({ transferId, onClose }: TransferDetailDrawerProps) {
  const [showComplete, setShowComplete] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const staff = useAuthStore((s) => s.staff)
  const { data: transfer, isLoading, isError } = useTransferDetail(transferId)

  const canMutate = canMutateTransfer(staff, transfer)

  return (
    <>
      <Drawer
        open={!!transferId}
        onClose={onClose}
        title={<BiModalTitle {...TRANSFERS.transferDetail} />}
        description={transfer ? formatDateTime(transfer.created_at) : undefined}
        width="lg"
      >
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError || !transfer ? (
          <BilingualText {...TRANSFERS.failedDetail} variant="body" as="p" className="text-danger-foreground" />
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 mb-4">
              <TransferStatusBadge status={transfer.status} />
              {canMutate && (
                <div className="flex gap-1.5">
                  <Button
                    variant="primary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowComplete(true)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <BiButtonInline {...TRANSFERS.completeTransfer} />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowCancel(true)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <BiButtonInline {...COMMON.cancel} />
                  </Button>
                </div>
              )}
            </div>

            <SectionHeader title={<BiSectionTitle {...TRANSFERS.sectionTransfer} />} />
            <DetailRow label="ID" value={transfer.id} mono />
            <DetailRow label={t(TRANSFERS.fromDepot)} value={transfer.from_depot_name} />
            <DetailRow label={t(TRANSFERS.toDepot)} value={transfer.to_depot_name} />
            {transfer.note && <DetailRow label={t(COMMON.notes)} value={transfer.note} />}

            <SectionHeader title={<BiSectionTitle {...TRANSFERS.created} />} />
            <DetailRow label={t(TRANSFERS.by)} value={transfer.created_by_name ?? '—'} />
            <DetailRow label={t(TRANSFERS.at)} value={formatDateTime(transfer.created_at)} />

            {transfer.status === 'completed' && (
              <>
                <SectionHeader title={<BiSectionTitle {...TRANSFERS.completedSection} />} />
                <DetailRow label={t(TRANSFERS.by)} value={transfer.completed_by_name ?? '—'} />
                <DetailRow label={t(TRANSFERS.at)} value={formatDateTime(transfer.completed_at)} />
              </>
            )}

            {transfer.status === 'cancelled' && (
              <>
                <SectionHeader title={<BiSectionTitle {...TRANSFERS.cancelledSection} />} />
                <DetailRow label={t(TRANSFERS.by)} value={transfer.cancelled_by_name ?? '—'} />
                <DetailRow label={t(TRANSFERS.at)} value={formatDateTime(transfer.cancelled_at)} />
                <DetailRow label={t(COMMON.reason)} value={transfer.cancel_reason?.trim() || '—'} />
              </>
            )}

            <SectionHeader title={<BiSectionTitle {...TRANSFERS.lines} />} />
            <div className="rounded-md border border-border overflow-hidden">
              <div className="grid grid-cols-[minmax(6rem,1fr)_minmax(6rem,1fr)_7rem_5.5rem] gap-2 px-3 py-2 bg-surface-muted items-center">
                <span className="text-xs font-semibold text-text-secondary uppercase">{t(TRANSFERS.sourceCol)}</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">{t(TRANSFERS.destinationCol)}</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">{t(TRANSFERS.qty)}</span>
                <span className="text-xs font-semibold text-text-secondary uppercase text-right">{t(TRANSFERS.piecesCol)}</span>
              </div>
              {transfer.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(6rem,1fr)_minmax(6rem,1fr)_7rem_5.5rem] gap-2 px-3 py-2 border-t border-border items-center"
                >
                  <span className="text-sm text-text-primary truncate min-w-0">{item.from_product_name}</span>
                  <span className="text-sm text-text-primary truncate min-w-0">{item.to_product_name}</span>
                  <span className="text-sm text-text-secondary tabular-nums text-right whitespace-nowrap">
                    {item.quantity_in_unit} {item.unit_name}
                  </span>
                  <span className="text-sm text-text-secondary tabular-nums text-right">
                    {formatPieces(item.quantity_pieces)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Drawer>

      {transfer && (
        <>
          <CompleteTransferModal
            open={showComplete}
            onClose={() => setShowComplete(false)}
            transfer={transfer}
          />
          <CancelTransferModal
            open={showCancel}
            onClose={() => setShowCancel(false)}
            transfer={transfer}
          />
        </>
      )}
    </>
  )
}
