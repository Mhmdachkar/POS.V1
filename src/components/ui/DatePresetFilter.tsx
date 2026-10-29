/**
 * Date range chips for list pages (Sales, Payments).
 * Distinct from FilterBar status pills — outline + calendar, none selected by default.
 * Presets: today / yesterday / this week / this month / custom (Abidjan via resolveReportDateRange).
 */

import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/cn'
import { COMMON } from '@/lib/bilingual/common'
import { REPORTS } from '@/lib/bilingual/reports'
import { BilingualText } from '@/components/ui/BilingualText'
import { ReportDateInput } from '@/pages/reports/components/ReportDateInput'
import { bilingualAriaLabel, t } from '@/lib/bilingual/types'
import type { ReportPreset } from '@/lib/reportDates'

export type ListDatePreset = Extract<
  ReportPreset,
  'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'
>

const PRESETS: ListDatePreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'custom']

const PRESET_LABELS = {
  today: COMMON.today,
  yesterday: COMMON.yesterday,
  this_week: COMMON.thisWeek,
  this_month: COMMON.thisMonth,
  custom: COMMON.custom,
} as const

export interface DatePresetFilterProps {
  /** null = no date filter applied (chips visible, none pressed). */
  preset: ListDatePreset | null
  onPresetChange: (preset: ListDatePreset | null) => void
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
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-surface-muted/40 px-2.5 py-2',
        className,
      )}
      role="group"
      aria-label={bilingualAriaLabel(COMMON.date)}
    >
      <span className="inline-flex items-center gap-1.5 text-text-muted mr-0.5 flex-shrink-0">
        <CalendarDays className="size-4" aria-hidden />
        <BilingualText {...COMMON.date} variant="caption" layout="inline" className="uppercase tracking-wide" />
      </span>
      {PRESETS.map((p) => {
        const selected = preset === p
        return (
          <button
            key={p}
            type="button"
            aria-pressed={selected}
            onClick={() => onPresetChange(selected ? null : p)}
            className={cn(
              // Squared outline — not the rounded-full primary pills used by FilterBar status chips
              'px-2.5 min-h-[40px] h-10 rounded-md text-sm font-medium flex-shrink-0 transition-colors border',
              selected
                ? 'border-primary bg-primary-subtle text-primary shadow-none'
                : 'border-border border-dashed bg-surface text-text-secondary hover:border-primary/40 hover:text-text-primary',
            )}
          >
            <BilingualText {...PRESET_LABELS[p]} variant="filter" layout="inline" />
          </button>
        )
      })}
      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-1">
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
