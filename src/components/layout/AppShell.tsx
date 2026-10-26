import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { useDepotContextSync } from '@/hooks/useDepotContextSync'
import { COMMON } from '@/lib/bilingual/common'
import { t } from '@/lib/bilingual/types'
import { useLocaleStore } from '@/stores/localeStore'
import { AppRail } from './AppRail'
import { TopBar } from './TopBar'

/**
 * AppShell — the persistent authenticated application frame for every authed route.
 *
 * Layout (≥ md):
 * ┌─────────┬────────────────────────────────┐
 * │         │  TopBar (logo, depot, shift)   │
 * │ AppRail ├────────────────────────────────┤
 * │         │  <page content via Outlet>     │
 * │         │                                │
 * └─────────┴────────────────────────────────┘
 *
 * Below md: AppRail leaves the layout flow; TopBar hamburger opens it
 * as an off-canvas drawer so /pos at 390px is not covered by the rail.
 *
 * On /pos the rail is icon-only; main is overflow-hidden (POS workspace).
 */
export function AppShell() {
  const locale = useLocaleStore((s) => s.locale)
  const [railExpanded, setRailExpanded] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const isPos = location.pathname === '/pos'
  const mainRef = useRef<HTMLElement>(null)

  useDepotContextSync()

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  // Prevent a tall POS workspace from leaving the next page (e.g. dashboard) with a huge scroll range.
  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main) return
    if (typeof main.scrollTo === 'function') {
      main.scrollTo({ top: 0, left: 0 })
    } else {
      main.scrollTop = 0
    }
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileNavOpen])

  return (
    <div className="flex h-full bg-background overflow-hidden">
      <div className="hidden md:flex h-full flex-shrink-0">
        <AppRail
          expanded={railExpanded}
          onToggle={() => setRailExpanded((prev) => !prev)}
        />
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t(COMMON.closeMenu)}
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 z-10 flex shadow-xl">
            <AppRail
              expanded
              drawer
              onToggle={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />

        <main
          ref={mainRef}
          key={location.pathname}
          className={cn(
            'flex-1 min-h-0 min-w-0 bg-background flex flex-col',
            isPos
              ? 'overflow-hidden pos-workspace-enter'
              : 'overflow-y-auto overflow-x-hidden',
          )}
          role="main"
          id="main-content"
        >
          <Outlet key={locale} />
        </main>
      </div>
    </div>
  )
}
