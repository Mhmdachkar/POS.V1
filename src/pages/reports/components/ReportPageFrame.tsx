import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as Tooltip from '@radix-ui/react-tooltip'
import { ReportToolbar } from './ReportToolbar'
import { type ReportDef } from '../reportCatalog'
import { useReportSearch } from '../useReportSearch'
import { BiPageDescription, BiPageTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { t } from '@/lib/bilingual/types'
import { supabase } from '@/lib/supabase'
import { useCategories } from '@/hooks/useInventory'
import { useStaffList } from '@/hooks/useStaff'
import { formatCalendarDate } from '@/lib/formatters'

export function ReportPageFrame({
  report,
  exportDisabled,
  onExportCsv,
  onExportXlsx,
  onExportPrint,
  children,
}: {
  report: ReportDef
  exportDisabled?: boolean
  onExportCsv?: () => void
  onExportXlsx?: () => void
  onExportPrint?: () => void
  children: ReactNode
}) {
  const search = useReportSearch()
  const { data: staffList } = useStaffList({ page: 0, pageSize: 200, search: '', status: 'active', role: 'all' })
  const { data: categories } = useCategories()
  const productsQ = useQuery({
    queryKey: ['report-product-options', search.depotId, search.category],
    queryFn: async () => {
      let q = supabase.from('products').select('id, name').eq('is_active', true)
      if (search.depotId) q = q.eq('depot_id', search.depotId)
      if (search.category) q = q.eq('category_id', search.category)
      const { data, error } = await q.order('name').limit(500)
      if (error) throw error
      const rows = (data ?? []) as Array<{ id: string; name: string }>
      return rows.map((row) => ({ value: row.id, label: row.name }))
    },
  })
  const shiftsQ = useQuery({
    queryKey: ['report-shift-options', search.depotId, search.range.startDate, search.range.endDate],
    queryFn: async () => {
      let q = supabase
        .from('shifts')
        .select('id, opened_at, cashier_id')
        .gte('opened_at', `${search.range.startDate}T00:00:00.000Z`)
        .lte('opened_at', `${search.range.endDate}T23:59:59.999Z`)
      if (search.depotId) q = q.eq('depot_id', search.depotId)
      const { data, error } = await q.order('opened_at', { ascending: false }).limit(100)
      if (error) throw error
      const rows = (data ?? []) as Array<{ id: string; opened_at: string | null }>
      return rows.map((row) => ({
        value: row.id,
        label: String(row.opened_at ?? row.id).slice(0, 16).replace('T', ' '),
      }))
    },
    enabled: report.filters.includes('service'),
  })

  return (
    <Tooltip.Provider delayDuration={150}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 shrink-0 border-b border-border bg-surface px-4 py-3 sm:px-6">
          <nav className="mb-2 text-xs text-text-muted">
            {t(REPORTS.pageTitle)} / {t(report.group)} / {t(report.title)}
          </nav>
          <h1 className="text-title text-text-primary">
            <BiPageTitle {...report.title} />
          </h1>
          <div className="mt-0.5 text-sm text-text-secondary">
            <BiPageDescription {...report.description} />
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {formatCalendarDate(search.range.startDate)} → {formatCalendarDate(search.range.endDate)}
          </p>
          <div className="mt-3">
            <ReportToolbar
              preset={search.preset}
              onPresetChange={search.setPreset}
              customStart={search.from}
              customEnd={search.to}
              onCustomStartChange={search.setFrom}
              onCustomEndChange={search.setTo}
              showCashierFilter={report.filters.includes('cashier')}
              showCategoryFilter={report.filters.includes('category')}
              showProductFilter={report.filters.includes('product')}
              showShiftFilter={report.filters.includes('service')}
              cashierId={search.cashier}
              onCashierIdChange={search.setCashier}
              categoryId={search.category}
              onCategoryIdChange={search.setCategory}
              productId={search.product}
              onProductIdChange={search.setProduct}
              shiftId={search.service}
              onShiftIdChange={search.setService}
              cashierOptions={(staffList?.data ?? []).map((s) => ({ value: s.id, label: s.full_name }))}
              categoryOptions={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
              productOptions={productsQ.data ?? []}
              shiftOptions={shiftsQ.data ?? []}
              exportDisabled={exportDisabled}
              onExportCsv={onExportCsv}
              onExportXlsx={onExportXlsx}
              onExportPrint={onExportPrint}
            />
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </Tooltip.Provider>
  )
}
