import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

export const CLICKABLE_ROW =
  'cursor-pointer hover:bg-surface-muted transition-colors focus:outline-none focus:bg-primary-subtle'

export function RowChevron({ className }: { className?: string }) {
  return (
    <ChevronRight
      className={cn('h-4 w-4 text-text-muted flex-shrink-0 justify-self-end', className)}
      aria-hidden="true"
    />
  )
}
