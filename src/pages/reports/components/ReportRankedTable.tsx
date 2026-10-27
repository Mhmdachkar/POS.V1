import { useMemo, useState } from 'react'
import { PaginationBar } from '@/components/ui'
import { formatMoney } from '@/lib/formatters'
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

export function ReportRankedTable({
  rows,
  netTotal,
}: {
  rows: RankedRow[]
  netTotal: number
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
  const maxNet = Math.max(...rows.map((r) => Math.abs(r.net)), 1)

  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-muted text-xs text-text-secondary">
            <tr>
              <th className="px-3 py-3 text-left">{t(REPORTS.products)}</th>
              <th className="px-3 py-3 text-right">{t(REPORTS.gross)}</th>
              <th className="px-3 py-3 text-right">{t(REPORTS.returnsMetric)}</th>
              <th className="px-3 py-3 text-right">{t(REPORTS.net)}</th>
              <th className="px-3 py-3 text-right">{t(REPORTS.grossProfit)}</th>
              <th className="min-w-[8rem] px-3 py-3 text-left">{t(REPORTS.shareOfNet)}</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.gross)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.returns)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(row.net)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.margin == null ? '—' : formatMoney(row.margin)}</td>
                <td className="px-3 py-2">
                  <div className="h-2 rounded-full bg-surface-muted">
                    <div
                      className={cn('h-2 rounded-full bg-primary')}
                      style={{ width: `${Math.min(100, (Math.abs(row.net) / maxNet) * 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-muted font-semibold">
              <td className="px-3 py-3">{t(COMMON.total)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatMoney(totals.gross)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatMoney(totals.returns)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatMoney(totals.net)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatMoney(totals.margin)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <PaginationBar page={page} totalPages={pages} onPageChange={setPage} />
    </div>
  )
}
