import { useState } from 'react'
import { Building2, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ActiveBadge, Button, EmptyState, Skeleton } from '@/components/ui'
import { useAdminDepotList } from '@/hooks/useAdminDepots'
import { DepotDetailDrawer } from './components/DepotDetailDrawer'
import { DepotFormModal } from './components/DepotFormModal'

export function DepotsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const pageSize = 30
  const { data, isLoading, isError } = useAdminDepotList({ page, pageSize, search, status })
  const rows = data?.data ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-text-primary">Depots</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {totalCount > 0 ? `${totalCount} depot${totalCount !== 1 ? 's' : ''}` : 'Physical locations that own products'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                placeholder="Name, code, location…"
                className="w-full h-9 pl-9 pr-3 rounded-md border border-border bg-surface text-sm"
              />
            </div>
            <Button className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> New Depot
            </Button>
          </div>
        </div>
        <div className="flex gap-1.5 mt-3">
          {(['all', 'active', 'inactive'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => { setStatus(value); setPage(0) }}
              className={cn(
                'px-3 h-7 rounded-full text-xs font-medium capitalize',
                status === value ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-text-secondary border border-border',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-px">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : isError ? (
          <div className="p-8"><EmptyState icon={<Building2 className="h-8 w-8" />} title="Failed to load depots" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8"><EmptyState icon={<Building2 className="h-8 w-8" />} title="No depots found" /></div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border grid grid-cols-[1.2fr_1fr_auto_auto] gap-4 px-4 py-2">
              <span className="text-xs font-semibold text-text-secondary uppercase">Name</span>
              <span className="text-xs font-semibold text-text-secondary uppercase">Location</span>
              <span className="text-xs font-semibold text-text-secondary uppercase">Code</span>
              <span className="text-xs font-semibold text-text-secondary uppercase">Status</span>
            </div>
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className="w-full text-left grid grid-cols-[1.2fr_1fr_auto_auto] gap-4 px-4 py-3 border-b border-border hover:bg-surface-muted"
              >
                <span className="text-sm font-medium text-text-primary truncate">{row.name}</span>
                <span className="text-sm text-text-secondary truncate">{row.location}</span>
                <span className="text-sm font-mono text-text-secondary">{row.code}</span>
                <ActiveBadge isActive={row.is_active} />
              </button>
            ))}
            {totalPages > 1 && (
              <div className="flex justify-between px-4 py-3 text-sm">
                <span>Page {page + 1} of {totalPages}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 h-8 rounded-md border disabled:opacity-50">Previous</button>
                  <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="px-3 h-8 rounded-md border disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <DepotDetailDrawer depotId={selectedId} onClose={() => setSelectedId(null)} />
      <DepotFormModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
