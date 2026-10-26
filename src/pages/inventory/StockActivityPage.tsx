/**
 * StockActivityPage — read-only inventory_transactions ledger.
 *
 * Answers "what changed in stock?" for the current depot context.
 * Writes never go through this page. Depot scope comes from TopBar
 * (useDepotStore), not a second dropdown.
 */

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Badge,
  EmptyState,
  FilterBar,
  PageHeader,
  Select,
  Skeleton,
  type BadgeVariant,
  type FilterBarChip,
} from '@/components/ui'
import { formatDateTime, formatPieces } from '@/lib/formatters'
import { useDepotStore } from '@/stores/depotStore'
import {
  STOCK_ACTIVITY_PAGE_SIZE,
  useStockActivity,
  type StockActivityDatePreset,
  type StockActivityRow,
} from '@/hooks/useInventory'
import type { InventoryTransactionType } from '@/types/database'
import { INVENTORY, STOCK_TXN_TYPE } from '@/lib/bilingual/inventory'
import { adjustmentTypeLabel } from '@/lib/auditPresentation'
import { COMMON, commonPageOf } from '@/lib/bilingual/common'
import {
  BiEmptyDescription,
  BiEmptyTitle,
  BiPageDescription,
  BiPageTitle,
  BiTabLabel,
  BiTableHeader,
} from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { t, bilingualAriaLabel, bilingualPlain } from '@/lib/bilingual/types'

export const STOCK_ACTIVITY_DESCRIPTION = bilingualPlain(INVENTORY.stockActivityDesc)

const TYPE_CHIP_VARIANT: Record<InventoryTransactionType, BadgeVariant> = {
  SALE: 'danger',
  RETURN: 'success',
  VOID: 'success',
  RESTOCK: 'success',
  ADJUSTMENT: 'warning',
  TRANSFER_IN: 'success',
  TRANSFER_OUT: 'danger',
}

const TYPE_CHIPS: FilterBarChip[] = [
  { value: 'all', label: <BiTabLabel {...COMMON.all} />, ariaLabel: bilingualAriaLabel(COMMON.all) },
  ...(['SALE', 'RETURN', 'VOID', 'RESTOCK', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT'] as const).map(
    (value) => ({
      value,
      label: <BiTabLabel {...STOCK_TXN_TYPE[value]} />,
      ariaLabel: bilingualAriaLabel(STOCK_TXN_TYPE[value]),
    }),
  ),
]

function datePresets(): Array<{ value: StockActivityDatePreset; label: string }> {
  return [
    { value: 'today', label: bilingualPlain(COMMON.today) },
    { value: 'this_week', label: bilingualPlain(COMMON.thisWeek) },
    { value: 'this_month', label: bilingualPlain(COMMON.thisMonth) },
    { value: 'all', label: bilingualPlain(COMMON.all) },
  ]
}

const GRID_WITH_DEPOT =
  'grid-cols-[minmax(9.5rem,10.5rem)_minmax(8rem,1.3fr)_minmax(6rem,0.8fr)_7.25rem_6.25rem_minmax(6rem,1fr)_minmax(6rem,0.8fr)]'
const GRID_NO_DEPOT =
  'grid-cols-[minmax(9.5rem,10.5rem)_minmax(8rem,1.3fr)_7.25rem_6.25rem_minmax(6rem,1fr)_minmax(6rem,0.8fr)]'

export function formatSignedPieces(quantity: number): string {
  const formatted = formatPieces(quantity)
  return quantity > 0 ? `+${formatted}` : formatted
}

export function stockActivityDetail(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null
  const type = typeof metadata.type === 'string' ? metadata.type : null
  const reason =
    typeof metadata.reason === 'string' && metadata.reason.trim()
      ? metadata.reason.trim()
      : null
  const unitName = typeof metadata.unit_name === 'string' ? metadata.unit_name : null
  const qtyInUnit =
    typeof metadata.quantity_in_unit === 'number' ? metadata.quantity_in_unit : null

  const parts: string[] = []
  // Use friendly bilingual label for adjustment type codes (DAMAGE, LOSS, etc.)
  if (type) parts.push(adjustmentTypeLabel(type))
  if (unitName) {
    parts.push(qtyInUnit != null ? `${qtyInUnit} ${unitName}` : unitName)
  }
  if (reason) parts.push(reason)
  return parts.length > 0 ? parts.join(' · ') : null
}

function TableSkeleton({
  gridCols,
  showDepotColumn,
}: {
  gridCols: string
  showDepotColumn: boolean
}) {
  return (
    <div className="space-y-px" role="status" aria-label={bilingualAriaLabel(INVENTORY.loadingStockActivity)}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={cn('grid gap-4 px-4 py-3 bg-surface border-b border-border items-center', gridCols)}
        >
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full max-w-[10rem]" />
          {showDepotColumn && <Skeleton className="h-4 w-full" />}
          <Skeleton className="h-5 w-full max-w-[5rem] rounded-full" />
          <Skeleton className="h-4 w-full max-w-[4rem] justify-self-end" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full max-w-[6rem]" />
        </div>
      ))}
    </div>
  )
}

function ActivityRow({
  row,
  showDepotColumn,
  gridCols,
}: {
  row: StockActivityRow
  showDepotColumn: boolean
  gridCols: string
}) {
  const txnPair = STOCK_TXN_TYPE[row.transaction_type]
  const typeVariant = TYPE_CHIP_VARIANT[row.transaction_type]
  const detail = stockActivityDetail(row.metadata)
  const positive = row.quantity_pieces > 0

  return (
    <div className={cn('grid gap-4 px-4 py-3 border-b border-border items-center', gridCols)}>
      <span className="text-sm text-text-secondary whitespace-nowrap">
        {formatDateTime(row.created_at)}
      </span>
      <span className="text-sm font-medium text-text-primary truncate min-w-0">
        {row.product_name}
        {!row.product_is_active && (
          <span className="ml-1 text-xs font-normal text-text-muted">
            <BilingualText {...INVENTORY.inactiveProduct} variant="caption" layout="inline" />
          </span>
        )}
      </span>
      {showDepotColumn && (
        <span className="text-sm text-text-secondary truncate min-w-0">
          {row.depot_name ?? '—'}
        </span>
      )}
      <span className="min-w-0">
        <Badge variant={typeVariant ?? 'neutral'}>
          {txnPair ? (
            <BilingualText {...txnPair} variant="badge" enClassName="normal-case" />
          ) : (
            row.transaction_type
          )}
        </Badge>
      </span>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums text-right',
          positive ? 'text-success-foreground' : 'text-danger-foreground',
        )}
      >
        {formatSignedPieces(row.quantity_pieces)}
      </span>
      <span className="text-sm text-text-muted truncate min-w-0">
        {detail ?? '—'}
      </span>
      <span className="text-sm text-text-secondary truncate min-w-0">
        {row.staff_name ?? '—'}
      </span>
    </div>
  )
}

export function StockActivityPage() {
  const [search, setSearch] = useState('')
  const [transactionType, setTransactionType] = useState<InventoryTransactionType | 'all'>('all')
  const [datePreset, setDatePreset] = useState<StockActivityDatePreset>('this_week')
  const [page, setPage] = useState(0)

  const currentDepotId = useDepotStore((s) => s.currentDepotId)
  const showDepotColumn = currentDepotId === null

  useEffect(() => {
    setPage(0)
  }, [currentDepotId])

  const { data, isLoading, isError } = useStockActivity({
    depotId: currentDepotId,
    search,
    transactionType,
    datePreset,
    page,
    pageSize: STOCK_ACTIVITY_PAGE_SIZE,
  })

  const rows = data?.data ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / STOCK_ACTIVITY_PAGE_SIZE)
  const gridCols = showDepotColumn ? GRID_WITH_DEPOT : GRID_NO_DEPOT

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...INVENTORY.stockActivitySection} />}
          description={<BiPageDescription {...INVENTORY.stockActivityDesc} />}
          className="border-b-0"
        />
        <div className="px-3 sm:px-6 pb-3 sm:pb-4">
          <FilterBar
            search={search}
            onSearchChange={(value) => {
              setSearch(value)
              setPage(0)
            }}
            searchPlaceholder={bilingualPlain(INVENTORY.stockActivitySearch)}
            chips={TYPE_CHIPS}
            activeChip={transactionType}
            onChipChange={(value) => {
              setTransactionType(value === 'all' ? 'all' : (value as InventoryTransactionType))
              setPage(0)
            }}
            count={totalCount}
            rightSlot={
              <Select
                aria-label={bilingualAriaLabel(INVENTORY.dateRange)}
                value={datePreset}
                onChange={(e) => {
                  setDatePreset(e.target.value as StockActivityDatePreset)
                  setPage(0)
                }}
                className="w-40"
              >
                {datePresets().map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            }
          />
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
        {isLoading ? (
          <TableSkeleton gridCols={gridCols} showDepotColumn={showDepotColumn} />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<TrendingUp className="h-8 w-8" />}
              title={<BiEmptyTitle {...INVENTORY.failedStockActivity} />}
              description={<BiEmptyDescription {...COMMON.checkConnection} />}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<TrendingUp className="h-8 w-8" />}
              title={<BiEmptyTitle {...INVENTORY.noMovements} />}
              description={
                search || transactionType !== 'all' || datePreset !== 'all'
                  ? <BiEmptyDescription {...INVENTORY.noMovementsFiltered} />
                  : <BiEmptyDescription {...INVENTORY.noMovementsEver} />
              }
            />
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border z-[1]">
              <div className={cn('grid gap-4 px-4 py-2 items-center', gridCols)}>
                <span className="uppercase"><BiTableHeader {...INVENTORY.colWhen} /></span>
                <span className="uppercase"><BiTableHeader {...INVENTORY.colProduct} /></span>
                {showDepotColumn && (
                  <span className="uppercase"><BiTableHeader {...COMMON.depot} /></span>
                )}
                <span className="uppercase"><BiTableHeader {...INVENTORY.colType} /></span>
                <span className="uppercase text-right"><BiTableHeader {...COMMON.qty} /></span>
                <span className="uppercase"><BiTableHeader {...INVENTORY.colDetail} /></span>
                <span className="uppercase"><BiTableHeader {...INVENTORY.colActor} /></span>
              </div>
            </div>

            {rows.map((row) => (
              <ActivityRow
                key={row.id}
                row={row}
                showDepotColumn={showDepotColumn}
                gridCols={gridCols}
              />
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-sm text-text-secondary">
                  <BilingualText {...commonPageOf(page + 1, totalPages)} variant="caption" />
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    aria-label={bilingualAriaLabel(COMMON.previous)}
                    className="px-3 h-8 text-sm rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <BilingualText {...COMMON.previous} variant="caption" layout="inline" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    aria-label={bilingualAriaLabel(COMMON.next)}
                    className="px-3 h-8 text-sm rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <BilingualText {...COMMON.next} variant="caption" layout="inline" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
