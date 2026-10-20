import { useState } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button, Select } from '@/components/ui'
import { resolveReportDateRange, type ReportPreset } from '@/lib/reportDates'
import { useDepotStore } from '@/stores/depotStore'
import { BilingualText } from '@/components/ui/BilingualText'
import { COMMON } from '@/lib/bilingual/common'
import { REPORTS } from '@/lib/bilingual/reports'
import { BiButtonInline } from '@/lib/bilingual/ui'
import { t, bilingualAriaLabel, bilingualPlain } from '@/lib/bilingual/types'

const PRESETS: ReportPreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'custom']

const PRESET_LABELS = {
  today: REPORTS.presetToday,
  yesterday: REPORTS.presetYesterday,
  this_week: REPORTS.presetThisWeek,
  this_month: REPORTS.presetThisMonth,
  custom: REPORTS.presetCustom,
} as const satisfies Record<ReportPreset, typeof REPORTS.presetToday>

export interface ReportSelectOption {
  value: string
  label: string
}

export interface ReportToolbarProps {
  preset: ReportPreset
  onPresetChange: (p: ReportPreset) => void
  customStart: string
  customEnd: string
  onCustomStartChange: (v: string) => void
  onCustomEndChange: (v: string) => void
  showCashierFilter?: boolean
  showCategoryFilter?: boolean
  showProductFilter?: boolean
  showShiftFilter?: boolean
  cashierId?: string
  onCashierIdChange?: (v: string) => void
  categoryId?: string
  onCategoryIdChange?: (v: string) => void
  productId?: string
  onProductIdChange?: (v: string) => void
  shiftId?: string
  onShiftIdChange?: (v: string) => void
  cashierOptions?: ReportSelectOption[]
  categoryOptions?: ReportSelectOption[]
  productOptions?: ReportSelectOption[]
  shiftOptions?: ReportSelectOption[]
  onExportCsv?: () => void
  onExportXlsx?: () => void
  onExportPrint?: () => void
  exportDisabled?: boolean
}

export function ReportToolbar({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  showCashierFilter,
  showCategoryFilter,
  showProductFilter,
  showShiftFilter,
  cashierId = '',
  onCashierIdChange,
  categoryId = '',
  onCategoryIdChange,
  productId = '',
  onProductIdChange,
  shiftId = '',
  onShiftIdChange,
  cashierOptions = [],
  categoryOptions = [],
  productOptions = [],
  shiftOptions = [],
  onExportCsv,
  onExportXlsx,
  onExportPrint,
  exportDisabled,
}: ReportToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const depotId = useDepotStore((s) => s.currentDepotId)
  const depotName = useDepotStore((s) => s.currentDepotName)
  const range = resolveReportDateRange(preset, customStart, customEnd)
  const hasExport = onExportCsv || onExportXlsx || onExportPrint

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPresetChange(p)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
              preset === p
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface border-border text-text-secondary hover:text-text-primary',
            )}
          >
            <BilingualText {...PRESET_LABELS[p]} variant="filter" layout="inline" />
          </button>
        ))}
        {hasExport && (
          <div className="relative w-full sm:w-auto sm:ml-auto">
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 w-full sm:w-auto justify-center"
              disabled={exportDisabled}
              onClick={() => setExportOpen((o) => !o)}
            >
              <Download className="h-4 w-4" />
              <BiButtonInline {...COMMON.export} />
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
            {exportOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label={bilingualAriaLabel(COMMON.closeMenu)}
                  onClick={() => setExportOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-md border border-border bg-surface shadow-md py-1">
                  {onExportXlsx && (
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-surface-alt"
                      onClick={() => {
                        setExportOpen(false)
                        onExportXlsx()
                      }}
                    >
                      <BiButtonInline {...REPORTS.exportXlsx} />
                    </button>
                  )}
                  {onExportPrint && (
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-surface-alt"
                      onClick={() => {
                        setExportOpen(false)
                        onExportPrint()
                      }}
                    >
                      <BiButtonInline {...REPORTS.exportPrintPdf} />
                    </button>
                  )}
                  {onExportCsv && (
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-surface-alt"
                      onClick={() => {
                        setExportOpen(false)
                        onExportCsv()
                      }}
                    >
                      <BiButtonInline {...COMMON.exportCsv} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {preset === 'custom' && (
        <div className="flex flex-wrap gap-3 items-center">
          <label className="text-xs text-text-secondary inline-flex items-center gap-1">
            <BilingualText {...REPORTS.dateFrom} variant="caption" layout="inline" />
            <input
              type="date"
              value={customStart}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className="ml-2 h-8 px-2 rounded-md border border-border bg-surface text-sm"
            />
          </label>
          <label className="text-xs text-text-secondary inline-flex items-center gap-1">
            <BilingualText {...REPORTS.dateTo} variant="caption" layout="inline" />
            <input
              type="date"
              value={customEnd}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className="ml-2 h-8 px-2 rounded-md border border-border bg-surface text-sm"
            />
          </label>
        </div>
      )}

      {(showCashierFilter || showCategoryFilter || showProductFilter || showShiftFilter) && (
        <div className="flex flex-wrap gap-3 items-end">
          {showCashierFilter && onCashierIdChange && (
            <Select
              label={bilingualPlain(REPORTS.filterCashier)}
              value={cashierId}
              onChange={(e) => onCashierIdChange(e.target.value)}
              className="w-40 h-8 text-xs"
            >
              <option value="">{bilingualPlain(REPORTS.allCashiersOption)}</option>
              {cashierOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
          {showCategoryFilter && onCategoryIdChange && (
            <Select
              label={bilingualPlain(REPORTS.filterCategory)}
              value={categoryId}
              onChange={(e) => onCategoryIdChange(e.target.value)}
              className="w-40 h-8 text-xs"
            >
              <option value="">{bilingualPlain(REPORTS.allCategoriesOption)}</option>
              {categoryOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
          {showProductFilter && onProductIdChange && (
            <Select
              label={bilingualPlain(REPORTS.filterProduct)}
              value={productId}
              onChange={(e) => onProductIdChange(e.target.value)}
              className="w-48 h-8 text-xs"
            >
              <option value="">{bilingualPlain(REPORTS.allProductsOption)}</option>
              {productOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
          {showShiftFilter && onShiftIdChange && (
            <Select
              label={bilingualPlain(REPORTS.filterShift)}
              value={shiftId}
              onChange={(e) => onShiftIdChange(e.target.value)}
              className="w-44 h-8 text-xs"
            >
              <option value="">{bilingualPlain(REPORTS.allShiftsOption)}</option>
              {shiftOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        </div>
      )}

      <p className="text-xs text-text-muted">
        {depotId ? (depotName ?? bilingualPlain(REPORTS.selectedDepot)) : bilingualPlain(COMMON.allDepots)} · {range.startDate} → {range.endDate}
        {' · '}
        {bilingualPlain(REPORTS.balancesGlobalNote)}
      </p>
    </div>
  )
}

export function useReportRange(
  preset: ReportPreset,
  customStart: string,
  customEnd: string,
) {
  return resolveReportDateRange(preset, customStart, customEnd)
}
