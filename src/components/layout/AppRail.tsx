import { NavLink, useLocation } from 'react-router-dom'
import { usePOSStore } from '@/stores/posStore'
import {
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { BilingualText } from '@/components/ui/BilingualText'
import { AUTH_NAV, NAV, NAV_GROUP } from '@/lib/bilingual/nav'
import { bilingualAriaLabel, bilingualPlain, type BilingualPair } from '@/lib/bilingual/types'
import { APP_DISPLAY_NAME } from '@/lib/formatters'
import { useAuthStore } from '@/stores/authStore'
import { useLocaleStore } from '@/stores/localeStore'
import { supabase } from '@/lib/supabase'
import type { StaffRole } from '@/types/database'
import { NavPictogram } from './NavPictogram'

interface NavItem {
  label: BilingualPair
  path: string
}

interface NavGroup {
  title: BilingualPair
  items: NavItem[]
}

const ADMIN_GROUPS: NavGroup[] = [
  {
    title: NAV_GROUP.overview,
    items: [
      { label: NAV.pos, path: '/pos' },
      { label: NAV.overview, path: '/dashboard' },
    ],
  },
  {
    title: NAV_GROUP.operations,
    items: [
      { label: NAV.sales, path: '/sales' },
      { label: NAV.proformas, path: '/proformas' },
      { label: NAV.achats, path: '/achats' },
      { label: NAV.inventory, path: '/inventory' },
      { label: NAV.customers, path: '/customers' },
      { label: NAV.payments, path: '/payments' },
      { label: NAV.transfers, path: '/transfers' },
      { label: NAV.shifts, path: '/shifts' },
    ],
  },
  {
    title: NAV_GROUP.insights,
    items: [{ label: NAV.reports, path: '/reports' }],
  },
  {
    title: NAV_GROUP.administration,
    items: [
      { label: NAV.staff, path: '/admin/staff' },
      { label: NAV.depots, path: '/admin/depots' },
      { label: NAV.categories, path: '/admin/categories' },
      { label: NAV.auditLog, path: '/admin/audit' },
      { label: NAV.settings, path: '/admin/settings' },
    ],
  },
]

const NAV_ITEMS: Record<Exclude<StaffRole, 'admin'>, NavItem[]> = {
  cashier: [
    { label: NAV.pos, path: '/pos' },
    { label: NAV.sales, path: '/sales' },
    { label: NAV.proformas, path: '/proformas' },
    { label: NAV.customers, path: '/customers' },
    { label: NAV.payments, path: '/payments' },
    { label: NAV.shift, path: '/shifts' },
  ],
  depot_staff: [
    { label: NAV.overview, path: '/depot' },
    { label: NAV.sales, path: '/sales' },
    { label: NAV.inventory, path: '/inventory' },
    { label: NAV.stockActivity, path: '/inventory/activity' },
    { label: NAV.transfers, path: '/transfers' },
    { label: NAV.customers, path: '/customers' },
  ],
}

function isRailPathActive(pathname: string, path: string, end: boolean): boolean {
  if (end) return pathname === path
  return pathname === path || pathname.startsWith(`${path}/`)
}

function railEnd(path: string): boolean {
  return path === '/inventory' || path === '/depot' || path === '/pos'
}

function RailItem({
  item,
  expanded,
  iconOnly,
}: {
  item: NavItem
  expanded: boolean
  iconOnly: boolean
}) {
  const { pathname } = useLocation()
  const end = railEnd(item.path)
  const isActive = isRailPathActive(pathname, item.path, end)
  const aria = bilingualAriaLabel(item.label)
  const showExpandedLabel = expanded && !iconOnly
  const isPos = item.path === '/pos'
  const cartCount = usePOSStore((s) => (isPos ? s.items.length : 0))

  return (
    <NavLink
      to={item.path === '/reports' ? '/reports/sales/summary' : item.path}
      end={end}
      aria-label={aria}
      title={iconOnly ? bilingualPlain(item.label) : undefined}
      className={cn(
        'group relative flex select-none transition-colors duration-150',
        showExpandedLabel
          ? 'items-center gap-2.5 h-11 min-h-[44px] px-2.5 rounded-md'
          : 'flex-col items-center justify-center gap-0.5 min-h-[52px] py-1.5 px-1 w-full rounded-md',
        isActive
          ? 'text-text-primary bg-primary-subtle'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted',
      )}
    >
      {isActive && (
        <span
          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}

      <span className="relative">
        <NavPictogram
          path={item.path}
          active={isActive}
          size={isPos ? 'pos' : 'md'}
        />
        {cartCount > 0 && (
          <span className="absolute -right-2 -top-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-5 text-center">
            {cartCount}
          </span>
        )}
      </span>

      {showExpandedLabel ? (
        <span className="min-w-0 truncate">
          <BilingualText {...item.label} variant="nav" />
        </span>
      ) : (
        <span className="w-full px-0.5">
          <BilingualText
            {...item.label}
            variant="navCollapsed"
            className="w-full items-center"
          />
        </span>
      )}
    </NavLink>
  )
}

function RailNavGroups({
  groups,
  expanded,
  iconOnly,
}: {
  groups: NavGroup[]
  expanded: boolean
  iconOnly: boolean
}) {
  return (
    <div className={cn(expanded && !iconOnly ? 'px-2 space-y-5' : 'px-1 space-y-1')}>
      {groups.map((group) => (
        <div key={group.title.en}>
          {expanded && !iconOnly && (
            <div className="px-2.5 mb-1">
              <BilingualText {...group.title} variant="navGroup" />
            </div>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <RailItem key={item.path} item={item} expanded={expanded} iconOnly={iconOnly} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RailNavFlat({
  items,
  expanded,
  iconOnly,
}: {
  items: NavItem[]
  expanded: boolean
  iconOnly: boolean
}) {
  return (
    <div className={cn('space-y-0.5', expanded && !iconOnly ? 'px-2' : 'px-1')}>
      {items.map((item) => (
        <RailItem key={item.path} item={item} expanded={expanded} iconOnly={iconOnly} />
      ))}
    </div>
  )
}

export interface AppRailProps {
  expanded: boolean
  onToggle: () => void
  /** Off-canvas mobile panel: fixed expanded width, no collapse control. */
  drawer?: boolean
  /** POS: stay icon-only; hide the expand control. */
  lockCollapsed?: boolean
}

export function AppRail({ expanded, onToggle, drawer = false, lockCollapsed = false }: AppRailProps) {
  useLocaleStore((s) => s.locale)
  const staff = useAuthStore((s) => s.staff)
  const clear = useAuthStore((s) => s.clear)
  const role: StaffRole = staff?.role ?? 'cashier'
  const isAdmin = role === 'admin'
  const showExpanded = drawer || (!lockCollapsed && expanded)
  const iconOnly = !showExpanded

  async function handleSignOut() {
    await supabase.auth.signOut()
    clear()
  }

  const collapseLabel = expanded ? AUTH_NAV.collapseRail : AUTH_NAV.expandRail

  return (
    <nav
      className={cn(
        'flex flex-col h-full flex-shrink-0 border-r border-border bg-surface overflow-hidden',
        'transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        showExpanded
          ? 'w-[var(--rail-width-expanded)] min-w-[var(--rail-width-expanded)] max-w-[var(--rail-width-expanded)]'
          : 'w-[var(--rail-width-collapsed)] min-w-[var(--rail-width-collapsed)] max-w-[var(--rail-width-collapsed)]',
      )}
      aria-label={bilingualAriaLabel({ fr: 'Navigation principale', en: 'Main navigation' })}
    >
      {showExpanded && (
        <div className="flex items-center h-14 flex-shrink-0 px-4">
          <p className="text-[13px] font-semibold tracking-tight text-text-primary">{APP_DISPLAY_NAME}</p>
        </div>
      )}

      <div className={cn('flex-1 overflow-y-auto scrollbar-thin', showExpanded ? 'pt-1 pb-3' : 'py-3')}>
        {isAdmin ? (
          <RailNavGroups groups={ADMIN_GROUPS} expanded={showExpanded} iconOnly={iconOnly} />
        ) : (
          <RailNavFlat items={NAV_ITEMS[role]} expanded={showExpanded} iconOnly={iconOnly} />
        )}
      </div>

      <div className={cn('flex-shrink-0 pb-2', showExpanded ? 'px-2' : 'px-1')}>
        <button
          type="button"
          onClick={handleSignOut}
          className={cn(
            'w-full text-text-secondary hover:text-text-primary transition-colors duration-150',
            showExpanded
              ? 'flex items-center gap-2.5 h-11 min-h-[44px] px-2.5 rounded-md'
              : 'flex items-center justify-center h-11 min-h-[44px]',
          )}
          aria-label={bilingualAriaLabel(AUTH_NAV.signOut)}
        >
          <LogOut className="h-5 w-5 flex-shrink-0 text-current" strokeWidth={1.75} aria-hidden="true" />
          {showExpanded && (
            <BilingualText {...AUTH_NAV.signOut} variant="nav" />
          )}
        </button>

        {!drawer && !lockCollapsed && (
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              'w-full text-text-muted hover:text-text-primary transition-colors duration-150',
              expanded
                ? 'flex items-center gap-2.5 h-11 min-h-[44px] px-2.5 rounded-md'
                : 'flex items-center justify-center h-11 min-h-[44px]',
            )}
            aria-label={bilingualAriaLabel(collapseLabel)}
          >
            {expanded ? (
              <PanelLeftClose className="h-5 w-5 flex-shrink-0 text-current" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="h-5 w-5 flex-shrink-0 text-current" strokeWidth={1.75} aria-hidden="true" />
            )}
            {expanded && (
              <BilingualText
                {...collapseLabel}
                variant="nav"
              />
            )}
          </button>
        )}
      </div>
    </nav>
  )
}
