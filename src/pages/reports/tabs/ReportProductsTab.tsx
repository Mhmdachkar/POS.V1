import { useMemo, useState } from 'react'
import { BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { COMMON } from '@/lib/bilingual/common'
import { cn } from '@/lib/cn'
import { MoneyDisplay } from '@/components/ui'
import { formatPieces } from '@/lib/formatters'
import type { AdminSalesReport, SalesReportProductRow } from '@/types/rpc'
import { ProductDetailDrawer } from '@/pages/inventory/components/ProductDetailDrawer'
import { ReportSection } from '../components/ReportSection'
import { t } from '@/lib/bilingual/types'


type SortKey = 'net_pieces' | 'net_sales_cfa' | 'gross_profit_cfa' | 'cogs_cfa'

interface ReportProductsTabProps {
  sales: AdminSalesReport
  showDepotColumn: boolean
}

export function ReportProductsTab({ sales, showDepotColumn }: ReportProductsTabProps) {
  const [sortKey, setSortKey] = useState<SortKey>('net_sales_cfa')
  const [sortAsc, setSortAsc] = useState(false)
  const [productId, setProductId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const list = [...sales.product_performance]
    list.sort((a, b) => {
      const av = Number(a[sortKey])
      const bv = Number(b[sortKey])
      return sortAsc ? av - bv : bv - av
    })
    return list
  }, [sales.product_performance, sortKey, sortAsc])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v)
    else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  function sortLabel(key: SortKey, label: string) {
    return `${label}${sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}`
  }

  return (
    <>
      <ReportSection title={<BiSectionTitle {...REPORTS.productPerformance} />}>
        {sorted.length === 0 ? (
          <p className="text-sm text-text-muted">{t(REPORTS.noNetProductSales)}</p>
        ) : (
          <div className="overflow-x-auto border border-border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs text-text-secondary">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">{t(COMMON.product)}</th>
                  {showDepotColumn && <th className="text-left px-3 py-2 font-medium">{t(COMMON.depot)}</th>}
                  <th className="text-right px-3 py-2 font-medium cursor-pointer" onClick={() => toggleSort('net_pieces')}>{sortLabel('net_pieces', t(COMMON.qty))}</th>
                  <th className="text-right px-3 py-2 font-medium cursor-pointer" onClick={() => toggleSort('net_sales_cfa')}>{sortLabel('net_sales_cfa', t(REPORTS.netSalesLabel))}</th>
                  <th className="text-right px-3 py-2 font-medium cursor-pointer" onClick={() => toggleSort('gross_profit_cfa')}>{sortLabel('gross_profit_cfa', t(REPORTS.gp))}</th>
                  <th className="text-right px-3 py-2 font-medium cursor-pointer" onClick={() => toggleSort('cogs_cfa')}>{sortLabel('cogs_cfa', t(REPORTS.cogs))}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((p: SalesReportProductRow) => (
                  <tr
                    key={`${p.product_id}-${p.depot_id}`}
                    className={cn('hover:bg-surface-alt cursor-pointer')}
                    onClick={() => setProductId(p.product_id)}
                  >
                    <td className="px-3 py-2">
                      <span className="font-medium">{p.name}</span>
                      {p.category_name && (
                        <span className="block text-xs text-text-muted">{p.category_name}</span>
                      )}
                    </td>
                    {showDepotColumn && (
                      <td className="px-3 py-2 text-text-secondary">{p.depot_name}</td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums">{formatPieces(Number(p.net_pieces))}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyDisplay amount={p.net_sales_cfa} size="small" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.margin_status ? (
                        <span className="text-xs text-warning-foreground">{p.margin_status}</span>
                      ) : (
                        <MoneyDisplay amount={Number(p.gross_profit_cfa ?? 0)} size="small" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.margin_status ? (
                        <span className="text-text-muted">—</span>
                      ) : (
                        <MoneyDisplay amount={Number(p.cogs_cfa ?? 0)} size="small" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>
      <ProductDetailDrawer productId={productId} onClose={() => setProductId(null)} />
    </>
  )
}
