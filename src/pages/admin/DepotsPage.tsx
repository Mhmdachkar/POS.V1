import { useState } from 'react'
import { BiButtonStack, BiEmptyTitle, BiPageTitle } from '@/lib/bilingual/ui'
import { ADMIN } from '@/lib/bilingual/admin'
import { DEPOT } from '@/lib/bilingual/depot'
import { t, bilingualPlain } from '@/lib/bilingual/types'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { SALES } from '@/lib/bilingual/sales'
import { Building2, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ActiveBadge, Button, EmptyState, PageHeader, PaginationBar, SearchInput, Skeleton } from '@/components/ui'
import { NavPictogram } from '@/components/layout/NavPictogram'
import { useAdminDepotList } from '@/hooks/useAdminDepots'
import { DepotDetailDrawer } from './components/DepotDetailDrawer'
import { DepotFormModal } from './components/DepotFormModal'

/** Name | Location | Code | Status */
const DEPOTS_GRID =
  'grid-cols-[minmax(8rem,1.2fr)_minmax(8rem,1fr)_4.5rem_6.5rem]'

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
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <PageHeader
          title={<BiPageTitle {...ADMIN.depots} />}
          description={totalCount > 0 ? `${totalCount} dépôt${totalCount !== 1 ? 's' : ''}` : t(ADMIN.depotsDesc)}
          icon={<NavPictogram path="/admin/depots" size="header" />}
          className="border-b-0"
          actions={
            <div className="flex items-center gap-2">
              <div className="w-52">
                <SearchInput
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                  placeholder={bilingualPlain(DEPOT.searchDepots)}
                />
              </div>
              <Button className="gap-1.5" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                <BiButtonStack {...ADMIN.addDepot} />
              </Button>
            </div>
          }
        />
        <div className="px-3 sm:px-6 pb-3 sm:pb-4 flex gap-1.5">
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

      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
        {isLoading ? (
          <div className="space-y-px">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : isError ? (
          <div className="p-8"><EmptyState icon={<Building2 className="h-8 w-8" />} title={<BiEmptyTitle {...ADMIN.failedDepots} />} /></div>
        ) : rows.length === 0 ? (
          <div className="p-8"><EmptyState icon={<Building2 className="h-8 w-8" />} title={<BiEmptyTitle {...ADMIN.noDepots} />} /></div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface-muted border-b border-border z-[1]">
              <div className={cn('grid gap-4 px-4 py-2 items-center', DEPOTS_GRID)}>
                <span className="text-xs font-semibold text-text-secondary uppercase">Name</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Location</span>
                <span className="text-xs font-semibold text-text-secondary uppercase">Code</span>
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
                  DEPOTS_GRID,
                )}
              >
                <span className="text-sm font-medium text-text-primary truncate min-w-0">{row.name}</span>
                <span className="text-sm text-text-secondary truncate min-w-0">{row.location}</span>
                <span className="text-sm font-mono text-text-secondary">{row.code}</span>
                <span className="min-w-0">
                  <ActiveBadge isActive={row.is_active} />
                </span>
              </button>
            ))}
            <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      <DepotDetailDrawer depotId={selectedId} onClose={() => setSelectedId(null)} />
      <DepotFormModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
