import { useMemo, useState } from 'react'
import { Plus, Truck } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Badge,
  Button,
  EmptyState,
  FilterBar,
  MoneyDisplay,
  RowChevron,
  Skeleton,
  CLICKABLE_ROW,
  type FilterBarChip,
} from '@/components/ui'
import { ACHATS } from '@/lib/bilingual/achats'
import { COMMON } from '@/lib/bilingual/common'
import {
  BiButtonStack,
  BiEmptyDescription,
  BiEmptyTitle,
  BiPageDescription,
  BiTabLabel,
  BiTableHeader,
} from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { bilingualAriaLabel, t } from '@/lib/bilingual/types'
import { useSupplierList, useUpdateSupplier, type SupplierRow } from '@/hooks/useAchats'
import { SupplierFormModal } from './components/SupplierFormModal'
import { RecordSupplierPaymentModal } from './components/RecordSupplierPaymentModal'
import { parseError } from '@/lib/errors'

const GRID = 'grid-cols-[minmax(10rem,1.4fr)_8rem_7.5rem_6.5rem_1.25rem]'

export function SuppliersPage() {
  const [activeOnly, setActiveOnly] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editRow, setEditRow] = useState<SupplierRow | null>(null)
  const [payRow, setPayRow] = useState<SupplierRow | null>(null)
  const { data, isLoading, isError } = useSupplierList(activeOnly)
  const update = useUpdateSupplier()
  const rows = data?.rows ?? []

  const chips: FilterBarChip[] = useMemo(
    () => [
      { value: 'active', label: <BiTabLabel {...ACHATS.active} />, ariaLabel: bilingualAriaLabel(ACHATS.active) },
      { value: 'all', label: <BiTabLabel {...COMMON.all} />, ariaLabel: bilingualAriaLabel(COMMON.all) },
    ],
    [],
  )

  async function toggleActive(row: SupplierRow) {
    try {
      await update.mutateAsync({ p_supplier_id: row.id, p_is_active: !row.is_active })
    } catch (err) {
      console.error(parseError(err).message)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-3 sm:px-6 py-3 border-b border-border bg-surface flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="text-sm text-text-secondary">
            <BiPageDescription {...ACHATS.suppliersDesc} />
          </p>
          <div className="mt-2">
            <FilterBar
              chips={chips}
              activeChip={activeOnly ? 'active' : 'all'}
              onChipChange={(v) => setActiveOnly(v !== 'all')}
              count={data?.count ?? 0}
            />
          </div>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditRow(null)
            setFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          <BiButtonStack {...ACHATS.newSupplier} />
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-px">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={cn('grid gap-4 px-4 py-3 border-b border-border', GRID)}>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full justify-self-end" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Truck className="h-8 w-8" />}
              title={<BiEmptyTitle {...ACHATS.failedToLoad} />}
              description={<BiEmptyDescription {...COMMON.checkConnection} />}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Truck className="h-8 w-8" />}
              title={<BiEmptyTitle {...ACHATS.emptySuppliers} />}
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
              <BiTableHeader {...ACHATS.name} />
              <BiTableHeader {...ACHATS.phone} />
              <span className="text-right">
                <BiTableHeader {...ACHATS.balance} />
              </span>
              <BiTableHeader {...ACHATS.status} />
              <span />
            </div>
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={cn(
                  'w-full grid gap-4 px-4 py-3 bg-surface border-b border-border items-center text-left',
                  GRID,
                  CLICKABLE_ROW,
                )}
                onClick={() => {
                  setEditRow(row)
                  setFormOpen(true)
                }}
              >
                <span className="text-sm font-medium truncate">{row.name}</span>
                <span className="text-sm text-text-secondary truncate">{row.phone || '\u2014'}</span>
                <MoneyDisplay
                  amount={row.balance_owed_cfa}
                  className={cn(
                    'justify-self-end text-sm',
                    row.balance_owed_cfa > 0 && 'text-danger-foreground font-medium',
                  )}
                />
                <Badge variant={row.is_active ? 'success' : 'neutral'}>
                  <BilingualText {...(row.is_active ? ACHATS.active : ACHATS.inactive)} variant="caption" layout="inline" />
                </Badge>
                <RowChevron />
              </button>
            ))}
          </>
        )}
      </div>

      {rows.some((r) => r.balance_owed_cfa > 0) && (
        <div className="flex-shrink-0 border-t border-border px-4 py-2 bg-surface flex gap-2 overflow-x-auto">
          {rows
            .filter((r) => r.balance_owed_cfa > 0)
            .slice(0, 5)
            .map((r) => (
              <Button key={r.id} type="button" size="sm" variant="secondary" onClick={() => setPayRow(r)}>
                {t(ACHATS.recordPayment)} — {r.name}
              </Button>
            ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!editRow}
            onClick={() => editRow && toggleActive(editRow)}
          >
            {editRow && !editRow.is_active ? t(ACHATS.reactivate) : t(ACHATS.deactivate)}
          </Button>
        </div>
      )}

      <SupplierFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditRow(null)
        }}
        supplier={editRow}
      />
      <RecordSupplierPaymentModal
        open={!!payRow}
        onClose={() => setPayRow(null)}
        supplier={payRow}
      />
    </div>
  )
}
