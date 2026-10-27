import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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

function useSlidingIndicator(activeKey: string, deps: unknown[] = []) {
  const railRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false })

  const registerTab = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) tabRefs.current.set(key, el)
    else tabRefs.current.delete(key)
  }, [])

  const measure = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const el = tabRefs.current.get(activeKey)
    if (!el) return
    const railRect = rail.getBoundingClientRect()
    const tabRect = el.getBoundingClientRect()
    setIndicator({
      left: tabRect.left - railRect.left + rail.scrollLeft,
      width: tabRect.width,
      ready: true,
    })
  }, [activeKey])

  useLayoutEffect(() => {
    measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps])

  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const ro = new ResizeObserver(measure)
    ro.observe(rail)
    rail.addEventListener('scroll', measure, { passive: true })
    return () => {
      ro.disconnect()
      rail.removeEventListener('scroll', measure)
    }
  }, [measure])

  useEffect(() => {
    const el = tabRefs.current.get(activeKey)
    if (!el || typeof el.scrollIntoView !== 'function') return
    try {
      el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
    } catch {
      /* jsdom / reduced motion */
    }
  }, [activeKey])

  return { railRef, registerTab, indicator }
}

export function ReportSwitcher({ report }: { report: ReportDef }) {
  const navigate = useNavigate()
  const location = useLocation()
  const narrow = useNarrow()
  const group = REPORT_GROUPS.find((g) => g.items.some((item) => item.id === report.id)) ?? REPORT_GROUPS[0]
  const groupKey = group.title.fr
  const groupSlide = useSlidingIndicator(groupKey, [REPORT_GROUPS.length])
  const reportSlide = useSlidingIndicator(report.id, [group.items.length, groupKey])

  function go(path: string) {
    navigate(`${path}${location.search}`)
  }

  if (narrow) {
    return (
      <label className="mb-3 block text-sm text-text-secondary">
        <span className="mb-1.5 block text-xs font-medium text-text-muted">{t(REPORTS.reportPicker)}</span>
        <select
          aria-label={`${t(REPORTS.reportPicker)} : ${t(report.title)}`}
          className={cn(
            'h-11 w-full rounded-xl border bg-surface px-3 text-sm font-medium text-text-primary',
            'border-primary/30 shadow-sm ring-1 ring-primary/10',
            'transition-[border-color,box-shadow] duration-200',
            'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25',
          )}
          value={report.path}
          onChange={(e) => go(e.target.value)}
        >
          {REPORT_GROUPS.map((g) => (
            <optgroup key={g.title.fr} label={bilingualPlain(g.title)}>
              {g.items.map((item) => (
                <option key={item.id} value={item.path}>
                  {`${bilingualPlain(g.title)} · ${bilingualPlain(item.title)}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="mb-4 space-y-2.5">
      <div
        ref={groupSlide.railRef}
        className={cn(
          'relative flex flex-nowrap gap-1 overflow-x-auto scrollbar-thin',
          'rounded-xl bg-surface-muted/90 p-1 ring-1 ring-border/60',
        )}
        role="tablist"
        aria-label={t(REPORTS.pageTitle)}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1 bottom-1 rounded-lg bg-surface shadow-sm ring-1 ring-primary/20',
            'transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            groupSlide.indicator.ready ? 'opacity-100' : 'opacity-0',
          )}
          style={{
            width: groupSlide.indicator.width,
            transform: `translateX(${groupSlide.indicator.left}px)`,
          }}
        />
        {REPORT_GROUPS.map((g) => {
          const active = g.title.fr === group.title.fr
          return (
            <button
              key={g.title.fr}
              type="button"
              role="tab"
              aria-selected={active}
              ref={(el) => groupSlide.registerTab(g.title.fr, el)}
              onClick={() => {
                if (!active) go(g.items[0].path)
              }}
              className={cn(
                'relative z-[1] min-h-[40px] rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap',
                'transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                active
                  ? 'text-primary'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {bilingualPlain(g.title)}
            </button>
          )
        })}
      </div>

      <div
        key={groupKey}
        ref={reportSlide.railRef}
        className={cn(
          'relative flex flex-nowrap gap-1 overflow-x-auto scrollbar-thin',
          'rounded-xl bg-primary-subtle/40 p-1 ring-1 ring-primary/10',
          'animate-[app-route-enter_220ms_ease-out]',
        )}
        role="tablist"
        aria-label={bilingualPlain(group.title)}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1 bottom-1 rounded-full bg-primary shadow-sm',
            'transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            reportSlide.indicator.ready ? 'opacity-100' : 'opacity-0',
          )}
          style={{
            width: reportSlide.indicator.width,
            transform: `translateX(${reportSlide.indicator.left}px)`,
          }}
        />
        {group.items.map((item) => {
          const active = item.id === report.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              ref={(el) => reportSlide.registerTab(item.id, el)}
              onClick={() => go(item.path)}
              className={cn(
                'relative z-[1] min-h-[36px] rounded-full px-3.5 text-sm font-medium whitespace-nowrap',
                'transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                active
                  ? 'text-primary-foreground'
                  : 'text-text-secondary hover:text-text-primary',
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
