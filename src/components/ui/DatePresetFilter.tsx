/**
 * Compact date preset chips for list pages (Sales, Payments).
 * Presets: today / yesterday / custom (Abidjan calendar via resolveReportDateRange).
 */

import { cn } from '@/lib/cn'
import { COMMON } from '@/lib/bilingual/common'
import { REPORTS } from '@/lib/bilingual/reports'
import { BilingualText } from '@/components/ui/BilingualText'
import { ReportDateInput } from '@/pages/reports/components/ReportDateInput'
import { t } from '@/lib/bilingual/types'
import type { ReportPreset } from '@/lib/reportDates'

export type ListDatePreset = Extract<ReportPreset, 'today' | 'yesterday' | 'custom'>

const PRESETS: ListDatePreset[] = ['today', 'yesterday', 'custom']

const PRESET_LABELS = {
  today: COMMON.today,
  yesterday: COMMON.yesterday,
  custom: COMMON.custom,
} as const

export interface DatePresetFilterProps {
  preset: ListDatePreset
  onPresetChange: (preset: ListDatePreset) => void
  customStart: string
  customEnd: string
  onCustomStartChange: (ymd: string) => void
  onCustomEndChange: (ymd: string) => void
  className?: string
}

export function DatePresetFilter({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  className,
}: DatePresetFilterProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={preset === p}
          onClick={() => onPresetChange(p)}
          className={cn(
            'px-3 min-h-[44px] h-11 rounded-full text-sm font-medium flex-shrink-0 transition-colors',
            preset === p
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface-muted text-text-secondary border border-border hover:bg-surface',
          )}
        >
          <BilingualText {...PRESET_LABELS[p]} variant="filter" layout="inline" />
        </button>
      ))}
      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <ReportDateInput
            label={t(REPORTS.dateFrom)}
            value={customStart}
            onChange={onCustomStartChange}
          />
          <ReportDateInput
            label={t(REPORTS.dateTo)}
            value={customEnd}
            onChange={onCustomEndChange}
          />
        </div>
      )}
    </div>
  )
}