import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

export const CLICKABLE_ROW =
  'cursor-pointer hover:bg-surface-muted transition-colors focus:outline-none focus:bg-primary-subtle'

/** Even/odd striping used on list tables (Clients, etc.). */
export function tableRowZebra(index: number, selected = false): string {
  if (selected) return 'bg-primary-subtle'
  return index % 2 === 1 ? 'bg-surface-muted/50' : 'bg-surface'
}

export function RowChevron({ className }: { className?: string }) {
  return (
    <ChevronRight
      className={cn('h-4 w-4 text-text-muted flex-shrink-0 justify-self-end', className)}
      aria-hidden="true"
    />
  )
}
