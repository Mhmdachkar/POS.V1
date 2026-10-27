import { useNavigate } from 'react-router-dom'
import { REPORT_GROUPS, type ReportId } from '../reportCatalog'
import { t } from '@/lib/bilingual/types'
import { cn } from '@/lib/cn'
import { BiTabLabel } from '@/lib/bilingual/ui'

export function ReportSubNav({
  active,
  onChange,
}: {
  active: ReportId
  onChange: (id: ReportId) => void
}) {
  const items = REPORT_GROUPS.flatMap((group) => group.items)

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = items.findIndex((item) => item.id === active)
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const next = items[(index + delta + items.length) % items.length]
    if (next) onChange(next.id)
  }

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      className="scrollbar-thin hidden min-h-0 flex-1 overflow-y-auto px-3 pb-4 lg:block"
      onKeyDown={handleKeyDown}
    >
      {REPORT_GROUPS.map((group) => (
        <div key={group.title.fr} className="mb-4">
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {t(group.title)}
          </p>
          {group.items.map((item) => {
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onChange(item.id)}
                className={cn(
                  'mb-0.5 flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm font-medium',
                  isActive
                    ? 'bg-primary-subtle text-primary shadow-sm ring-1 ring-primary/20'
                    : 'text-text-secondary hover:bg-background hover:text-text-primary',
                )}
              >
                <BiTabLabel {...item.title} />
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function ReportNavSelect({
  active,
  onChange,
}: {
  active: ReportId
  onChange: (id: ReportId) => void
}) {
  const navigate = useNavigate()
  return (
    <label className="block lg:hidden">
      <span className="sr-only">{t(REPORT_GROUPS[0].title)}</span>
      <select
        className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
        value={active}
        onChange={(event) => {
          const id = event.target.value as ReportId
          onChange(id)
          const item = REPORT_GROUPS.flatMap((g) => g.items).find((row) => row.id === id)
          if (item) navigate(`${item.path}${window.location.search}`)
        }}
      >
        {REPORT_GROUPS.map((group) => (
          <optgroup key={group.title.fr} label={t(group.title)}>
            {group.items.map((item) => (
              <option key={item.id} value={item.id}>{t(item.title)}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
