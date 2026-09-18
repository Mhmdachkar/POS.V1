import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, User, LogOut, Building2, Menu } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { supabase } from '@/lib/supabase'

export interface TopBarProps {
  /** Opens the mobile AppRail drawer (shown only below md). */
  onOpenMobileNav?: () => void
}

// ─────────────────────────────────────────────────────────────────
// Depot selector (admin: switchable; cashier/staff: display only)
// ─────────────────────────────────────────────────────────────────

function DepotContext() {
  const staff = useAuthStore((s) => s.staff)
  const { currentDepotName, availableDepots, setCurrentDepot } = useDepotStore()
  const isAdmin = staff?.role === 'admin'

  const displayName = currentDepotName ?? 'All Depots'

  if (!isAdmin || availableDepots.length === 0) {
    // Non-admin: just show the assigned depot name
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <Building2 className="h-4 w-4 text-text-muted flex-shrink-0" />
        <span>{displayName}</span>
      </div>
    )
  }

  // Admin: dropdown to switch depot context
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 text-sm font-medium text-text-primary rounded-md',
            'px-2.5 py-1.5 border border-border bg-surface hover:bg-surface-muted',
            'transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
          )}
        >
          <Building2 className="h-4 w-4 text-text-muted flex-shrink-0" />
          <span className="max-w-[160px] truncate">{displayName}</span>
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
          {/* All Depots option */}
          <DropdownMenu.Item
            className="flex items-center px-2.5 py-2 text-sm rounded-md cursor-pointer text-text-primary hover:bg-surface-muted focus:outline-none focus:bg-surface-muted"
            onSelect={() => setCurrentDepot(null, 'All Depots')}
          >
            All Depots
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          {availableDepots.map((depot) => (
            <DropdownMenu.Item
              key={depot.id}
              className={cn(
                'flex items-center justify-between px-2.5 py-2 text-sm rounded-md cursor-pointer',
                'text-text-primary hover:bg-surface-muted focus:outline-none focus:bg-surface-muted',
                !depot.is_active && 'opacity-50',
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

// ─────────────────────────────────────────────────────────────────
// User menu
// ─────────────────────────────────────────────────────────────────

function UserMenu() {
  const staff = useAuthStore((s) => s.staff)
  const clear = useAuthStore((s) => s.clear)

  async function handleSignOut() {
    await supabase.auth.signOut()
    clear()
  }

  const roleLabel: Record<string, string> = {
    admin: 'Admin',
    cashier: 'Cashier',
    depot_staff: 'Depot Staff',
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 rounded-md px-2.5 py-1.5',
            'hover:bg-surface-muted transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
          )}
          aria-label="Menu utilisateur"
        >
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-xs font-semibold text-text-primary leading-none">
              {staff?.full_name ?? '—'}
            </p>
            <p className="text-xs text-text-muted leading-none mt-0.5">
              {roleLabel[staff?.role ?? ''] ?? staff?.role}
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
          {/* Profile info */}
          <div className="px-3 py-2.5 border-b border-border mb-1">
            <p className="text-sm font-semibold text-text-primary">{staff?.full_name}</p>
            <p className="text-xs text-text-muted">@{staff?.username}</p>
          </div>

          <DropdownMenu.Item
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 text-sm rounded-md cursor-pointer',
              'text-danger hover:bg-danger-bg focus:outline-none focus:bg-danger-bg',
            )}
            onSelect={handleSignOut}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ─────────────────────────────────────────────────────────────────
// TopBar
// ─────────────────────────────────────────────────────────────────

export function TopBar({ onOpenMobileNav }: TopBarProps) {
  return (
    <header
      className="h-14 bg-surface border-b border-border flex items-center px-4 gap-3 sm:gap-4 flex-shrink-0 z-20"
      role="banner"
    >
      {onOpenMobileNav && (
        <button
          type="button"
          className={cn(
            'md:hidden flex items-center justify-center h-9 w-9 rounded-md flex-shrink-0',
            'text-text-primary hover:bg-surface-muted transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
          )}
          onClick={onOpenMobileNav}
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      <DepotContext />

      <div className="flex-1 min-w-0" />

      <UserMenu />
    </header>
  )
}
