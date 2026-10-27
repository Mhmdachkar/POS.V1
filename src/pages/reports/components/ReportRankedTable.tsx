import { useMemo, useState } from 'react'
import { PaginationBar } from '@/components/ui'
import { formatMoney, formatPercent } from '@/lib/formatters'
import { InfoTip } from './InfoTip'
import { COMMON } from '@/lib/bilingual/common'
import { REPORTS } from '@/lib/bilingual/reports'
import { t } from '@/lib/bilingual/types'
import { cn } from '@/lib/cn'

const PAGE = 25

export interface RankedRow {
  id: string
  name: string
  gross: number
  returns: number
  net: number
  margin?: number | null
}

export function assertKpiEqualsTable(label: string, kpi: number, table: number) {
  if (import.meta.env.DEV && Math.abs(Number(kpi) - Number(table)) > 0.51) {
    console.error(`[reports] ${label}: KPI ${kpi} != table ${table}`)
  }
}

function MoneyCell({ value }: { value: number | null }) {
  if (value == null) {
    return <span title={t(REPORTS.missingValue)}>—</span>
  }
  return (
    <span className={cn('tabular-nums', value < 0 && 'text-danger-foreground')}>
      {formatMoney(value)}
    </span>
  )
}

export function ReportRankedTable({
  rows,
  netTotal,
  marginTip,
  nameHeader,
}: {
  rows: RankedRow[]
  netTotal: number
  marginTip?: string
  nameHeader?: string
}) {
  const [page, setPage] = useState(0)
  const totals = useMemo(() => ({
    gross: rows.reduce((s, r) => s + r.gross, 0),
    returns: rows.reduce((s, r) => s + r.returns, 0),
    net: rows.reduce((s, r) => s + r.net, 0),
    margin: rows.reduce((s, r) => s + Number(r.margin ?? 0), 0),
  }), [rows])
  assertKpiEqualsTable('net', netTotal, totals.net)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE)
  const shareBase = Math.abs(netTotal) > 0 ? Math.abs(netTotal) : 1

  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-muted text-xs text-text-secondary">
            <tr>
              <th className="px-3 py-3 text-left">{nameHeader ?? t(REPORTS.products)}</th>
              <th className="min-w-[7.5rem] px-3 py-3 text-right">{t(REPORTS.gross)}</th>
              <th className="min-w-[7.5rem] px-3 py-3 text-right">{t(REPORTS.returnsMetric)}</th>
              <th className="min-w-[7.5rem] px-3 py-3 text-right">{t(REPORTS.net)}</th>
              <th className="min-w-[7.5rem] px-3 py-3 text-right">
                <span className="inline-flex items-center gap-1">
                  {t(REPORTS.grossProfit)}
                  {marginTip ? <InfoTip text={marginTip} /> : null}
                </span>
              </th>
              <th className="min-w-[8rem] px-3 py-3 text-left">{t(REPORTS.shareOfNet)}</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => {
              const sharePct = (Math.abs(row.net) / shareBase) * 100
              return (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 text-right"><MoneyCell value={row.gross} /></td>
                <td className="px-3 py-2 text-right"><MoneyCell value={row.returns === 0 ? 0 : -Math.abs(row.returns)} /></td>
                <td className="px-3 py-2 text-right font-medium"><MoneyCell value={row.net} /></td>
                <td className="px-3 py-2 text-right"><MoneyCell value={row.margin ?? null} /></td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 min-w-0 flex-1 rounded-full bg-surface-muted">
                      <div
                        className={cn('h-2 rounded-full bg-primary')}
                        style={{ width: `${Math.min(100, sharePct)}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-text-secondary">
                      {formatPercent(sharePct)}
                    </span>
                  </div>
                </td>
              </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-muted font-semibold">
              <td className="px-3 py-3">{t(COMMON.total)}</td>
              <td className="px-3 py-3 text-right"><MoneyCell value={totals.gross} /></td>
              <td className="px-3 py-3 text-right"><MoneyCell value={totals.returns === 0 ? 0 : -Math.abs(totals.returns)} /></td>
              <td className="px-3 py-3 text-right"><MoneyCell value={totals.net} /></td>
              <td className="px-3 py-3 text-right"><MoneyCell value={totals.margin} /></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <PaginationBar page={page} totalPages={pages} onPageChange={setPage} />
    </div>
  )
}
