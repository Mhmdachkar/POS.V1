import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { PosNavTile, type PosNavTileProps } from './PosNavTile'

export type PosNavRailItem = Pick<PosNavTileProps, 'to' | 'label' | 'hint' | 'Icon' | 'end'>

function isItemActive(pathname: string, item: PosNavRailItem): boolean {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

interface PosNavRailProps {
  items: readonly PosNavRailItem[]
  className?: string
}

/**
 * POS header navigation with a sliding active surface (spring-like CSS transition).
 */
export function PosNavRail({ items, className }: PosNavRailProps) {
  const { pathname } = useLocation()
  const railRef = useRef<HTMLDivElement>(null)
  const linkRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [indicator, setIndicator] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  })

  const registerLink = useCallback((to: string, el: HTMLElement | null) => {
    if (el) linkRefs.current.set(to, el)
    else linkRefs.current.delete(to)
  }, [])

  const measure = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const activeItem = items.find((item) => isItemActive(pathname, item))
    if (!activeItem) {
      setIndicator((prev) => ({ ...prev, ready: false }))
      return
    }
    const el = linkRefs.current.get(activeItem.to)
    if (!el) return
    const railRect = rail.getBoundingClientRect()
    const linkRect = el.getBoundingClientRect()
    setIndicator({
      left: linkRect.left - railRect.left + rail.scrollLeft,
      width: linkRect.width,
      ready: true,
    })
  }, [items, pathname])

  useLayoutEffect(() => {
    measure()
  }, [measure, pathname])

  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(rail)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  return (
    <div
      ref={railRef}
      className={cn(
        'relative inline-flex items-center gap-1 p-1.5 rounded-2xl',
        'bg-surface-muted/80 backdrop-blur-sm border border-border/80',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_2px_8px_rgba(16,24,40,0.06)]',
        'max-w-full overflow-x-auto scrollbar-thin',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1.5 bottom-1.5 rounded-xl',
          'bg-surface shadow-sm ring-1 ring-primary/10',
          'transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          indicator.ready ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          width: indicator.width,
          transform: `translateX(${indicator.left}px)`,
        }}
      />
      {items.map((item) => (
        <PosNavTile
          key={item.to}
          {...item}
          variant="segment"
          accent="rail"
          registerRef={(el) => registerLink(item.to, el)}
        />
      ))}
    </div>
  )
}
