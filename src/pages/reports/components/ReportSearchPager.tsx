import { useMemo, useState } from 'react'
import { PaginationBar } from '@/components/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { t } from '@/lib/bilingual/types'

const PAGE = 50

export function useReportSearchPager<T>(
  rows: T[],
  getSearchText: (row: T) => string,
) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => getSearchText(row).toLowerCase().includes(q))
  }, [rows, query, getSearchText])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const safePage = Math.min(page, pages - 1)
  const slice = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE)
  return {
    query,
    setQuery: (value: string) => {
      setQuery(value)
      setPage(0)
    },
    page: safePage,
    setPage,
    pages,
    filtered,
    slice,
  }
}

export function ReportSearchField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t(REPORTS.searchPlaceholder)}
      className="h-11 w-full max-w-sm rounded-lg border border-border bg-surface px-3 text-sm"
    />
  )
}

export { PAGE as REPORT_PAGE_SIZE }
