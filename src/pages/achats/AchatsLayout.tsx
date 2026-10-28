import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/ui'
import { NavPictogram } from '@/components/layout/NavPictogram'
import { ACHATS } from '@/lib/bilingual/achats'
import { BiPageDescription, BiPageTitle, BiTabLabel } from '@/lib/bilingual/ui'
import { bilingualAriaLabel } from '@/lib/bilingual/types'

const TABS = [
  { to: '/achats/fournisseurs', label: ACHATS.suppliers },
  { to: '/achats/receptions', label: ACHATS.receipts },
  { to: '/achats/reglements', label: ACHATS.payments },
] as const

export function AchatsLayout() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...ACHATS.title} />}
          description={<BiPageDescription {...ACHATS.pageDesc} />}
          icon={<NavPictogram path="/achats" size="header" />}
          className="border-b-0"
        />
        <div className="px-3 sm:px-6 pb-3 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              aria-label={bilingualAriaLabel(tab.label)}
              className={({ isActive }) =>
                cn(
                  'px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-primary-subtle text-text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
                )
              }
            >
              <BiTabLabel {...tab.label} />
            </NavLink>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
