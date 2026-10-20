import { useState } from 'react'
import { BiButtonStack, BiEmptyTitle, BiPageTitle } from '@/lib/bilingual/ui'
import { t, bilingualPlain } from '@/lib/bilingual/types'
import { ADMIN } from '@/lib/bilingual/admin'
import { COMMON } from '@/lib/bilingual/common'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { SALES } from '@/lib/bilingual/sales'
import { Plus, Search, UserCog } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ActiveBadge, Button, EmptyState, PageHeader, Skeleton } from '@/components/ui'
import { roleLabel, useStaffList, type StaffRoleFilter, type StaffStatusFilter } from '@/hooks/useStaff'
import { useDepotOptions } from '@/hooks/useInventory'
import { StaffDetailDrawer } from './components/StaffDetailDrawer'
import { StaffFormModal } from './components/StaffFormModal'

function statusFilters(): Array<{ value: StaffStatusFilter; label: string }> {
  return [
    { value: 'all', label: t(COMMON.all) },
    { value: 'active', label: t(COMMON.active) },
    { value: 'inactive', label: t(COMMON.inactive) },
  ]
}

function roleFilters(): Array<{ value: StaffRoleFilter; label: string }> {
  return [
    { value: 'all', label: t(ADMIN.filterAllRoles) },
    { value: 'admin', label: 'Admin' },
    { value: 'cashier', label: 'Cashier' },
    { value: 'depot_staff', label: t(ADMIN.roleDepotStaff) },
  ]
}

/** Name | Username | Role | Depot | Status */
const STAFF_GRID =
  'grid-cols-[minmax(8rem,1.4fr)_minmax(6rem,1fr)_7.5rem_minmax(6rem,1fr)_6.5rem]'

function TableSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={cn('grid gap-4 px-4 py-3 border-b border-border items-center', STAFF_GRID)}
        >
          <Skeleton className="h-4 w-full max-w-[10rem]" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-5 w-full max-w-[4.5rem] rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function StaffPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StaffStatusFilter>('all')
  const [role, setRole] = useState<StaffRoleFilter>('all')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const pageSize = 30
  const { data, isLoading, isError } = useStaffList({ page, pageSize, search, status, role })
  const { data: depots } = useDepotOptions()

  const rows = data?.data ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  const depotName = (id: string | null) =>
    id ? depots?.find((d) => d.id === id)?.name ?? '—' : '—'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...ADMIN.staff} />}
          description={totalCount > 0 ? t(ADMIN.staffCount(totalCount)) : t(ADMIN.manageStaff)}
          icon={<UserCog className="h-5 w-5" />}
          className="border-b-0"
          actions={
            <div className="flex items-center gap-2">
              <div className="relative w-52">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                  placeholder={bilingualPlain(ADMIN.searchStaff)}
                  className="w-full h-9 pl-9 pr-3 rounded-md border border-border bg-surface text-sm"
                />
              </div>
              <Button className="gap-1.5" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                <BiButtonStack {...ADMIN.addStaff} />
              </Button>
            </div>
          }
        />
        <div className="px-3 sm:px-6 pb-3 sm:pb-4 flex flex-wrap gap-1.5">
          {statusFilters().map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setStatus(opt.value); setPage(0) }}
              className={cn(
                'px-3 h-7 rounded-full text-xs font-medium',
                status === opt.value ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-text-secondary border border-border',
              )}
            >
              {opt.label}
            </button>
          ))}
          {roleFilters().map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setRole(opt.value); setPage(0) }}
              className={cn(
                'px-3 h-7 rounded-full text-xs font-medium',
                role === opt.value ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-text-secondary border border-border',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-8">
            <EmptyState icon={<UserCog className="h-8 w-8" />} title={<BiEmptyTitle {...ADMIN.failedStaff} />} description={t(COMMON.checkConnection)} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState icon={<UserCog className="h-8 w-8" />} title={<BiEmptyTitle {...ADMIN.noStaff} />} description={t(ADMIN.noStaffHint)} />
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border z-[1]">
              <div className={cn('grid gap-4 px-4 py-2 items-center', STAFF_GRID)}>
                <span className="text-xs font-semibold text-text-secondary uppercase">Name</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Username</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Role</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Depot</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Status</span>
              </div>
            </div>
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={cn(
                  'w-full text-left grid gap-4 px-4 py-3 items-center border-b border-border hover:bg-surface-muted',
                  STAFF_GRID,
                  selectedId === row.id && 'bg-primary-subtle',
                )}
              >
                <span className="text-sm font-medium text-text-primary truncate min-w-0">{row.full_name}</span>
                <span className="text-sm text-text-secondary truncate min-w-0">{row.username}</span>
                <span className="text-sm text-text-secondary truncate min-w-0">{roleLabel(row.role)}</span>
                <span className="text-sm text-text-secondary truncate min-w-0">{row.role === 'admin' ? '—' : depotName(row.depot_id)}</span>
                <span className="min-w-0">
                  <ActiveBadge isActive={row.is_active} />
                </span>
              </button>
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-sm text-text-secondary">Page {page + 1} of {totalPages}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-3 h-8 text-sm rounded-md border border-border disabled:opacity-50">Previous</button>
                  <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="px-3 h-8 text-sm rounded-md border border-border disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <StaffDetailDrawer staffId={selectedId} onClose={() => setSelectedId(null)} />
      <StaffFormModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
