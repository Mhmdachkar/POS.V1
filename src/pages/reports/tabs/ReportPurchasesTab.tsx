import { MoneyDisplay } from '@/components/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { ACHATS } from '@/lib/bilingual/achats'
import { BiTableHeader } from '@/lib/bilingual/ui'
import { t } from '@/lib/bilingual/types'
import { ReportMetric } from '../components/ReportMetric'
import { cn } from '@/lib/cn'

export interface PurchasesReportRow {
  supplier_id: string
  supplier_name: string
  purchased_cfa: number
  credit_cfa: number
  paid_at_validate_cfa: number
  receipt_count: number
  balance_owed_cfa: number
}

export interface PurchasesReportTotals {
  purchased_cfa: number
  credit_cfa: number
  paid_at_validate_cfa: number
  receipt_count: number
}

const GRID =
  'grid-cols-[minmax(8rem,1.4fr)_6.5rem_6.5rem_6.5rem_4.5rem_6.5rem]'

export function ReportPurchasesTab({
  rows,
  totals,
}: {
  rows: PurchasesReportRow[]
  totals: PurchasesReportTotals
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ReportMetric label={t(REPORTS.purchased)} amount={Number(totals.purchased_cfa)} />
        <ReportMetric label={t(REPORTS.creditPurchases)} amount={Number(totals.credit_cfa)} />
        <ReportMetric label={t(REPORTS.paidAtValidate)} amount={Number(totals.paid_at_validate_cfa)} />
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border/70">
        <div
          className={cn(
            'grid gap-3 px-4 py-2 bg-surface-muted text-xs font-semibold text-text-secondary',
            GRID,
          )}
        >
          <BiTableHeader {...ACHATS.supplier} />
          <span className="text-right">
            <BiTableHeader {...REPORTS.purchased} />
          </span>
          <span className="text-right">
            <BiTableHeader {...REPORTS.creditPurchases} />
          </span>
          <span className="text-right">
            <BiTableHeader {...REPORTS.paidAtValidate} />
          </span>
          <span className="text-right">
            <BiTableHeader {...REPORTS.receiptCount} />
          </span>
          <span className="text-right">
            <BiTableHeader {...ACHATS.balance} />
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-secondary">{t(ACHATS.emptyReceipts)}</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.supplier_id}
              className={cn('grid gap-3 px-4 py-3 border-t border-border items-center text-sm', GRID)}
            >
              <span className="truncate font-medium">{row.supplier_name}</span>
              <MoneyDisplay amount={row.purchased_cfa} className="justify-self-end" />
              <MoneyDisplay amount={row.credit_cfa} className="justify-self-end" />
              <MoneyDisplay amount={row.paid_at_validate_cfa} className="justify-self-end" />
              <span className="justify-self-end tabular-nums">{row.receipt_count}</span>
              <MoneyDisplay
                amount={row.balance_owed_cfa}
                className={cn(
                  'justify-self-end',
                  row.balance_owed_cfa > 0 && 'text-danger-foreground font-medium',
                )}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
