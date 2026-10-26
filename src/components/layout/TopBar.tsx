import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, User, LogOut, Building2, Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { ADMIN } from '@/lib/bilingual/admin'
import { AUTH_NAV, NAV } from '@/lib/bilingual/nav'
import { COMMON } from '@/lib/bilingual/common'
import { bilingualPlain, t } from '@/lib/bilingual/types'
import { ShiftChip } from '@/components/pos/ShiftChip'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { useLocaleStore } from '@/stores/localeStore'
import { supabase } from '@/lib/supabase'
import { AppLogo } from './AppLogo'
import { LanguageSwitch } from './LanguageSwitch'

export interface TopBarProps {
  /** Opens the mobile AppRail drawer (shown only below md). */
  onOpenMobileNav?: () => void
}

function roleLabel(role: string | undefined): string {
  if (role === 'admin') return t(ADMIN.roleAdmin)
  if (role === 'cashier') return t(ADMIN.roleCashier)
  if (role === 'depot_staff') return t(ADMIN.roleDepotStaff)
  return role ?? ''
}

function DepotContext({ posMode }: { posMode: boolean }) {
  useLocaleStore((s) => s.locale)
  const staff = useAuthStore((s) => s.staff)
  const { currentDepotId, currentDepotName, availableDepots, setCurrentDepot } = useDepotStore()
  const isAdmin = staff?.role === 'admin'
  const firstActive = availableDepots.find((d) => d.is_active !== false)
  const displayName =
    currentDepotName ??
    (posMode ? (firstActive?.name ?? bilingualPlain(COMMON.depot)) : bilingualPlain(COMMON.allDepots))

  if (!isAdmin || availableDepots.length === 0) {
    return (
      <div
        className="flex items-center gap-2 text-sm font-medium text-text-primary min-w-0"
        data-testid={posMode ? 'pos-depot-label' : undefined}
      >
        <Building2 className="h-4 w-4 text-text-muted flex-shrink-0" />
        <span className="truncate max-w-[7rem] sm:max-w-[14rem]">{displayName}</span>
      </div>
    )
  }

  const switchable = posMode
    ? availableDepots.filter((d) => d.is_active !== false)
    : availableDepots

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-testid={posMode ? 'pos-depot-label' : undefined}
          aria-label={t(COMMON.chooseDepot)}
          className={cn(
            'flex items-center gap-2 text-sm font-medium text-text-primary rounded-md',
            'px-2.5 py-1.5 border border-border bg-surface hover:bg-surface-muted',
            'transition-colors duration-150',
          )}
        >
          <Building2 className="h-4 w-4 text-text-muted flex-shrink-0" />
          <span className="max-w-[6.5rem] sm:max-w-[160px] truncate">{displayName}</span>
          <ChevronDown className="h-3.5 w-3.5 text-text-muted flex-shrink-0" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            'z-50 min-w-[180px] bg-surface rounded-lg border border-border shadow-md p-1',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2',
          )}
          align="start"
          sideOffset={6}
        >
          {!posMode && (
            <>
              <DropdownMenu.Item
                className="flex items-center px-2.5 py-2 text-sm rounded-md cursor-pointer text-text-primary hover:bg-surface-muted focus:outline-none focus:bg-surface-muted"
                onSelect={() => setCurrentDepot(null, bilingualPlain(COMMON.allDepots))}
              >
                {bilingualPlain(COMMON.allDepots)}
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
            </>
          )}

          {switchable.map((depot) => (
            <DropdownMenu.Item
              key={depot.id}
              className={cn(
                'flex items-center justify-between px-2.5 py-2 text-sm rounded-md cursor-pointer',
                'text-text-primary hover:bg-surface-muted focus:outline-none focus:bg-surface-muted',
                !depot.is_active && 'opacity-50',
                posMode && currentDepotId === depot.id && 'bg-primary-subtle text-primary font-semibold',
              )}
              onSelect={() => setCurrentDepot(depot.id, depot.name)}
              disabled={!depot.is_active}
            >
              <span>{depot.name}</span>
              <span className="text-xs text-text-muted ml-3">{depot.code}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function UserMenu() {
  useLocaleStore((s) => s.locale)
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
            'flex items-center gap-2 rounded-md px-2 py-1.5 sm:px-2.5',
            'hover:bg-surface-muted transition-colors duration-150',
          )}
          aria-label={t(COMMON.userMenu)}
        >
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="text-left hidden sm:block min-w-0">
            <p className="text-xs font-semibold text-text-primary leading-none truncate max-w-[9rem]">
              {staff?.full_name ?? '—'}
            </p>
            <p className="text-xs text-text-muted leading-none mt-0.5">
              {roleLabel(staff?.role)}
            </p>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-text-muted flex-shrink-0 hidden sm:block" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            'z-50 min-w-[200px] bg-surface rounded-lg border border-border shadow-md p-1',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2',
          )}
          align="end"
          sideOffset={6}
        >
          <div className="px-3 py-2.5 border-b border-border mb-1">
            <p className="text-sm font-semibold text-text-primary">{staff?.full_name}</p>
            <p className="text-xs text-text-muted">@{staff?.username}</p>
          </div>

          <DropdownMenu.Item
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 text-sm rounded-md cursor-pointer',
              'text-danger-foreground hover:bg-danger-bg focus:outline-none focus:bg-danger-bg',
            )}
            onSelect={handleSignOut}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {bilingualPlain(AUTH_NAV.signOut)}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function TopBar({ onOpenMobileNav }: TopBarProps) {
  useLocaleStore((s) => s.locale)
  const { pathname } = useLocation()
  const posMode = pathname === '/pos'
  const staff = useAuthStore((s) => s.staff)
  const currentDepotId = useDepotStore((s) => s.currentDepotId)
  const posDepotId = staff?.role === 'cashier' ? staff.depot_id : currentDepotId

  return (
    <header
      className="h-14 bg-surface border-b border-border flex items-center px-2.5 sm:px-4 gap-2 sm:gap-3 flex-shrink-0 z-20"
      role="banner"
    >
      {onOpenMobileNav && (
        <button
          type="button"
          data-testid="app-nav-menu"
          className={cn(
            'md:hidden flex items-center justify-center h-9 w-9 rounded-md flex-shrink-0',
            'text-text-primary hover:bg-surface-muted transition-colors duration-150',
          )}
          onClick={onOpenMobileNav}
          aria-label={t(COMMON.openMenu)}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      <AppLogo compact className="sm:hidden flex-shrink-0" />
      <AppLogo className="hidden sm:flex flex-shrink-0" />

      <DepotContext posMode={posMode} />

      <div className="flex-1 min-w-0" />

      <LanguageSwitch compact />

      <div
        className="flex items-center gap-1.5 flex-shrink-0"
        data-testid="topbar-shift"
      >
        <span className="hidden sm:inline text-[11px] font-medium text-text-muted">
          {t(NAV.shift)}
        </span>
        <ShiftChip posDepotId={posDepotId} />
      </div>

      <UserMenu />
    </header>
  )
}
