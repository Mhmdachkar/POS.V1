import { ClipboardList, Package, Receipt } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, PageHeader, Skeleton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { COMMON } from '@/lib/bilingual/common'
import { DEPOT } from '@/lib/bilingual/depot'
import { FULFILLMENT } from '@/lib/bilingual/status'
import { NAV } from '@/lib/bilingual/nav'
import {
  BiEmptyDescription,
  BiEmptyTitle,
  BiPageDescription,
  BiPageTitle,
  BiButtonInline,
} from '@/lib/bilingual/ui'
import { useDepotOverview } from '@/hooks/useDepotOverview'
import { useDepotStore } from '@/stores/depotStore'
import { SaleDetailDrawer } from '@/pages/sales/components/SaleDetailDrawer'
import { useState } from 'react'
import { bi, type BilingualPair } from '@/lib/bilingual/types'

function MetricCard({
  label,
  value,
  tone,
}: {
  label: BilingualPair
  value: number
  tone?: 'warn' | 'danger'
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <BilingualText
        {...label}
        variant="caption"
        frClassName="text-xs font-semibold uppercase tracking-wide text-text-muted"
      />
      <p
        className={
          tone === 'danger'
            ? 'text-2xl font-bold text-danger-foreground mt-1'
            : tone === 'warn'
              ? 'text-2xl font-bold text-warning-foreground mt-1'
              : 'text-2xl font-bold text-text-primary mt-1'
        }
      >
        {value}
      </p>
    </div>
  )
}

export function DepotOverviewPage() {
  const depotName = useDepotStore((s) => s.currentDepotName)
  const { data, isLoading, isError } = useDepotOverview()
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title={<BiPageTitle {...DEPOT.overviewTitle} />}
        description={
          depotName ? (
            <BiPageDescription {...DEPOT.overviewDesc(depotName)} />
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-6 space-y-6">
        {isLoading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title={<BiEmptyTitle {...DEPOT.failedOverview} />}
            description={<BiEmptyDescription {...COMMON.checkConnection} />}
          />
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard label={DEPOT.pendingRelease} value={data.metrics.pendingRelease} tone="warn" />
              <MetricCard label={DEPOT.releasedToday} value={data.metrics.releasedToday} />
              <MetricCard label={DEPOT.lowStockSkus} value={data.metrics.lowStock} tone="warn" />
              <MetricCard label={DEPOT.outOfStockSkus} value={data.metrics.outOfStock} tone="danger" />
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/sales"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-primary hover:bg-surface-muted"
              >
                <Receipt className="h-4 w-4" />
                <BiButtonInline {...FULFILLMENT.salesOrders} />
              </Link>
              <Link
                to="/inventory"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-primary hover:bg-surface-muted"
              >
                <Package className="h-4 w-4" />
                <BiButtonInline {...NAV.inventory} />
              </Link>
            </div>

            <section>
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-2">
                <BilingualText {...FULFILLMENT.pendingOrders} variant="body" layout="inline" />
              </h2>
              {data.pendingSaleIds.length === 0 ? (
                <BilingualText {...DEPOT.noPendingRelease} variant="caption" />
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                  {data.pendingSaleIds.map((id) => (
                    <li key={id}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-3 text-sm font-medium text-primary hover:bg-surface-muted"
                        onClick={() => setSelectedSaleId(id)}
                      >
                        <BilingualText
                          {...bi(`${DEPOT.openSalePrefix.fr} ${id.slice(0, 8)}…`, `${DEPOT.openSalePrefix.en} ${id.slice(0, 8)}…`)}
                          variant="body"
                          layout="inline"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      <SaleDetailDrawer
        saleId={selectedSaleId}
        onClose={() => setSelectedSaleId(null)}
      />
    </div>
  )
}
