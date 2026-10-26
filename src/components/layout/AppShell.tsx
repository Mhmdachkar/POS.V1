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
 * On /pos the desktop rail stays visible as icons only so staff can jump pages without opening a menu.
 */
export function AppShell() {
  const locale = useLocaleStore((s) => s.locale)
  const [railExpanded, setRailExpanded] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const isPos = location.pathname === '/pos'
  const scrollRef = useRef<HTMLDivElement>(null)

  useDepotContextSync()

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  // Reset scroll when leaving POS (tall inner panes) so the next page does not inherit a huge range.
  useLayoutEffect(() => {
    const pane = scrollRef.current
    if (!pane) return
    if (typeof pane.scrollTo === 'function') {
      pane.scrollTo({ top: 0, left: 0 })
    } else {
      pane.scrollTop = 0
    }
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
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
    <div className="flex h-dvh max-h-dvh w-full bg-background overflow-hidden">
      <div
        data-testid="desktop-app-rail"
        className="hidden md:flex h-full flex-shrink-0 overflow-hidden"
      >
        <AppRail
          expanded={isPos ? false : railExpanded}
          lockCollapsed={isPos}
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

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />

        <main
          className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden bg-background"
          role="main"
          id="main-content"
        >
          <div
            ref={scrollRef}
            key={location.pathname}
            className={cn(
              'app-route-pane flex min-h-0 min-w-0 flex-1 flex-col scroll-gutter-stable',
              isPos ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden',
            )}
          >
            <div className="app-route-enter flex min-h-0 min-w-0 flex-1 flex-col">
              <Outlet key={locale} />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
