import { cn } from '@/lib/cn'

// ─────────────────────────────────────────────────────────────────
// Skeleton — loading placeholder
// ─────────────────────────────────────────────────────────────────

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Explicit width (default: 100%) */
  width?: string | number
  /** Explicit height (default: 1rem / 16px) */
  height?: string | number
  /** Rounded variant for avatars, icons */
  rounded?: boolean
}

export function Skeleton({ className, width, height, rounded, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-surface-muted animate-skeleton',
        rounded ? 'rounded-full' : 'rounded-md',
        className,
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : (height ?? '1rem'),
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  )
}

// ─────────────────────────────────────────────────────────────────
// Pre-built skeleton layouts
// ─────────────────────────────────────────────────────────────────

export function StatCardSkeleton() {
  return (
    <div className="bg-surface rounded-lg border border-border shadow-sm p-5 space-y-3">
      <Skeleton height={14} width="60%" />
      <Skeleton height={28} width="80%" />
      <Skeleton height={12} width="40%" />
    </div>
  )
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton height={14} width={i === 0 ? '70%' : '50%'} />
        </td>
      ))}
    </tr>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
      <Skeleton height={140} className="rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton height={14} width="80%" />
        <Skeleton height={12} width="50%" />
        <Skeleton height={16} width="60%" />
      </div>
    </div>
  )
}
