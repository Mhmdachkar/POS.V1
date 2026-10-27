import type { ReactNode } from 'react'
import { FILTERS } from '@/lib/bilingual/common'
import { t } from '@/lib/bilingual/types'
import { cn } from '@/lib/cn'
import { SearchInput } from './SearchInput'

export interface FilterBarChip {
  value: string
  label: ReactNode
  /** Accessible name when label is stacked bilingual UI. */
  ariaLabel?: string
}

export interface FilterBarProps {
  chips?: FilterBarChip[]
  activeChip?: string
  onChipChange?: (value: string) => void
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  count?: number
  rightSlot?: ReactNode
  className?: string
}

/**
 * VHM POS — FilterBar
 *
 * Optional search, chips, count, and right-side actions. Callbacks are
 * forwarded as provided; no page-specific filter logic lives here.
 */
export function FilterBar({
  chips,
  activeChip,
  onChipChange,
  search,
  onSearchChange,
  searchPlaceholder,
  count,
  rightSlot,
  className,
}: FilterBarProps) {
  const resolvedPlaceholder = searchPlaceholder ?? t(FILTERS.searchPlaceholder)
  const showSearch = search !== undefined || onSearchChange !== undefined

  return (
    <div className={cn('flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3', className)}>
      {showSearch && (
        <div className="w-full sm:w-56 max-w-full min-w-0 shrink">
          <SearchInput
            value={search ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={resolvedPlaceholder}
            aria-label={resolvedPlaceholder}
          />
        </div>
      )}

      {chips && chips.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin min-w-0 max-w-full -mx-0.5 px-0.5">
          {chips.map((chip) => {
            const isActive = activeChip === chip.value
            return (
              <button
                key={chip.value}
                type="button"
                aria-label={chip.ariaLabel}
                onClick={() => onChipChange?.(chip.value)}
                className={cn(
                  'px-3 min-h-[44px] h-11 rounded-full text-sm font-medium flex-shrink-0 transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-muted text-text-secondary border border-border hover:bg-surface',
                )}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      )}

      {(count != null || rightSlot) && (
        <div className="flex items-center gap-2 sm:ml-auto">
          {count != null && (
            <span className="text-sm text-text-secondary tabular-nums">{count}</span>
          )}
          {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
        </div>
      )}
    </div>
  )
}
