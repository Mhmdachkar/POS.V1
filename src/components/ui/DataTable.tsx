import { COMMON } from '@/lib/bilingual/common'
import { t } from '@/lib/bilingual/types'
import { cn } from '@/lib/cn'
import { RowChevron } from './RowChevron'

// ─────────────────────────────────────────────────────────────────
// Generic DataTable
// ─────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string
  header: string
  /** Render function for cell content */
  render: (row: T, index: number) => React.ReactNode
  /** Optional column width (Tailwind class, e.g. 'w-32') */
  width?: string
  /** Right-align column (useful for financial values) */
  align?: 'left' | 'right' | 'center'
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  /** Unique key extractor */
  rowKey: (row: T) => string
  /** Called when a row is clicked */
  onRowClick?: (row: T) => void
  /** Empty state content */
  emptyState?: React.ReactNode
  /** Loading state — shows skeleton rows */
  loading?: boolean
  loadingRows?: number
  className?: string
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  emptyState,
  loading = false,
  loadingRows = 5,
  className,
}: DataTableProps<T>) {
  const alignClass = (align?: 'left' | 'right' | 'center') => {
    if (align === 'right') return 'text-right'
    if (align === 'center') return 'text-center'
    return 'text-left'
  }

  return (
    <div className={cn('w-full overflow-x-auto rounded-lg border border-border bg-surface', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide select-none whitespace-nowrap',
                  alignClass(col.align),
                  col.width,
                )}
              >
                {col.header}
              </th>
            ))}
            {onRowClick && <th className="w-8 px-3 py-3" aria-hidden="true" />}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            // Skeleton rows
            Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-3.5 bg-surface-muted rounded animate-skeleton" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (onRowClick ? 1 : 0)}>
                {emptyState ?? (
                  <div className="py-12 text-center text-sm text-text-muted">
                    {t(COMMON.noResults)}
                  </div>
                )}
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  'border-b border-border last:border-0 min-h-[44px]',
                  'transition-colors duration-100',
                  onRowClick
                    ? 'hover:bg-surface-muted cursor-pointer'
                    : 'hover:bg-surface-muted/50',
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-text-primary',
                      alignClass(col.align),
                      col.width,
                    )}
                  >
                    {col.render(row, idx)}
                  </td>
                ))}
                {onRowClick && (
                  <td className="px-3 py-3 w-8">
                    <RowChevron />
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
