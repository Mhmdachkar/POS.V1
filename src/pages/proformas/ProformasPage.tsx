/**
 * Proformas list — depot-scoped quotes (admin + cashier).
 */

import { useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { NavPictogram } from '@/components/layout/NavPictogram'
import { cn } from '@/lib/cn'
import {
  Badge,
  Button,
  DatePresetFilter,
  EmptyState,
  FilterBar,
  MoneyDisplay,
  PageHeader,
  RowChevron,
  Skeleton,
  CLICKABLE_ROW,
  type FilterBarChip,
  type ListDatePreset,
} from '@/components/ui'
import { formatReportDate } from '@/lib/formatters'
import { listDateBounds, resolveReportDateRange } from '@/lib/reportDates'
import { COMMON } from '@/lib/bilingual/common'
import { PROFORMAS } from '@/lib/bilingual/proformas'
import {
  BiButtonInline,
  BiEmptyDescription,
  BiEmptyTitle,
  BiPageDescription,
  BiPageTitle,
  BiTabLabel,
  BiTableHeader,
} from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { bilingualAriaLabel, bilingualPlain, t } from '@/lib/bilingual/types'
import { useProformaList, type ProformaRow } from '@/hooks/useProformas'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { exportTable, type ExportColumn } from '@/lib/listExport'
import { exportProformaStatus } from '@/lib/exportLabels'
import { exportCfaInt, isVoidedExportStatus } from '@/lib/tableExport'
import { ProformaDetailDrawer } from './components/ProformaDetailDrawer'

const PROFORMA_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Numéro' },
  { header: 'Statut', kind: 'enum' },
  { header: 'Date', kind: 'date' },
  { header: 'Client' },
  { header: 'Total CFA', kind: 'money', total: true },
]
const SEARCH_DEBOUNCE_MS = 300

const GRID =
  'grid-cols-[minmax(9rem,11rem)_minmax(5.5rem,6.5rem)_minmax(5rem,7rem)_minmax(6rem,1fr)_minmax(6rem,7.5rem)_1.25rem]'

function statusLabel(status: ProformaRow['status']) {
  switch (status) {
    case 'draft':
      return PROFORMAS.draft
    case 'sent':
      return PROFORMAS.sent
    case 'converted':
      return PROFORMAS.converted
    case 'cancelled':
      return PROFORMAS.cancelled
  }
}

function statusVariant(status: ProformaRow['status']): 'neutral' | 'info' | 'success' | 'danger' {
  switch (status) {
    case 'draft':
      return 'neutral'
    case 'sent':
      return 'info'
    case 'converted':
      return 'success'
    case 'cancelled':
      return 'danger'
  }
}

function TableSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={cn('grid gap-4 px-4 py-3 bg-surface border-b border-border items-center', GRID)}
        >
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-5 w-full max-w-[5rem] rounded-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full max-w-[5rem] justify-self-end" />
        </div>
      ))}
    </div>
  )
}

export function ProformasPage() {
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [datePreset, setDatePreset] = useState<ListDatePreset | null>(null)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const staff = useAuthStore((s) => s.staff)
  const depotId = useDepotStore((s) => s.currentDepotId)
  const depotName = useDepotStore((s) => s.currentDepotName)
  const effectiveDepotId = staff?.role === 'cashier' ? staff.depot_id : depotId

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

  const { data, isLoading, isError } = useProformaList(
    effectiveDepotId,
    statusFilter,
    debouncedSearch,
    startAt,
    endAt,
    2000,
  )

  const rows = data?.rows ?? []
  const totalCount = data?.count ?? 0

  function exportRows(kind: 'csv' | 'xlsx') {
    const filterLines: string[] = []
    if (dateRange) filterLines.push(`Période : ${dateRange.startDate} → ${dateRange.endDate}`)
    if (statusFilter) filterLines.push(`Statut : ${exportProformaStatus(statusFilter)}`)
    if (debouncedSearch.trim()) filterLines.push(`Recherche : ${debouncedSearch.trim()}`)
    void exportTable({
      kind,
      columns: PROFORMA_EXPORT_COLUMNS,
      rows: rows.map((row) => ({
        cells: [
          row.number,
          exportProformaStatus(row.status),
          row.document_date,
          row.customer_name ?? '',
          exportCfaInt(row.total_cfa),
        ],
        excludeFromTotals: isVoidedExportStatus(row.status),
      })),
      meta: {
        title: 'Proformas',
        sheetName: 'Proformas',
        basename: 'proformas',
        depotName,
        filterLines,
      },
    })
  }

  const chips: FilterBarChip[] = useMemo(
    () => [
      {
        value: 'all',
        label: <BiTabLabel {...COMMON.all} />,
        ariaLabel: bilingualAriaLabel(COMMON.all),
      },
      {
        value: 'draft',
        label: <BiTabLabel {...PROFORMAS.draft} />,
        ariaLabel: bilingualAriaLabel(PROFORMAS.draft),
      },
      {
        value: 'sent',
        label: <BiTabLabel {...PROFORMAS.sent} />,
        ariaLabel: bilingualAriaLabel(PROFORMAS.sent),
      },
      {
        value: 'converted',
        label: <BiTabLabel {...PROFORMAS.converted} />,
        ariaLabel: bilingualAriaLabel(PROFORMAS.converted),
      },
      {
        value: 'cancelled',
        label: <BiTabLabel {...PROFORMAS.cancelled} />,
        ariaLabel: bilingualAriaLabel(PROFORMAS.cancelled),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...PROFORMAS.title} />}
          description={<BiPageDescription {...PROFORMAS.pageDesc} />}
          icon={<NavPictogram path="/proformas" size="header" />}
          className="border-b-0"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={rows.length === 0} onClick={() => exportRows('csv')}>
                <BiButtonInline {...COMMON.exportCsv} />
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={rows.length === 0} onClick={() => exportRows('xlsx')}>
                <BiButtonInline {...COMMON.exportXlsx} />
              </Button>
            </div>
          }
        />
        <div className="px-3 sm:px-6 pb-3 sm:pb-4">
          <FilterBar
            chips={chips}
            activeChip={statusFilter ?? 'all'}
            onChipChange={(value) => {
              setStatusFilter(value === 'all' ? null : value)
            }}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={bilingualPlain(PROFORMAS.searchPlaceholder)}
            count={totalCount}
          />
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
      </div>

      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title={<BiEmptyTitle {...PROFORMAS.failedToLoad} />}
              description={<BiEmptyDescription {...COMMON.checkConnection} />}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title={<BiEmptyTitle {...PROFORMAS.empty} />}
              description={<BiEmptyDescription {...PROFORMAS.noStockMovement} />}
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
              <BiTableHeader {...PROFORMAS.number} />
              <BiTableHeader {...PROFORMAS.status} />
              <BiTableHeader {...PROFORMAS.date} />
              <BiTableHeader {...PROFORMAS.customer} />
              <span className="text-right">
                <BiTableHeader {...PROFORMAS.total} />
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
                <Badge variant={statusVariant(row.status)}>
                  <BilingualText {...statusLabel(row.status)} variant="caption" layout="inline" />
                </Badge>
                <span className="text-sm text-text-secondary tabular-nums">
                  {formatReportDate(row.document_date)}
                </span>
                <span className="text-sm text-text-secondary truncate">
                  {row.customer_id
                    ? (row.customer_name?.trim() || '\u2014')
                    : t(PROFORMAS.walkIn)}
                </span>
                <MoneyDisplay amount={row.total_cfa} className="justify-self-end text-sm font-medium" />
                <RowChevron />
              </button>
            ))}
          </>
        )}
      </div>

      <ProformaDetailDrawer
        proformaId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}
