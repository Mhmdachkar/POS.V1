import { useState } from 'react'
import { Plus, Search, UserCog } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ActiveBadge, Button, EmptyState, Skeleton } from '@/components/ui'
import { roleLabel, useStaffList, type StaffRoleFilter, type StaffStatusFilter } from '@/hooks/useStaff'
import { useDepotOptions } from '@/hooks/useInventory'
import { StaffDetailDrawer } from './components/StaffDetailDrawer'
import { StaffFormModal } from './components/StaffFormModal'

const STATUS_FILTERS: Array<{ value: StaffStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const ROLE_FILTERS: Array<{ value: StaffRoleFilter; label: string }> = [
  { value: 'all', label: 'All roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'depot_staff', label: 'Depot staff' },
]

function TableSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
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
      <div className="px-6 py-4 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-text-primary">Staff</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {totalCount > 0 ? `${totalCount} staff member${totalCount !== 1 ? 's' : ''}` : 'Manage staff accounts'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                placeholder="Name or username…"
                className="w-full h-9 pl-9 pr-3 rounded-md border border-border bg-surface text-sm"
              />
            </div>
            <Button className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New Staff
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {STATUS_FILTERS.map((opt) => (
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
          {ROLE_FILTERS.map((opt) => (
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

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-8">
            <EmptyState icon={<UserCog className="h-8 w-8" />} title="Failed to load staff" description="Check your connection and try again." />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState icon={<UserCog className="h-8 w-8" />} title="No staff found" description="Create a staff member to get started." />
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2">
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
                  'w-full text-left grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b border-border hover:bg-surface-muted',
                  selectedId === row.id && 'bg-primary-subtle',
                )}
              >
                <span className="text-sm font-medium text-text-primary truncate">{row.full_name}</span>
                <span className="text-sm text-text-secondary truncate">{row.username}</span>
                <span className="text-sm text-text-secondary">{roleLabel(row.role)}</span>
                <span className="text-sm text-text-secondary truncate">{row.role === 'admin' ? '—' : depotName(row.depot_id)}</span>
                <ActiveBadge isActive={row.is_active} />
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
