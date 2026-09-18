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
import { supabase } from '@/lib/supabase'
import type { StaffRole } from '@/types/database'

interface NavItem {
  label: BilingualPair
  path: string
  icon: React.ElementType
  isPrimary?: boolean
}

interface NavGroup {
  title: BilingualPair
  items: NavItem[]
}

const ADMIN_GROUPS: NavGroup[] = [
  {
    title: NAV_GROUP.overview,
    items: [
      { label: NAV.pos, path: '/pos', icon: ShoppingCart, isPrimary: true },
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
    { label: NAV.pos, path: '/pos', icon: ShoppingCart, isPrimary: true },
    { label: NAV.sales, path: '/sales', icon: Receipt },
    { label: NAV.customers, path: '/customers', icon: Users },
    { label: NAV.payments, path: '/payments', icon: Banknote },
    { label: NAV.shift, path: '/shifts', icon: Clock },
  ],
  depot_staff: [
    { label: NAV.overview, path: '/depot', icon: Warehouse, isPrimary: true },
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
  return path === '/inventory' || path === '/depot'
}

function RailItem({ item, expanded }: { item: NavItem; expanded: boolean }) {
  const Icon = item.icon
  const { pathname } = useLocation()
  const end = railEnd(item.path)
  const isActive = isRailPathActive(pathname, item.path, end)
  const aria = bilingualAriaLabel(item.label)

  return (
    <NavLink
      to={item.path}
      end={end}
      aria-label={aria}
      title={!expanded ? bilingualPlain(item.label) : undefined}
      className={cn(
        'group relative flex transition-colors duration-150 select-none',
        expanded
          ? 'items-center gap-3 rounded-lg py-2 pl-2 pr-2.5 min-h-[40px]'
          : 'flex-col items-center justify-center gap-1 rounded-lg py-2 px-1 min-h-[52px]',
        isActive
          ? expanded
            ? 'bg-primary/10 text-primary'
            : 'bg-primary/10 text-primary'
          : item.isPrimary
            ? 'text-primary hover:bg-primary/5'
            : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
      )}
    >
      {isActive && (
        <span
          className={cn(
            'absolute rounded-full bg-primary',
            expanded ? 'left-0 top-2 bottom-2 w-1' : 'top-1 left-1.5 right-1.5 h-1',
          )}
          aria-hidden="true"
        />
      )}

      <span
        className={cn(
          'flex flex-shrink-0 items-center justify-center rounded-lg transition-colors',
          expanded ? 'h-8 w-8' : 'h-9 w-9',
          isActive
            ? 'bg-primary text-primary-foreground shadow-sm'
            : item.isPrimary
              ? 'bg-primary/15 text-primary group-hover:bg-primary/20'
              : 'bg-surface-muted text-text-secondary group-hover:bg-surface group-hover:text-text-primary',
        )}
      >
        <Icon className={cn('text-current', expanded ? 'h-4 w-4' : 'h-[18px] w-[18px]')} aria-hidden="true" />
      </span>

      <span className={cn('min-w-0', !expanded && 'max-w-[4.25rem]')}>
        <BilingualText
          {...item.label}
          variant={expanded ? 'nav' : 'navCollapsed'}
          className={cn(!expanded && 'w-full items-center')}
        />
      </span>
    </NavLink>
  )
}

function RailNavGroups({
  groups,
  expanded,
}: {
  groups: NavGroup[]
  expanded: boolean
}) {
  return (
    <div className={cn('space-y-4', expanded ? 'px-2' : 'px-1.5 space-y-3')}>
      {groups.map((group) => (
        <div key={group.title.fr}>
          {expanded && (
            <div className="px-2 mb-1.5">
              <BilingualText {...group.title} variant="navGroup" />
            </div>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <RailItem key={item.path} item={item} expanded={expanded} />
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
}: {
  items: NavItem[]
  expanded: boolean
}) {
  return (
    <div className={cn('space-y-0.5', expanded ? 'px-2' : 'px-1.5')}>
      {items.map((item) => (
        <RailItem key={item.path} item={item} expanded={expanded} />
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
  const staff = useAuthStore((s) => s.staff)
  const clear = useAuthStore((s) => s.clear)
  const role: StaffRole = staff?.role ?? 'cashier'
  const isAdmin = role === 'admin'
  const showExpanded = drawer || expanded

  async function handleSignOut() {
    await supabase.auth.signOut()
    clear()
  }

  const collapseLabel = expanded ? AUTH_NAV.collapseRail : AUTH_NAV.expandRail

  return (
    <nav
      className={cn(
        'flex flex-col h-full flex-shrink-0 border-r border-border',
        'bg-surface-muted transition-[width] duration-200 ease-in-out',
        showExpanded ? 'w-[240px]' : 'w-[88px]',
      )}
      aria-label="Navigation principale"
    >
      <div
        className={cn(
          'flex items-center h-14 flex-shrink-0 border-b border-border bg-surface',
          showExpanded ? 'gap-3 px-4' : 'justify-center px-2',
        )}
      >
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
          <span className="text-primary-foreground text-sm font-bold">V</span>
        </div>
        {showExpanded && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary leading-none tracking-tight">VHM POS</p>
            <BilingualText
              fr="Back-office"
              en="Back office"
              variant="caption"
              className="mt-0.5"
              frClassName="text-[10px] font-semibold uppercase tracking-wide text-text-muted"
            />
          </div>
        )}
      </div>

      <div className="flex-1 py-3 overflow-y-auto scrollbar-thin">
        {isAdmin ? (
          <RailNavGroups groups={ADMIN_GROUPS} expanded={showExpanded} />
        ) : (
          <RailNavFlat items={NAV_ITEMS[role]} expanded={showExpanded} />
        )}
      </div>

      <div className="py-2 px-2 border-t border-border bg-surface space-y-0.5 flex-shrink-0">
        <button
          type="button"
          onClick={handleSignOut}
          className={cn(
            'w-full rounded-lg text-danger-foreground font-semibold',
            'hover:bg-danger-bg transition-colors duration-150',
            showExpanded
              ? 'flex items-center gap-3 px-2.5 py-2 text-sm'
              : 'flex flex-col items-center justify-center gap-1 py-2 min-h-[48px] text-[10px]',
          )}
          aria-label={bilingualAriaLabel(AUTH_NAV.signOut)}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger-bg flex-shrink-0">
            <LogOut className="h-4 w-4 text-current" aria-hidden="true" />
          </span>
          <BilingualText
            {...AUTH_NAV.signOut}
            variant={showExpanded ? 'nav' : 'navCollapsed'}
            className={cn(!showExpanded && 'items-center')}
          />
        </button>

        {!drawer && (
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              'w-full rounded-lg text-text-muted font-medium hover:bg-surface-muted hover:text-text-secondary',
              'transition-colors duration-150',
              expanded
                ? 'flex items-center gap-3 px-2.5 py-2 text-sm'
                : 'flex flex-col items-center justify-center gap-1 py-2 min-h-[44px] text-[10px]',
            )}
            aria-label={bilingualAriaLabel(collapseLabel)}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted flex-shrink-0">
              {expanded ? (
                <PanelLeftClose className="h-4 w-4 text-current" aria-hidden="true" />
              ) : (
                <PanelLeftOpen className="h-4 w-4 text-current" aria-hidden="true" />
              )}
            </span>
            <BilingualText
              {...collapseLabel}
              variant={expanded ? 'nav' : 'navCollapsed'}
              className={cn(!expanded && 'items-center font-semibold')}
            />
          </button>
        )}
      </div>
    </nav>
  )
}
