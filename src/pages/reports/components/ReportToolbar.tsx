import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button, Select } from '@/components/ui'
import { resolveReportDateRange, type ReportPreset } from '@/lib/reportDates'
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
  const hasExport = onExportCsv || onExportXlsx || onExportPrint
  const presetRailRef = useRef<HTMLDivElement>(null)
  const presetRefs = useRef<Map<ReportPreset, HTMLButtonElement>>(new Map())
  const [presetIndicator, setPresetIndicator] = useState({ left: 0, width: 0, ready: false })

  const measurePreset = useCallback(() => {
    const rail = presetRailRef.current
    const el = presetRefs.current.get(preset)
    if (!rail || !el) return
    const railRect = rail.getBoundingClientRect()
    const tabRect = el.getBoundingClientRect()
    setPresetIndicator({
      left: tabRect.left - railRect.left + rail.scrollLeft,
      width: tabRect.width,
      ready: true,
    })
  }, [preset])

  useLayoutEffect(() => {
    measurePreset()
    const rail = presetRailRef.current
    if (!rail) return
    const ro = new ResizeObserver(measurePreset)
    ro.observe(rail)
    return () => ro.disconnect()
  }, [measurePreset])

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          ref={presetRailRef}
          className="relative flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto scrollbar-thin rounded-xl bg-surface-muted p-1 ring-1 ring-border/50"
        >
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute top-1 bottom-1 rounded-lg bg-surface shadow-sm ring-1 ring-primary/25',
              'transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
              presetIndicator.ready ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              width: presetIndicator.width,
              transform: `translateX(${presetIndicator.left}px)`,
            }}
          />
          {PRESETS.map((p) => {
            const active = preset === p
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                ref={(el) => {
                  if (el) presetRefs.current.set(p, el)
                  else presetRefs.current.delete(p)
                }}
                onClick={() => onPresetChange(p)}
                className={cn(
                  'relative z-[1] min-h-[44px] flex-1 rounded-lg px-3 text-sm font-medium sm:flex-none',
                  'transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                  active
                    ? 'text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                <BilingualText {...PRESET_LABELS[p]} variant="filter" layout="inline" />
              </button>
            )
          })}
        </div>
        {hasExport && (
          <div className="relative w-full sm:w-auto sm:ml-auto">
            <Button
              variant="secondary"
              size="md"
              className="w-full justify-center sm:w-auto"
              disabled={exportDisabled}
              title={exportDisabled ? t(REPORTS.exportUnavailable) : undefined}
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
              lang="fr-FR"
              value={customStart}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className="ml-2 h-11 min-h-[44px] rounded-lg border border-border bg-surface px-2 text-sm"
            />
          </label>
          <label className="text-xs text-text-secondary inline-flex items-center gap-1">
            <BilingualText {...REPORTS.dateTo} variant="caption" layout="inline" />
            <input
              type="date"
              lang="fr-FR"
              value={customEnd}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className="ml-2 h-11 min-h-[44px] rounded-lg border border-border bg-surface px-2 text-sm"
            />
          </label>
        </div>
      )}

      {(showCashierFilter || showCategoryFilter || showProductFilter || showShiftFilter) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {showCashierFilter && onCashierIdChange && (
            <Select
              label={bilingualPlain(REPORTS.filterCashier)}
              value={cashierId}
              onChange={(e) => onCashierIdChange(e.target.value)}
              className="h-11 w-full text-sm"
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
              className="h-11 w-full text-sm"
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
              className="h-11 w-full text-sm"
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
              className="h-11 w-full text-sm"
            >
              <option value="">{bilingualPlain(REPORTS.allShiftsOption)}</option>
              {shiftOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        </div>
      )}

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
