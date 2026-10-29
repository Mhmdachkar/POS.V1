import { MoneyDisplay } from '@/components/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { ACHATS } from '@/lib/bilingual/achats'
import { BiTableHeader } from '@/lib/bilingual/ui'
import { t } from '@/lib/bilingual/types'
import { ReportMetric } from '../components/ReportMetric'
import { cn } from '@/lib/cn'
import { formatReportPieces } from '@/lib/formatters'

export interface PurchasesByProductRow {
  product_id: string
  product_name: string
  quantity_pieces: number
  purchased_cfa: number
  receipt_count: number
}

export interface PurchasesByProductTotals {
  purchased_cfa: number
  quantity_pieces: number
  receipt_count: number
}

const GRID = 'grid-cols-[minmax(10rem,1.6fr)_6rem_7rem_4.5rem]'

export function ReportPurchasesByProductTab({
  rows,
  totals,
}: {
  rows: PurchasesByProductRow[]
  totals: PurchasesByProductTotals
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ReportMetric label={t(REPORTS.purchased)} amount={Number(totals.purchased_cfa)} />
        <div className="rounded-xl ring-1 ring-border/70 bg-surface px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t(REPORTS.purchasePieces)}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatReportPieces(Number(totals.quantity_pieces))}
          </p>
        </div>
        <div className="rounded-xl ring-1 ring-border/70 bg-surface px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t(REPORTS.receiptCount)}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{totals.receipt_count}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border/70">
        <div
          className={cn(
            'grid gap-3 px-4 py-2 bg-surface-muted text-xs font-semibold text-text-secondary',
            GRID,
          )}
        >
          <BiTableHeader {...ACHATS.product} />
          <span className="text-right">
            <BiTableHeader {...REPORTS.purchasePieces} />
          </span>
          <span className="text-right">
            <BiTableHeader {...REPORTS.purchased} />
          </span>
          <span className="text-right">
            <BiTableHeader {...REPORTS.receiptCount} />
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-secondary">{t(ACHATS.emptyReceipts)}</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.product_id}
              className={cn('grid gap-3 px-4 py-3 border-t border-border items-center text-sm', GRID)}
            >
              <span className="truncate font-medium">{row.product_name}</span>
              <span className="justify-self-end tabular-nums">
                {formatReportPieces(Number(row.quantity_pieces))}
              </span>
              <MoneyDisplay amount={row.purchased_cfa} className="justify-self-end" />
              <span className="justify-self-end tabular-nums">{row.receipt_count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
