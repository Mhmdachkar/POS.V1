import type { ReactNode } from 'react'
import { BarChart2 } from 'lucide-react'
import { Button, EmptyState, Skeleton } from '@/components/ui'
import { COMMON } from '@/lib/bilingual/common'
import { REPORTS } from '@/lib/bilingual/reports'
import { BiButtonInline, BiEmptyTitle } from '@/lib/bilingual/ui'

export function ReportSectionState<T>({
  isLoading,
  isError,
  data,
  empty,
  onRetry,
  children,
}: {
  isLoading: boolean
  isError: boolean
  data: T | undefined
  empty?: boolean
  onRetry: () => void
  children: (data: T) => ReactNode
}) {
  if (isLoading && data == null) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (isError && data == null) {
    return (
      <div className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-border">
        <EmptyState icon={<BarChart2 className="h-8 w-8" />} title={<BiEmptyTitle {...REPORTS.failedReport} />} />
        <div className="mt-4 flex justify-center">
          <Button type="button" variant="secondary" onClick={onRetry}>
            <BiButtonInline {...COMMON.retry} />
          </Button>
        </div>
      </div>
    )
  }
  if (data == null || empty) {
    return (
      <p className="rounded-2xl bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-sm ring-1 ring-border">
        <BiEmptyTitle {...REPORTS.noDataPeriod} />
      </p>
    )
  }
  return <>{children(data)}</>
}
