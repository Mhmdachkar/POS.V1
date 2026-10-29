import { useEffect, useMemo, useState } from 'react'
import { Package, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Badge,
  Button,
  DatePresetFilter,
  EmptyState,
  FilterBar,
  MoneyDisplay,
  RowChevron,
  Skeleton,
  CLICKABLE_ROW,
  type FilterBarChip,
  type ListDatePreset,
} from '@/components/ui'
import { formatReportDate } from '@/lib/formatters'
import { listDateBounds, resolveReportDateRange } from '@/lib/reportDates'
import { ACHATS } from '@/lib/bilingual/achats'
import { COMMON } from '@/lib/bilingual/common'
import {
  BiButtonInline,
  BiButtonStack,
  BiEmptyDescription,
  BiEmptyTitle,
  BiPageDescription,
  BiTabLabel,
  BiTableHeader,
} from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { bilingualAriaLabel, bilingualPlain, t } from '@/lib/bilingual/types'
import { isCreditOverdue } from '@/lib/supplierDueDate'
import { usePurchaseReceiptList, type PurchaseReceiptRow } from '@/hooks/useAchats'
import { useDepotStore } from '@/stores/depotStore'
import { exportFilteredList } from '@/lib/listExport'
import { PurchaseReceiptDetailDrawer } from './components/PurchaseReceiptDetailDrawer'
import { PurchaseReceiptEditorModal } from './components/PurchaseReceiptEditorModal'

const RECEIPT_EXPORT_HEADERS = ['Numero', 'Statut', 'Date', 'Fournisseur', 'Total CFA']
const SEARCH_DEBOUNCE_MS = 300

const GRID =
  'grid-cols-[minmax(9rem,11rem)_minmax(5.5rem,6.5rem)_minmax(5rem,7rem)_minmax(6rem,1fr)_minmax(6rem,7.5rem)_1.25rem]'

function statusLabel(status: PurchaseReceiptRow['status']) {
  if (status === 'validated') return ACHATS.validated
  if (status === 'cancelled') return ACHATS.cancelled
  return ACHATS.draft
}

function statusVariant(status: PurchaseReceiptRow['status']): 'neutral' | 'success' | 'danger' {
  if (status === 'validated') return 'success'
  if (status === 'cancelled') return 'danger'
  return 'neutral'
}

export function PurchaseReceiptsPage() {
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [datePreset, setDatePreset] = useState<ListDatePreset | null>(null)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const depotId = useDepotStore((s) => s.currentDepotId)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const dateRange = useMemo(
    () => (datePreset ? resolveReportDateRange(datePreset, customStart, customEnd) : null),
    [datePreset, customStart, customEnd],
  )
  const dateSeed = useMemo(() => resolveReportDateRange('today'), [])
  const { startAt, endAt } = listDateBounds(dateRange)

  const { data, isLoading, isError } = usePurchaseReceiptList(
    depotId,
    statusFilter,
    debouncedSearch,
    startAt,
    endAt,
    2000,
  )
  const rows = data?.rows ?? []

  const chips: FilterBarChip[] = useMemo(
    () => [
      { value: 'all', label: <BiTabLabel {...COMMON.all} />, ariaLabel: bilingualAriaLabel(COMMON.all) },
      { value: 'draft', label: <BiTabLabel {...ACHATS.draft} />, ariaLabel: bilingualAriaLabel(ACHATS.draft) },
      { value: 'validated', label: <BiTabLabel {...ACHATS.validated} />, ariaLabel: bilingualAriaLabel(ACHATS.validated) },
      { value: 'cancelled', label: <BiTabLabel {...ACHATS.cancelled} />, ariaLabel: bilingualAriaLabel(ACHATS.cancelled) },
    ],
    [],
  )

  function exportRows(kind: 'csv' | 'xlsx') {
    const body = rows.map((row) => [
      row.number,
      row.status,
      row.document_date,
      row.supplier_name ?? '',
      row.total_cfa,
    ])
    exportFilteredList({
      kind,
      basename: 'receptions',
      sheetName: 'Receptions',
      headers: RECEIPT_EXPORT_HEADERS,
      rows: body,
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-3 sm:px-6 py-3 border-b border-border bg-surface flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-secondary">
            <BiPageDescription {...ACHATS.receiptsDesc} />
          </p>
          <div className="mt-2">
            <FilterBar
              chips={chips}
              activeChip={statusFilter ?? 'all'}
              onChipChange={(v) => setStatusFilter(v === 'all' ? null : v)}
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder={bilingualPlain(ACHATS.searchReceiptsPlaceholder)}
              count={data?.count ?? 0}
            />
          </div>
          <DatePresetFilter
            className="mt-3"
            preset={datePreset}
            onPresetChange={(p) => {
              setDatePreset(p)
              if (p === 'custom' && !customStart && !customEnd) {
                setCustomStart(dateSeed.startDate)
                setCustomEnd(dateSeed.endDate)
              }
            }}
            customStart={customStart || dateSeed.startDate}
            customEnd={customEnd || dateSeed.endDate}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={rows.length === 0} onClick={() => exportRows('csv')}>
            <BiButtonInline {...COMMON.exportCsv} />
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={rows.length === 0} onClick={() => exportRows('xlsx')}>
            <BiButtonInline {...COMMON.exportXlsx} />
          </Button>
          <Button type="button" onClick={() => setEditorOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            <BiButtonStack {...ACHATS.newReceipt} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={cn('grid gap-4 px-4 py-3 border-b border-border', GRID)}>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-20 justify-self-end" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title={<BiEmptyTitle {...ACHATS.failedToLoad} />}
              description={<BiEmptyDescription {...COMMON.checkConnection} />}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title={<BiEmptyTitle {...ACHATS.emptyReceipts} />}
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
              <BiTableHeader {...ACHATS.number} />
              <BiTableHeader {...ACHATS.status} />
              <BiTableHeader {...ACHATS.date} />
              <BiTableHeader {...ACHATS.supplier} />
              <span className="text-right">
                <BiTableHeader {...ACHATS.total} />
              </span>
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
                onClick={() => setSelectedId(row.id)}
              >
                <span className="font-mono text-sm tabular-nums truncate">{row.number}</span>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant={statusVariant(row.status)}>
                    <BilingualText {...statusLabel(row.status)} variant="caption" layout="inline" />
                  </Badge>
                  {isCreditOverdue(
                    row.document_date,
                    row.supplier_payment_term_days,
                    row.payment_mode,
                  ) && (
                    <Badge variant="danger">
                      <BilingualText {...ACHATS.overdue} variant="caption" layout="inline" />
                    </Badge>
                  )}
                </div>
                <span className="text-sm text-text-secondary tabular-nums">
                  {formatReportDate(row.document_date)}
                </span>
                <span className="text-sm text-text-secondary truncate">
                  {row.supplier_name ?? '\u2014'}
                </span>
                <MoneyDisplay amount={row.total_cfa} className="justify-self-end text-sm font-medium" />
                <RowChevron />
              </button>
            ))}
          </>
        )}
      </div>

      <PurchaseReceiptDetailDrawer
        receiptId={selectedId}
        onClose={() => setSelectedId(null)}
        onEditDraft={(id) => {
          setSelectedId(null)
          setEditorOpen(true)
          // editor loads via selected draft id prop
          void id
        }}
      />
      <PurchaseReceiptEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onCreated={(id) => {
          setEditorOpen(false)
          setSelectedId(id)
        }}
      />
    </div>
  )
}
