import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Plus, Truck } from 'lucide-react'
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
import { useSupplierList, type SupplierRow } from '@/hooks/useAchats'
import { exportTable, type ExportColumn } from '@/lib/listExport'
import { exportCfaInt } from '@/lib/tableExport'
import {
  nextSupplierSort,
  SUPPLIER_EXPORT_HEADERS,
  SUPPLIERS_SEARCH_DEBOUNCE_MS,
  supplierExportRows,
  type SupplierSortBy,
  type SupplierSortDir,
} from '@/lib/supplierList'
import { SupplierFormModal } from './components/SupplierFormModal'
import { RecordSupplierPaymentModal } from './components/RecordSupplierPaymentModal'

const GRID = 'grid-cols-[minmax(10rem,1.4fr)_8rem_7.5rem_6.5rem_1.25rem]'

export function SuppliersPage() {
  const navigate = useNavigate()
  const [activeOnly, setActiveOnly] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<SupplierSortBy>('name')
  const [sortDir, setSortDir] = useState<SupplierSortDir>('asc')
  const [formOpen, setFormOpen] = useState(false)
  const [editRow, setEditRow] = useState<SupplierRow | null>(null)
  const [payRow, setPayRow] = useState<SupplierRow | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SUPPLIERS_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError } = useSupplierList(
    activeOnly,
    debouncedSearch,
    sortBy,
    sortDir,
  )
  const rows = data?.rows ?? []

  function handleSort(field: SupplierSortBy) {
    const next = nextSupplierSort(sortBy, sortDir, field)
    setSortBy(next.sortBy)
    setSortDir(next.sortDir)
  }

  function exportRows(kind: 'csv' | 'xlsx') {
    const filterLines: string[] = []
    filterLines.push(activeOnly ? 'Actifs seulement' : 'Tous les fournisseurs')
    if (debouncedSearch.trim()) filterLines.push(`Recherche : ${debouncedSearch.trim()}`)
    const columns: ExportColumn[] = SUPPLIER_EXPORT_HEADERS.map((header, i) => ({
      header,
      kind: i === 3 ? 'money' : i === 4 ? 'enum' : 'text',
      total: i === 3,
    }))
    void exportTable({
      kind,
      columns,
      rows: supplierExportRows(rows).map((cells) => ({
        cells: cells.map((v, i) => (i === 3 ? exportCfaInt(Number(v) || 0) : v)),
      })),
      meta: {
        title: 'Fournisseurs',
        sheetName: 'Fournisseurs',
        basename: 'fournisseurs',
        filterLines,
      },
    })
  }

  const chips: FilterBarChip[] = useMemo(
    () => [
      { value: 'active', label: <BiTabLabel {...ACHATS.active} />, ariaLabel: bilingualAriaLabel(ACHATS.active) },
      { value: 'all', label: <BiTabLabel {...COMMON.all} />, ariaLabel: bilingualAriaLabel(COMMON.all) },
    ],
    [],
  )

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
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder={bilingualPlain(ACHATS.searchPlaceholder)}
              count={data?.count ?? 0}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => exportRows('csv')} disabled={rows.length === 0}>
            <BiButtonInline {...COMMON.exportCsv} />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => exportRows('xlsx')} disabled={rows.length === 0}>
            <BiButtonInline {...COMMON.exportXlsx} />
          </Button>
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
              title={
                <BiEmptyTitle
                  {...(search.trim() ? ACHATS.emptySearch : ACHATS.emptySuppliers)}
                />
              }
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
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left hover:text-text-primary"
                onClick={() => handleSort('name')}
              >
                <BiTableHeader {...ACHATS.name} />
                {sortBy === 'name' &&
                  (sortDir === 'asc' ? (
                    <ArrowUp className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5" />
                  ))}
              </button>
              <BiTableHeader {...ACHATS.phone} />
              <button
                type="button"
                className="inline-flex items-center gap-1 justify-self-end hover:text-text-primary"
                onClick={() => handleSort('balance_owed_cfa')}
              >
                <BiTableHeader {...ACHATS.balance} />
                {sortBy === 'balance_owed_cfa' &&
                  (sortDir === 'asc' ? (
                    <ArrowUp className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5" />
                  ))}
              </button>
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
                onClick={() => navigate(`/achats/fournisseurs/${row.id}`)}
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
