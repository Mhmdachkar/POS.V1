import { NavLink, useLocation } from 'react-router-dom'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  LayoutDashboard,
  ShoppingCart,
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
  Clock,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import type { StaffRole } from '@/types/database'

// ─────────────────────────────────────────────────────────────────
// Nav item definition
// ─────────────────────────────────────────────────────────────────

interface NavItem {
  label: string
  path: string
  icon: React.ElementType
  /** Visual emphasis for the primary POS action */
  isPrimary?: boolean
}

const NAV_ITEMS: Record<StaffRole, NavItem[]> = {
  admin: [
    { label: 'Overview',   path: '/dashboard',         icon: LayoutDashboard },
    { label: 'Sales',      path: '/sales',             icon: Receipt },
    { label: 'Inventory',  path: '/inventory',         icon: Package },
    { label: 'Customers',  path: '/customers',         icon: Users },
    { label: 'Payments',   path: '/payments',          icon: Banknote },
    { label: 'Transfers',  path: '/transfers',         icon: ArrowLeftRight },
    { label: 'Shifts',     path: '/shifts',            icon: Clock },
    { label: 'Reports',    path: '/reports',           icon: BarChart2 },
    { label: 'Staff',      path: '/admin/staff',       icon: UserCog },
    { label: 'Depots',     path: '/admin/depots',      icon: Building2 },
    { label: 'Audit Log',  path: '/admin/audit',       icon: ClipboardList },
    { label: 'Settings',   path: '/admin/settings',    icon: Settings },
  ],
  cashier: [
    { label: 'POS',        path: '/pos',       icon: ShoppingCart, isPrimary: true },
    { label: 'Sales',      path: '/sales',     icon: Receipt },
    { label: 'Customers',  path: '/customers', icon: Users },
    { label: 'Payments',   path: '/payments',  icon: Banknote },
    { label: 'Shift',      path: '/shifts',    icon: Clock },
  ],
  depot_staff: [
    { label: 'Inventory',      path: '/inventory',          icon: Package },
    { label: 'Stock Activity', path: '/inventory/activity', icon: TrendingUp },
    { label: 'Transfers',      path: '/transfers',          icon: ArrowLeftRight },
  ],
}

// ─────────────────────────────────────────────────────────────────
// Rail item
// ─────────────────────────────────────────────────────────────────

function RailItem({
  item,
  expanded,
}: {
  item: NavItem
  expanded: boolean
}) {
  const location = useLocation()
  const isActive =
    location.pathname === item.path ||
    (item.path !== '/' && location.pathname.startsWith(item.path + '/'))

  const Icon = item.icon

  const content = (
    <NavLink
      to={item.path}
      className={cn(
        'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium',
        'transition-colors duration-150 select-none',
        isActive
          ? item.isPrimary
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-primary/10 text-primary'
          : item.isPrimary
          ? 'text-primary hover:bg-primary/10'
          : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
        !expanded && 'justify-center',
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon className={cn('flex-shrink-0', item.isPrimary ? 'h-5 w-5' : 'h-4 w-4')} />
      {expanded && (
        <span className="truncate leading-none">{item.label}</span>
      )}
    </NavLink>
  )

  // When collapsed, wrap in a tooltip
  if (!expanded) {
    return (
      <Tooltip.Root delayDuration={300}>
        <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            className={cn(
              'z-50 px-2.5 py-1.5 rounded-md text-xs font-medium',
              'bg-text-primary text-white shadow-md',
              'animate-in fade-in-0 zoom-in-95 data-[side=right]:slide-in-from-left-2',
            )}
          >
            {item.label}
            <Tooltip.Arrow className="fill-text-primary" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    )
  }

  return content
}

// ─────────────────────────────────────────────────────────────────
// AppRail
// ─────────────────────────────────────────────────────────────────

export interface AppRailProps {
  expanded: boolean
  onToggle: () => void
}

export function AppRail({ expanded, onToggle }: AppRailProps) {
  const staff = useAuthStore((s) => s.staff)
  const clear = useAuthStore((s) => s.clear)
  const role: StaffRole = staff?.role ?? 'cashier'
  const navItems = NAV_ITEMS[role] ?? []

  async function handleSignOut() {
    await supabase.auth.signOut()
    clear()
  }

  return (
    <Tooltip.Provider>
      <nav
        className={cn(
          'flex flex-col h-full bg-surface border-r border-border',
          'transition-[width] duration-200 ease-in-out flex-shrink-0',
          expanded ? 'w-[220px]' : 'w-[64px]',
        )}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div
          className={cn(
            'flex items-center h-14 border-b border-border px-3 flex-shrink-0',
            expanded ? 'gap-2' : 'justify-center',
          )}
        >
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground text-xs font-bold">V</span>
          </div>
          {expanded && (
            <span className="font-bold text-text-primary text-sm tracking-tight leading-none">
              VHM POS
            </span>
          )}
        </div>

        {/* Navigation items */}
        <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => (
            <RailItem key={item.path} item={item} expanded={expanded} />
          ))}
        </div>

        {/* Bottom actions */}
        <div className="py-3 px-2 border-t border-border space-y-0.5 flex-shrink-0">
          {/* Sign out */}
          <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger asChild>
              <button
                onClick={handleSignOut}
                className={cn(
                  'w-full flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium',
                  'text-text-secondary hover:bg-danger-bg hover:text-danger-foreground',
                  'transition-colors duration-150',
                  !expanded && 'justify-center',
                )}
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4 flex-shrink-0" />
                {expanded && <span>Sign out</span>}
              </button>
            </Tooltip.Trigger>
            {!expanded && (
              <Tooltip.Portal>
                <Tooltip.Content
                  side="right"
                  sideOffset={8}
                  className="z-50 px-2.5 py-1.5 rounded-md text-xs font-medium bg-text-primary text-white shadow-md animate-in fade-in-0 zoom-in-95 data-[side=right]:slide-in-from-left-2"
                >
                  Sign out
                  <Tooltip.Arrow className="fill-text-primary" />
                </Tooltip.Content>
              </Tooltip.Portal>
            )}
          </Tooltip.Root>

          {/* Toggle collapse */}
          <button
            onClick={onToggle}
            className={cn(
              'w-full flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium',
              'text-text-muted hover:bg-surface-muted hover:text-text-secondary',
              'transition-colors duration-150',
              !expanded && 'justify-center',
            )}
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {expanded ? (
              <>
                <ChevronLeft className="h-4 w-4 flex-shrink-0" />
                <span>Collapse</span>
              </>
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            )}
          </button>
        </div>
      </nav>
    </Tooltip.Provider>
  )
}
