import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PaginationBar } from '@/components/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { COMMON } from '@/lib/bilingual/common'
import { formatReportPieces } from '@/lib/formatters'
import { rpc } from '@/lib/rpc'
import { t } from '@/lib/bilingual/types'
import { ReportSearchField, useReportSearchPager } from '../components/ReportSearchPager'

type MovementRow = {
  product_id: string
  product_name: string
  sales_pieces: number
  return_pieces: number
  restock_pieces: number
  adjustment_pieces: number
  transfer_in_pieces: number
  transfer_out_pieces: number
  void_pieces: number
}

function splitSigned(value: number): { inn: number; out: number } {
  if (value > 0) return { inn: value, out: 0 }
  if (value < 0) return { inn: 0, out: Math.abs(value) }
  return { inn: 0, out: 0 }
}

function toRow(m: MovementRow) {
  const parts = [
    Number(m.sales_pieces),
    Number(m.return_pieces),
    Number(m.restock_pieces),
    Number(m.adjustment_pieces),
    Number(m.transfer_in_pieces),
    Number(m.transfer_out_pieces),
    Number(m.void_pieces),
  ].map(splitSigned)
  const inn = parts.reduce((s, p) => s + p.inn, 0)
  const out = parts.reduce((s, p) => s + p.out, 0)
  return {
    id: m.product_id,
    name: m.product_name,
    inn,
    out,
    net: inn - out,
  }
}

export function ReportMovementsTab({
  depotId,
  startDate,
  endDate,
  categoryId,
  productId,
}: {
  depotId: string | null
  startDate: string
  endDate: string
  categoryId?: string
  productId?: string
}) {
  const q = useQuery({
    queryKey: ['report-module', 'admin_report_stock_movements', depotId, startDate, endDate, categoryId ?? null, productId ?? null],
    queryFn: async () => {
      const result = await rpc.adminReportStockMovements({
        p_depot_id: depotId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_category_id: categoryId || null,
        p_product_id: productId || null,
      })
      if (result.error) throw result.error
      return (Array.isArray(result.data) ? result.data : []) as MovementRow[]
    },
  })

  const rows = useMemo(
    () => (q.data ?? []).map(toRow).filter((r) => r.inn !== 0 || r.out !== 0 || r.net !== 0),
    [q.data],
  )
  const getText = useCallback((r: { name: string }) => r.name, [])
  const pager = useReportSearchPager(rows, getText)
  const totals = pager.filtered.reduce(
    (s, r) => ({ inn: s.inn + r.inn, out: s.out + r.out, net: s.net + r.net }),
    { inn: 0, out: 0, net: 0 },
  )

  if (q.isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
  }
  if (q.isError) {
    return <p className="text-sm text-text-muted">{t(REPORTS.failedReport)}</p>
  }
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">{t(REPORTS.noDataPeriod)}</p>
  }

  return (
    <div className="space-y-3">
      <ReportSearchField value={pager.query} onChange={pager.setQuery} />
      <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs text-text-secondary">
            <tr>
              <th className="px-3 py-2 text-left">{t(REPORTS.productCol)}</th>
              <th className="px-3 py-2 text-right">{t(REPORTS.entries)}</th>
              <th className="px-3 py-2 text-right">{t(REPORTS.exits)}</th>
              <th className="px-3 py-2 text-right">{t(REPORTS.colNet)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pager.slice.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportPieces(r.inn)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportPieces(r.out)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatReportPieces(r.net)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-muted font-semibold">
              <td className="px-3 py-2">{t(COMMON.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatReportPieces(totals.inn)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatReportPieces(totals.out)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatReportPieces(totals.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <PaginationBar page={pager.page} totalPages={pager.pages} onPageChange={pager.setPage} />
    </div>
  )
}
