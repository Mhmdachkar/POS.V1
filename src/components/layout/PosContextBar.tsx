import { Link } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Building2,
  ChevronDown,
  LogOut,
  ShoppingCart,
  Receipt,
  Users,
  Banknote,
  Clock,
  LayoutDashboard,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { PosNavRail } from './PosNavRail'
import { ShiftChip } from '@/components/pos/ShiftChip'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { supabase } from '@/lib/supabase'
import { AUTH_NAV, NAV } from '@/lib/bilingual/nav'
import { COMMON } from '@/lib/bilingual/common'
import { ADMIN } from '@/lib/bilingual/admin'

const POS_NAV_ITEMS = [
  { to: '/pos', label: NAV.pos.fr, hint: 'Vendre', Icon: ShoppingCart, end: true },
  { to: '/sales', label: NAV.sales.fr, hint: 'Tickets', Icon: Receipt, end: false },
  { to: '/customers', label: NAV.customers.fr, hint: 'Comptes', Icon: Users, end: false },
  { to: '/payments', label: NAV.payments.fr, hint: 'Encaisser', Icon: Banknote, end: false },
  { to: '/shifts', label: NAV.shifts.fr, hint: 'Caisse', Icon: Clock, end: false },
] as const

function cashierInitials(name: string | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

function PosUserMenu() {
  const staff = useAuthStore((s) => s.staff)
  const clear = useAuthStore((s) => s.clear)

  async function handleSignOut() {
    await supabase.auth.signOut()
    clear()
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-2 h-11 pl-1.5 pr-2 rounded-xl',
            'border border-border bg-surface hover:bg-surface-muted',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
          )}
          aria-label="Menu utilisateur"
        >
          <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
            {cashierInitials(staff?.full_name)}
          </span>
          <span className="hidden md:flex flex-col items-start min-w-0 max-w-[7rem] leading-tight">
            <span className="text-sm font-semibold text-text-primary truncate w-full text-left">
              {staff?.full_name ?? '—'}
            </span>
            <span className="text-[11px] text-text-muted truncate w-full text-left">
              @{staff?.username ?? 'user'}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-text-muted flex-shrink-0" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            'z-50 min-w-[200px] bg-surface rounded-xl border border-border shadow-md p-1',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2',
          )}
          align="end"
          sideOffset={8}
        >
          <div className="px-3 py-2.5 border-b border-border mb-1">
            <p className="text-sm font-semibold text-text-primary">{staff?.full_name}</p>
            <p className="text-xs text-text-muted">@{staff?.username}</p>
          </div>
          <DropdownMenu.Item
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg cursor-pointer',
              'text-danger hover:bg-danger-bg focus:outline-none focus:bg-danger-bg',
            )}
            onSelect={handleSignOut}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {AUTH_NAV.signOut.fr}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function PosDepotSwitcher() {
  const staff = useAuthStore((s) => s.staff)
  const { currentDepotId, currentDepotName, availableDepots, setCurrentDepot } = useDepotStore()
  const isAdmin = staff?.role === 'admin'
  const label = currentDepotName ?? (isAdmin ? ADMIN.selectDepot.fr : COMMON.depot.fr)

  if (!isAdmin || availableDepots.length === 0) {
    return (
      <p
        className="text-sm sm:text-[15px] font-bold text-text-primary truncate leading-snug sm:mt-1.5 flex items-center gap-1.5"
        data-testid="pos-depot-label"
      >
        <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-text-secondary flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </p>
    )
  }

  const activeDepots = availableDepots.filter((d) => d.is_active !== false)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-testid="pos-depot-label"
          aria-label="Choisir le dépôt"
          className={cn(
            'mt-0 sm:mt-1.5 inline-flex items-center gap-1.5 max-w-full rounded-lg px-1.5 py-0.5 -ml-1.5',
            'text-sm sm:text-[15px] font-bold text-text-primary',
            'hover:bg-surface-muted transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
          )}
        >
          <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-text-secondary flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-text-muted flex-shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            'z-50 min-w-[180px] bg-surface rounded-xl border border-border shadow-md p-1',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2',
          )}
          align="start"
          sideOffset={6}
        >
          {activeDepots.map((depot) => (
            <DropdownMenu.Item
              key={depot.id}
              className={cn(
                'flex items-center justify-between gap-3 px-2.5 py-2 text-sm rounded-lg cursor-pointer',
                'text-text-primary hover:bg-surface-muted focus:outline-none focus:bg-surface-muted',
                currentDepotId === depot.id && 'bg-primary-subtle text-primary font-semibold',
              )}
              onSelect={() => setCurrentDepot(depot.id, depot.name)}
            >
              <span>{depot.name}</span>
              <span className="text-xs text-text-muted">{depot.code}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/**
 * PosContextBar — checkout terminal header: identity · workspace segments · session.
 */
export function PosContextBar() {
  const staff = useAuthStore((s) => s.staff)
  const currentDepotId = useDepotStore((s) => s.currentDepotId)
  const isAdmin = staff?.role === 'admin'
  const posDepotId = staff?.role === 'cashier' ? staff.depot_id : currentDepotId

  return (
    <header
      data-testid="pos-context-bar"
      role="banner"
      aria-label="Contexte caisse"
      className="flex-shrink-0 border-b border-border bg-gradient-to-b from-surface via-surface to-background shadow-[0_1px_0_rgba(16,24,40,0.04)]"
    >
      <div className="flex items-center gap-3 px-3 sm:px-5 min-h-[4.5rem] py-2.5">
        {/* Where this register lives */}
        <div
          className={cn(
            'flex items-center gap-3 flex-shrink-0 pr-3 sm:pr-4',
            'border-r border-border',
          )}
        >
          <div className="relative flex-shrink-0">
            <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center shadow-sm">
              <ShoppingCart className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-background" aria-hidden="true" />
          </div>
          <div className="min-w-0 max-w-[8rem] sm:max-w-[11rem] lg:max-w-[13rem]">
            <span className="hidden sm:inline-flex items-center rounded-md bg-primary-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Caisse
            </span>
            <PosDepotSwitcher />
          </div>
        </div>

        {/* Workspace — floating segment rail */}
        <nav
          aria-label="Navigation caisse"
          data-testid="pos-nav-tabs"
          className="flex flex-1 min-w-0 justify-center"
        >
          <PosNavRail items={POS_NAV_ITEMS} />
        </nav>

        {/* Session — shift + account */}
        <div
          className={cn(
            'flex items-center gap-2 flex-shrink-0 pl-2 sm:pl-3 border-l border-border',
            'rounded-xl sm:bg-surface-muted/50 sm:px-2 sm:py-1 sm:border sm:border-border/60',
          )}
        >
          <div className="flex flex-col items-end max-w-[10rem] min-w-0 leading-tight">
            <span className="hidden lg:block text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Service
            </span>
            <div className="mt-0 lg:mt-0.5 w-full flex justify-end">
              <ShiftChip posDepotId={posDepotId} />
            </div>
          </div>

          {isAdmin && (
            <Link
              to="/dashboard"
              className={cn(
                'hidden sm:inline-flex items-center gap-1.5 h-11 px-3 rounded-xl',
                'border border-border bg-surface text-sm font-semibold text-text-secondary',
                'hover:text-primary hover:border-primary/30 hover:bg-surface-muted',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              )}
              aria-label={NAV.overview.fr}
            >
              <LayoutDashboard className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline">{NAV.overview.fr}</span>
            </Link>
          )}

          <PosUserMenu />
        </div>
      </div>
    </header>
  )
}
