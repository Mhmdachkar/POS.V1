import { Download } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui'
import {
  REPORT_PRESET_LABELS,
  resolveReportDateRange,
  type ReportPreset,
} from '@/lib/reportDates'
import { useDepotStore } from '@/stores/depotStore'
import { useDepotOptions } from '@/hooks/useInventory'

const PRESETS: ReportPreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'custom']

export interface ReportToolbarProps {
  preset: ReportPreset
  onPresetChange: (p: ReportPreset) => void
  customStart: string
  customEnd: string
  onCustomStartChange: (v: string) => void
  onCustomEndChange: (v: string) => void
  onExport?: () => void
  exportDisabled?: boolean
}

export function ReportToolbar({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  onExport,
  exportDisabled,
}: ReportToolbarProps) {
  const depotId = useDepotStore((s) => s.currentDepotId)
  const depotName = useDepotStore((s) => s.currentDepotName)
  const { data: depots } = useDepotOptions()
  const range = resolveReportDateRange(preset, customStart, customEnd)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPresetChange(p)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
              preset === p
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface border-border text-text-secondary hover:text-text-primary',
            )}
          >
            {REPORT_PRESET_LABELS[p]}
          </button>
        ))}
        {onExport && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 ml-auto"
            onClick={onExport}
            disabled={exportDisabled}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      {preset === 'custom' && (
        <div className="flex flex-wrap gap-3 items-center">
          <label className="text-sm text-text-secondary">
            From
            <input
              type="date"
              value={customStart}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className="ml-2 h-9 px-2 rounded-md border border-border bg-surface text-sm"
            />
          </label>
          <label className="text-sm text-text-secondary">
            To
            <input
              type="date"
              value={customEnd}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className="ml-2 h-9 px-2 rounded-md border border-border bg-surface text-sm"
            />
          </label>
        </div>
      )}

      <p className="text-xs text-text-muted">
        {depotId ? depotName ?? 'Selected depot' : 'All depots'} · {range.startDate} → {range.endDate}
        {' · '}
        West Africa calendar (Africa/Abidjan)
      </p>
      {depots && depots.length > 0 && (
        <p className="text-xs text-text-muted">
          Change depot from the top bar. Customer outstanding balances are a global pooled figure — never a depot balance.
        </p>
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
