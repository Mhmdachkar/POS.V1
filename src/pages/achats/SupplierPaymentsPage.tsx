import { useMemo, useState } from 'react'
import { Banknote, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Badge,
  Button,
  EmptyState,
  MoneyDisplay,
  Skeleton,
} from '@/components/ui'
import { formatReportDateTime } from '@/lib/formatters'
import { ACHATS } from '@/lib/bilingual/achats'
import { COMMON } from '@/lib/bilingual/common'
import {
  BiButtonStack,
  BiEmptyDescription,
  BiEmptyTitle,
  BiPageDescription,
  BiTableHeader,
} from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { useSupplierList, useSupplierPaymentList, type SupplierRow } from '@/hooks/useAchats'
import { RecordSupplierPaymentModal } from './components/RecordSupplierPaymentModal'

const GRID = 'grid-cols-[minmax(8rem,1fr)_minmax(7rem,10rem)_minmax(7rem,9rem)_6.5rem_5.5rem_minmax(6rem,1fr)]'

function methodLabel(m: string) {
  if (m === 'mobile') return ACHATS.mobile
  if (m === 'bank') return ACHATS.bank
  return ACHATS.cash
}

export function SupplierPaymentsPage() {
  const { data, isLoading, isError } = useSupplierPaymentList(null)
  const suppliersQ = useSupplierList(true)
  const [payOpen, setPayOpen] = useState(false)
  const [supplierId, setSupplierId] = useState<string>('')
  const rows = data?.rows ?? []

  const selectedSupplier: SupplierRow | null = useMemo(() => {
    const list = suppliersQ.data?.rows ?? []
    return list.find((s) => s.id === supplierId) ?? list.find((s) => s.balance_owed_cfa > 0) ?? null
  }, [suppliersQ.data, supplierId])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-3 sm:px-6 py-3 border-b border-border bg-surface flex flex-wrap items-center gap-3 justify-between">
        <p className="text-sm text-text-secondary">
          <BiPageDescription {...ACHATS.paymentsDesc} />
        </p>
        <div className="flex items-center gap-2">
          <select
            className="h-9 px-2 rounded-md border border-border bg-surface text-sm max-w-[14rem]"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">—</option>
            {(suppliersQ.data?.rows ?? [])
              .filter((s) => s.balance_owed_cfa > 0)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <Button type="button" disabled={!selectedSupplier} onClick={() => setPayOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            <BiButtonStack {...ACHATS.recordPayment} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-px p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full mb-1" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Banknote className="h-8 w-8" />}
              title={<BiEmptyTitle {...ACHATS.failedToLoad} />}
              description={<BiEmptyDescription {...COMMON.checkConnection} />}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Banknote className="h-8 w-8" />}
              title={<BiEmptyTitle {...ACHATS.emptyPayments} />}
            />
          </div>
        ) : (
          <>
            <div
              className={cn(
                'sticky top-0 z-10 grid gap-4 px-4 py-2 bg-surface-muted border-b border-border text-xs font-semibold text-text-secondary',
                GRID,
              )}
            >
              <BiTableHeader {...ACHATS.supplier} />
              <BiTableHeader {...ACHATS.receiptNumber} />
              <BiTableHeader {...ACHATS.recordedAt} />
              <span className="text-right">
                <BiTableHeader {...ACHATS.amount} />
              </span>
              <BiTableHeader {...ACHATS.method} />
              <BiTableHeader {...ACHATS.note} />
            </div>
            {rows.map((row) => (
              <div
                key={row.id}
                className={cn('grid gap-4 px-4 py-3 bg-surface border-b border-border items-center', GRID)}
              >
                <span className="text-sm truncate">{row.supplier_name ?? row.supplier_id}</span>
                <span className="font-mono text-xs tabular-nums truncate">
                  {row.receipt_number || '\u2014'}
                </span>
                <span className="text-sm text-text-secondary tabular-nums">
                  {formatReportDateTime(row.recorded_at)}
                </span>
                <MoneyDisplay amount={row.amount_cfa} className="justify-self-end text-sm font-medium" />
                <Badge variant="neutral">
                  <BilingualText {...methodLabel(row.method)} variant="caption" layout="inline" />
                </Badge>
                <span className="text-sm text-text-secondary truncate">{row.note || '\u2014'}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <RecordSupplierPaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        supplier={selectedSupplier}
      />
    </div>
  )
}
