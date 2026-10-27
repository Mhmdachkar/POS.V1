import type { ReactNode } from 'react'
import { REPORTS } from '@/lib/bilingual/reports'
import { t } from '@/lib/bilingual/types'
import { cn } from '@/lib/cn'

export interface ReportNavItem {
  value: string
  label: ReactNode
}

const GROUPS: Array<{ title: typeof REPORTS.sales; values: string[] }> = [
  { title: REPORTS.sales, values: ['overview', 'sales', 'products', 'returns', 'voids', 'cost'] },
  { title: REPORTS.inventory, values: ['inventory', 'transfers'] },
  { title: REPORTS.customers, values: ['customers', 'payments'] },
  { title: REPORTS.shifts, values: ['shifts', 'audit'] },
]

export function ReportNav({
  tabs,
  active,
  onChange,
}: {
  tabs: ReportNavItem[]
  active: string
  onChange: (value: string) => void
}) {
  const byValue = new Map(tabs.map((tab) => [tab.value, tab]))

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const order = GROUPS.flatMap((group) => group.values).filter((value) => byValue.has(value))
    const index = order.indexOf(active)
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const next = order[(index + delta + order.length) % order.length]
    if (next) onChange(next)
  }

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      className="scrollbar-thin flex gap-1 overflow-x-auto px-3 py-2 lg:block lg:overflow-visible lg:px-3 lg:pb-4"
      onKeyDown={handleKeyDown}
    >
      {GROUPS.map((group) => (
        <div key={group.title.fr} className="flex shrink-0 gap-1 lg:mb-4 lg:block">
          <p className="hidden px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted lg:block">
            {t(group.title)}
          </p>
          {group.values.map((value) => {
            const tab = byValue.get(value)
            if (!tab) return null
            const isActive = active === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onChange(value)}
                className={cn(
                  'min-h-[44px] shrink-0 rounded-lg px-3 text-left text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  'lg:flex lg:w-full lg:items-center',
                  isActive
                    ? 'bg-primary-subtle text-primary shadow-sm ring-1 ring-primary/20'
                    : 'text-text-secondary hover:bg-background hover:text-text-primary',
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
