import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useDepotContextSync } from '@/hooks/useDepotContextSync'
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
  const [railExpanded, setRailExpanded] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const isPos = location.pathname === '/pos'

  useDepotContextSync()

  useEffect(() => {
    setMobileNavOpen(false)
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
            aria-label="Fermer le menu"
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
          key={isPos ? location.pathname : 'ops'}
          className={
            isPos
              ? 'flex-1 overflow-hidden min-h-0 min-w-0 pos-workspace-enter bg-background'
              : 'flex-1 overflow-auto bg-background min-w-0'
          }
          role="main"
          id="main-content"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
