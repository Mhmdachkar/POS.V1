import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Warehouse,
  Receipt,
  Package,
  Users,
  Banknote,
  ArrowLeftRight,
  BarChart2,
  UserCog,
  Building2,
  ClipboardList,
  Settings,
  Tags,
  Clock,
  TrendingUp,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { BilingualText } from '@/components/ui/BilingualText'
import { AUTH_NAV, NAV, NAV_GROUP } from '@/lib/bilingual/nav'
import { bilingualAriaLabel, bilingualPlain, type BilingualPair } from '@/lib/bilingual/types'
import { useAuthStore } from '@/stores/authStore'
import { useLocaleStore } from '@/stores/localeStore'
import { supabase } from '@/lib/supabase'
import type { StaffRole } from '@/types/database'

interface NavItem {
  label: BilingualPair
  path: string
  icon: React.ElementType
}

interface NavGroup {
  title: BilingualPair
  items: NavItem[]
}

const ADMIN_GROUPS: NavGroup[] = [
  {
    title: NAV_GROUP.overview,
    items: [
      { label: NAV.pos, path: '/pos', icon: ShoppingCart },
      { label: NAV.overview, path: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: NAV_GROUP.operations,
    items: [
      { label: NAV.sales, path: '/sales', icon: Receipt },
      { label: NAV.inventory, path: '/inventory', icon: Package },
      { label: NAV.customers, path: '/customers', icon: Users },
      { label: NAV.payments, path: '/payments', icon: Banknote },
      { label: NAV.transfers, path: '/transfers', icon: ArrowLeftRight },
      { label: NAV.shifts, path: '/shifts', icon: Clock },
    ],
  },
  {
    title: NAV_GROUP.insights,
    items: [{ label: NAV.reports, path: '/reports', icon: BarChart2 }],
  },
  {
    title: NAV_GROUP.administration,
    items: [
      { label: NAV.staff, path: '/admin/staff', icon: UserCog },
      { label: NAV.depots, path: '/admin/depots', icon: Building2 },
      { label: NAV.categories, path: '/admin/categories', icon: Tags },
      { label: NAV.auditLog, path: '/admin/audit', icon: ClipboardList },
      { label: NAV.settings, path: '/admin/settings', icon: Settings },
    ],
  },
]

const NAV_ITEMS: Record<Exclude<StaffRole, 'admin'>, NavItem[]> = {
  cashier: [
    { label: NAV.pos, path: '/pos', icon: ShoppingCart },
    { label: NAV.sales, path: '/sales', icon: Receipt },
    { label: NAV.customers, path: '/customers', icon: Users },
    { label: NAV.payments, path: '/payments', icon: Banknote },
    { label: NAV.shift, path: '/shifts', icon: Clock },
  ],
  depot_staff: [
    { label: NAV.overview, path: '/depot', icon: Warehouse },
    { label: NAV.sales, path: '/sales', icon: Receipt },
    { label: NAV.inventory, path: '/inventory', icon: Package },
    { label: NAV.stockActivity, path: '/inventory/activity', icon: TrendingUp },
    { label: NAV.transfers, path: '/transfers', icon: ArrowLeftRight },
    { label: NAV.customers, path: '/customers', icon: Users },
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
  const Icon = item.icon
  const { pathname } = useLocation()
  const end = railEnd(item.path)
  const isActive = isRailPathActive(pathname, item.path, end)
  const aria = bilingualAriaLabel(item.label)
  const showLabel = expanded && !iconOnly

  return (
    <NavLink
      to={item.path}
      end={end}
      aria-label={aria}
      title={!showLabel ? bilingualPlain(item.label) : undefined}
      className={cn(
        'group relative flex select-none transition-colors duration-150',
        showLabel
          ? 'items-center gap-2.5 h-9 px-2.5 rounded-md'
          : 'items-center justify-center h-10 w-full',
        isActive
          ? 'text-primary'
          : 'text-text-secondary hover:text-text-primary',
      )}
    >
      {isActive && (
        <span
          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}

      <Icon
        className="h-5 w-5 flex-shrink-0 text-current"
        strokeWidth={isActive ? 2 : 1.75}
        aria-hidden="true"
      />

      {showLabel && (
        <span className="min-w-0 truncate">
          <BilingualText {...item.label} variant="nav" />
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
}

export function AppRail({ expanded, onToggle, drawer = false }: AppRailProps) {
  useLocaleStore((s) => s.locale)
  const staff = useAuthStore((s) => s.staff)
  const clear = useAuthStore((s) => s.clear)
  const { pathname } = useLocation()
  const role: StaffRole = staff?.role ?? 'cashier'
  const isAdmin = role === 'admin'
  const posIconOnly = pathname === '/pos' && !drawer
  const showExpanded = drawer || (!posIconOnly && expanded)

  async function handleSignOut() {
    await supabase.auth.signOut()
    clear()
  }

  const collapseLabel = expanded ? AUTH_NAV.collapseRail : AUTH_NAV.expandRail

  return (
    <nav
      className={cn(
        'flex flex-col h-full flex-shrink-0 border-r border-border bg-surface',
        'transition-[width] duration-200 ease-in-out',
        showExpanded ? 'w-[220px]' : 'w-14',
      )}
      aria-label={bilingualAriaLabel({ fr: 'Navigation principale', en: 'Main navigation' })}
    >
      {showExpanded && (
        <div className="flex items-center h-14 flex-shrink-0 px-4">
          <p className="text-[13px] font-semibold tracking-tight text-text-primary">VHM POS</p>
        </div>
      )}

      <div className={cn('flex-1 overflow-y-auto scrollbar-thin', showExpanded ? 'pt-1 pb-3' : 'py-3')}>
        {isAdmin ? (
          <RailNavGroups groups={ADMIN_GROUPS} expanded={showExpanded} iconOnly={posIconOnly} />
        ) : (
          <RailNavFlat items={NAV_ITEMS[role]} expanded={showExpanded} iconOnly={posIconOnly} />
        )}
      </div>

      <div className={cn('flex-shrink-0 pb-2', showExpanded ? 'px-2' : 'px-1')}>
        <button
          type="button"
          onClick={handleSignOut}
          className={cn(
            'w-full text-text-secondary hover:text-text-primary transition-colors duration-150',
            showExpanded
              ? 'flex items-center gap-2.5 h-9 px-2.5 rounded-md'
              : 'flex items-center justify-center h-10',
          )}
          aria-label={bilingualAriaLabel(AUTH_NAV.signOut)}
        >
          <LogOut className="h-5 w-5 flex-shrink-0 text-current" strokeWidth={1.75} aria-hidden="true" />
          {showExpanded && (
            <BilingualText {...AUTH_NAV.signOut} variant="nav" />
          )}
        </button>

        {!drawer && !posIconOnly && (
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              'w-full text-text-muted hover:text-text-primary transition-colors duration-150',
              expanded
                ? 'flex items-center gap-2.5 h-9 px-2.5 rounded-md'
                : 'flex items-center justify-center h-10',
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
