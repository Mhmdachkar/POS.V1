import { MoneyDisplay } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { REPORTS } from '@/lib/bilingual/reports'
import { formatReportPieces } from '@/lib/formatters'
import { t } from '@/lib/bilingual/types'


export function BreakdownList({
  rows,
}: {
  rows: Array<{ key: string; label: string; primary: number; secondary?: string }>
}) {
  if (rows.length === 0) {
    return <BilingualText {...REPORTS.noDataPeriod} variant="body" as="p" className="text-text-muted" />
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface-muted">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm bg-surface">
          <span className="truncate text-text-primary">{row.label}</span>
          <span className="shrink-0 text-right tabular-nums">
            <MoneyDisplay amount={row.primary} size="small" />
            {row.secondary && (
              <span className="block text-xs text-text-muted">{row.secondary}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function BreakdownListPieces({
  rows,
}: {
  rows: Array<{ key: string; label: string; pieces: number; amount: number }>
}) {
  if (rows.length === 0) {
    return <BilingualText {...REPORTS.noDataPeriod} variant="body" as="p" className="text-text-muted" />
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface-muted">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm bg-surface">
          <span className="truncate">{row.label}</span>
          <span className="shrink-0 text-right tabular-nums text-text-secondary">
            {formatReportPieces(row.pieces)} · <MoneyDisplay amount={row.amount} size="small" className="inline" />
          </span>
        </li>
      ))}
    </ul>
  )
}
