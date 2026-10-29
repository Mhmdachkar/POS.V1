import { useEffect, useMemo, useState } from 'react'
import { Banknote, FileText, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Badge,
  Button,
  DatePresetFilter,
  EmptyState,
  FilterBar,
  MoneyDisplay,
  Skeleton,
  type ListDatePreset,
} from '@/components/ui'
import { formatReportDateTime } from '@/lib/formatters'
import { listDateBounds, resolveReportDateRange } from '@/lib/reportDates'
import { ACHATS } from '@/lib/bilingual/achats'
import { COMMON } from '@/lib/bilingual/common'
import {
  BiButtonInline,
  BiButtonStack,
  BiEmptyDescription,
  BiEmptyTitle,
  BiPageDescription,
  BiTableHeader,
} from '@/lib/bilingual/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { bilingualPlain, t } from '@/lib/bilingual/types'
import { parseError } from '@/lib/errors'
import { toastErrorFromCode } from '@/lib/bilingual/toast'
import { reprintSupplierPaymentSlip } from '@/lib/supplierPaymentDocument'
import { useSupplierList, useSupplierPaymentList, type SupplierPaymentRow, type SupplierRow } from '@/hooks/useAchats'
import { exportTable, type ExportColumn } from '@/lib/listExport'
import { exportPaymentMethod } from '@/lib/exportLabels'
import { exportCfaInt } from '@/lib/tableExport'
import { useDepotStore } from '@/stores/depotStore'

import { RecordSupplierPaymentModal } from './components/RecordSupplierPaymentModal'

const PAYMENT_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Fournisseur' },
  { header: 'Numéro' },
  { header: 'Date', kind: 'date' },
  { header: 'Montant CFA', kind: 'money', total: true },
  { header: 'Méthode', kind: 'enum' },
  { header: 'Note' },
]
const SEARCH_DEBOUNCE_MS = 300

const GRID =
  'grid-cols-[minmax(8rem,1fr)_minmax(7rem,10rem)_minmax(7rem,9rem)_6.5rem_5.5rem_minmax(6rem,1fr)_2.75rem]'

function methodLabel(m: string) {
  if (m === 'mobile') return ACHATS.mobile
  if (m === 'bank') return ACHATS.bank
  return ACHATS.cash
}

export function SupplierPaymentsPage() {
  const depotName = useDepotStore((s) => s.currentDepotName)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [datePreset, setDatePreset] = useState<ListDatePreset | null>(null)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [supplierId, setSupplierId] = useState<string>('')

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

  const { data, isLoading, isError } = useSupplierPaymentList(
    null,
    debouncedSearch,
    startAt,
    endAt,
    2000,
  )
  const suppliersQ = useSupplierList(false)
  const rows = data?.rows ?? []
  const suppliers = suppliersQ.data?.rows ?? []

  const selectedSupplier: SupplierRow | null = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  )

  function exportRows(kind: 'csv' | 'xlsx') {
    const filterLines: string[] = []
    if (dateRange) filterLines.push(`Période : ${dateRange.startDate} → ${dateRange.endDate}`)
    if (selectedSupplier) filterLines.push(`Fournisseur : ${selectedSupplier.name}`)
    if (debouncedSearch.trim()) filterLines.push(`Recherche : ${debouncedSearch.trim()}`)
    void exportTable({
      kind,
      columns: PAYMENT_EXPORT_COLUMNS,
      rows: rows.map((row) => ({
        cells: [
          row.supplier_name ?? row.supplier_id,
          row.receipt_number ?? '',
          row.recorded_at,
          exportCfaInt(row.amount_cfa),
          exportPaymentMethod(row.method),
          row.note ?? '',
        ],
      })),
      meta: {
        title: 'Règlements fournisseurs',
        sheetName: 'Règlements',
        basename: 'reglements-fournisseurs',
        depotName,
        filterLines,
      },
    })
  }

  async function handlePrint(row: SupplierPaymentRow) {
    try {
      await reprintSupplierPaymentSlip({
        receiptNumber: row.receipt_number || '\u2014',
        amountCfa: row.amount_cfa,
        methodLabel: t(methodLabel(row.method)),
        recordedAt: row.recorded_at,
        note: row.note,
        supplier: {
          name: row.supplier_name ?? row.supplier_id,
          phone: null,
          address: null,
        },
      })
    } catch (err) {
      const parsed = parseError(err)
      toastErrorFromCode(parsed.code, parsed.details)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-3 sm:px-6 py-3 border-b border-border bg-surface flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-secondary">
            <BiPageDescription {...ACHATS.paymentsDesc} />
          </p>
          <div className="mt-2">
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder={bilingualPlain(ACHATS.searchPaymentsPlaceholder)}
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
          <select
            className="h-9 px-2 rounded-md border border-border bg-surface text-sm max-w-[14rem]"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={!selectedSupplier || selectedSupplier.balance_owed_cfa <= 0}
            onClick={() => setPayOpen(true)}
          >
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
              <span />
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-self-end px-2"
                  onClick={() => void handlePrint(row)}
                  title={t(ACHATS.printPaymentSlip)}
                >
                  <FileText className="h-4 w-4" />
                  <span className="sr-only">{t(ACHATS.printPaymentSlip)}</span>
                </Button>
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
