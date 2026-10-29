import { useMemo, useState } from 'react'
import { BiEmptyTitle, BiModalTitle, BiPageTitle, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { COMMON } from '@/lib/bilingual/common'
import { ADMIN } from '@/lib/bilingual/admin'
import { t, bilingualPlain } from '@/lib/bilingual/types'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { SALES } from '@/lib/bilingual/sales'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { ClipboardList } from 'lucide-react'
import { NavPictogram } from '@/components/layout/NavPictogram'
import { cn } from '@/lib/cn'
import { EmptyState, PageHeader, Skeleton } from '@/components/ui'
import { formatDateTime } from '@/lib/formatters'
import { downloadCsv } from '@/lib/csvExport'
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  useAuditLog,
} from '@/hooks/useAuditLog'
import {
  auditActionCategory,
  auditActionLabel,
  auditActionOptionLabel,
  auditActorLine,
  auditDepotLine,
  auditEntityOptionLabel,
  auditEventSummary,
} from '@/lib/auditPresentation'
import { BilingualText } from '@/components/ui/BilingualText'
import { useStaffList } from '@/hooks/useStaff'
import {
  resolveReportDateRange,
  type ReportPreset,
} from '@/lib/reportDates'
import { REPORTS } from '@/lib/bilingual/reports'
import { useDepotStore } from '@/stores/depotStore'
import { useDepotOptions } from '@/hooks/useInventory'
import { AuditDetailDrawer } from './components/AuditDetailDrawer'
import type { AuditLogRow } from '@/hooks/useAuditLog'

const PRESETS: ReportPreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'custom']

export function AuditPage() {
  const [preset, setPreset] = useState<ReportPreset>('this_week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [action, setAction] = useState<string>('')
  const [entityType, setEntityType] = useState<string>('')
  const [actorId, setActorId] = useState<string>('')
  const [entityId, setEntityId] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AuditLogRow | null>(null)

  const depotId = useDepotStore((s) => s.currentDepotId)
  const depotName = useDepotStore((s) => s.currentDepotName)
  const { data: depots } = useDepotOptions()
  const { data: staffList } = useStaffList({
    page: 0,
    pageSize: 200,
    search: '',
    status: 'active',
    role: 'all',
  })

  const range = useMemo(
    () => resolveReportDateRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  )

  const pageSize = 50
  const filters = useMemo(
    () => ({
      depotId: depotId ?? null,
      action: action || null,
      entityType: entityType || null,
      actorId: actorId || null,
      entityIdSearch: entityId,
      startDate: range.startDate,
      endDate: range.endDate,
      page,
      pageSize,
    }),
    [depotId, action, entityType, actorId, entityId, range, page],
  )

  const { data, isLoading, isError } = useAuditLog(filters)
  const rows = data?.data ?? []
  const total = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function exportCsv() {
    downloadCsv(
      `audit-log-${range.startDate}_${range.endDate}.csv`,
      [t(ADMIN.auditHeaders.occurred), t(ADMIN.auditHeaders.actor), t(ADMIN.auditHeaders.action), t(ADMIN.auditHeaders.entityType), t(ADMIN.auditHeaders.entityId), t(ADMIN.auditHeaders.depotId)],
      rows.map((r) => [
        formatDateTime(r.occurred_at),
        r.actor_name ?? '',
        bilingualPlain(auditEventSummary(r)),
        r.entity_type,
        r.entity_id ?? '',
        r.depot_id ?? '',
      ]),
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-surface flex-shrink-0">
        <PageHeader
          title={<BiPageTitle {...ADMIN.auditLog} />}
          description={t(ADMIN.auditDesc)}
          icon={<NavPictogram path="/admin/audit" size="header" />}
          className="border-b-0"
        />
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setPreset(p); setPage(0) }}
                className={cn(
                  'px-3 min-h-[44px] rounded-md text-sm font-medium border',
                  preset === p
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface border-border text-text-secondary',
                )}
              >
                {t(p === 'today' ? REPORTS.presetToday : p === 'yesterday' ? REPORTS.presetYesterday : p === 'this_week' ? REPORTS.presetThisWeek : p === 'this_month' ? REPORTS.presetThisMonth : REPORTS.presetCustom)}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex flex-wrap gap-3">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 px-2 border rounded-md text-sm" />
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 px-2 border rounded-md text-sm" />
            </div>
          )}

          <p className="text-xs text-text-muted">
            {depotId
              ? `${depotName ?? 'Depot'} — events for this depot only`
              : t(ADMIN.allDepotsIncludesGlobal)}
          </p>

          <div className="flex flex-wrap gap-3">
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(0) }}
              className="h-9 px-2 rounded-md border border-border bg-surface text-sm"
            >
              <option value="">{t(ADMIN.allActions)}</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>{auditActionOptionLabel(a)}</option>
              ))}
            </select>
            <select
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); setPage(0) }}
              className="h-9 px-2 rounded-md border border-border bg-surface text-sm"
            >
              <option value="">{t(ADMIN.allEntityTypes)}</option>
              {AUDIT_ENTITY_TYPES.map((et) => (
                <option key={et} value={et}>{auditEntityOptionLabel(et)}</option>
              ))}
            </select>
            <select
              value={actorId}
              onChange={(e) => { setActorId(e.target.value); setPage(0) }}
              className="h-9 px-2 rounded-md border border-border bg-surface text-sm max-w-xs"
            >
              <option value="">{t(ADMIN.allActors)}</option>
              {(staffList?.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
            <input
              type="search"
              placeholder={bilingualPlain(ADMIN.searchEntityId)}
              value={entityId}
              onChange={(e) => { setEntityId(e.target.value); setPage(0) }}
              className="h-9 px-3 rounded-md border border-border bg-surface text-sm w-64"
            />
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="h-9 px-3 rounded-md border border-border text-sm hover:bg-surface-muted disabled:opacity-50"
            >
              {t(COMMON.exportCsv)}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
        {isLoading && (
          <div className="p-3 sm:p-6 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        )}
        {isError && (
          <EmptyState icon={<ClipboardList className="h-8 w-8" />} title={<BiEmptyTitle {...ADMIN.failedAudit} />} />
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <EmptyState icon={<ClipboardList className="h-8 w-8" />} title={<BiEmptyTitle {...ADMIN.noAudit} />} />
        )}
        {!isLoading && rows.length > 0 && (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const category = auditActionCategory(row.action)
              const borderClass =
                category === 'sale'
                  ? 'border-l-4 border-l-success'
                  : category === 'stock'
                  ? 'border-l-4 border-l-warning'
                  : category === 'destructive'
                  ? 'border-l-4 border-l-danger'
                  : 'border-l-4 border-l-border'
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className={cn(
                      'w-full text-left px-5 py-3 hover:bg-surface-muted transition-colors',
                      borderClass,
                    )}
                  >
                    <p className="text-sm font-medium text-text-primary leading-snug">
                      <BilingualText {...auditEventSummary(row)} variant="body" layout="inline" />
                    </p>
                    <p className="text-xs text-text-secondary mt-1">
                      {formatDateTime(row.occurred_at)}
                      {' · '}
                      {t(auditActorLine(row))}
                      {' · '}
                      {t(
                        auditDepotLine(
                          row.depot_id,
                          row.depot_id ? depots?.find((d) => d.id === row.depot_id)?.name ?? null : null,
                        ),
                      )}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-border flex items-center justify-between text-sm">
          <span className="text-text-muted">{total} events</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 border rounded-md disabled:opacity-40"
            >
              {t(COMMON.previous)}
            </button>
            <span className="tabular-nums px-2">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 border rounded-md disabled:opacity-40"
            >
              {t(COMMON.next)}
            </button>
          </div>
        </div>
      )}

      <AuditDetailDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
