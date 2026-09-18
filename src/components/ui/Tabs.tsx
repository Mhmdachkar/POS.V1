import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem {
  value: string
  label: ReactNode
}

export interface TabsProps {
  tabs: TabItem[]
  active: string
  onChange: (value: string) => void
  className?: string
}

/**
 * VHM POS — Tabs
 *
 * Lightweight tablist. Active tab is the only tabbable tab; arrow keys
 * move selection. No page-specific routing or data fetching.
 */
export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (tabs.length === 0) return
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return

    event.preventDefault()
    const index = tabs.findIndex((tab) => tab.value === active)
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    if (next) onChange(next.value)
  }

  return (
    <div
      role="tablist"
      className={cn('flex border-b border-border overflow-x-auto scrollbar-thin', className)}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cn(
              'px-3 sm:px-4 h-9 text-sm font-medium border-b-2 -mb-px transition-colors flex-shrink-0 whitespace-nowrap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
