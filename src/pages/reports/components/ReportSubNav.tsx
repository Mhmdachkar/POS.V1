import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { REPORTS } from '@/lib/bilingual/reports'
import { bilingualPlain, t } from '@/lib/bilingual/types'
import { cn } from '@/lib/cn'
import { REPORT_GROUPS, type ReportDef } from '../reportCatalog'

function useNarrow() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => setNarrow(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return narrow
}

export function ReportSwitcher({ report }: { report: ReportDef }) {
  const navigate = useNavigate()
  const location = useLocation()
  const narrow = useNarrow()
  const group = REPORT_GROUPS.find((g) => g.items.some((item) => item.id === report.id)) ?? REPORT_GROUPS[0]

  function go(path: string) {
    navigate(`${path}${location.search}`)
  }

  if (narrow) {
    return (
      <label className="mb-3 block text-sm text-text-secondary">
        <span className="sr-only">{t(REPORTS.reportPicker)}</span>
        <select
          aria-label={`${t(REPORTS.reportPicker)} : ${t(report.title)}`}
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-primary"
          value={report.path}
          onChange={(e) => go(e.target.value)}
        >
          {REPORT_GROUPS.map((g) => (
            <optgroup key={g.title.fr} label={bilingualPlain(g.title)}>
              {g.items.map((item) => (
                <option key={item.id} value={item.path}>
                  {`${t(REPORTS.reportPicker)} : ${bilingualPlain(item.title)}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label={t(REPORTS.pageTitle)}>
        {REPORT_GROUPS.map((g) => {
          const active = g.title.fr === group.title.fr
          return (
            <button
              key={g.title.fr}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => go(g.items[0].path)}
              className={cn(
                'min-h-[40px] rounded-lg px-3 text-sm font-medium',
                active ? 'bg-surface-muted text-text-primary' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {bilingualPlain(g.title)}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label={bilingualPlain(group.title)}>
        {group.items.map((item) => {
          const active = item.id === report.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => go(item.path)}
              className={cn(
                'min-h-[36px] rounded-full px-3 text-sm',
                active ? 'bg-text-primary text-surface' : 'bg-surface-muted text-text-secondary hover:text-text-primary',
              )}
            >
              {bilingualPlain(item.title)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
