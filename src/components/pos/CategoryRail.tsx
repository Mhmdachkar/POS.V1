import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { BilingualText } from '@/components/ui/BilingualText'
import { COMMON } from '@/lib/bilingual/common'
import { POS } from '@/lib/bilingual/pos'
import { bilingualAriaLabel } from '@/lib/bilingual/types'

export interface CategoryRailProps {
  activeId: string | null
  onSelect: (id: string | null) => void
  categories: { id: string; name: string }[]
  className?: string
}

export function CategoryRail({
  activeId,
  onSelect,
  categories,
  className,
}: CategoryRailProps) {
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
    const key = activeId ?? '__all__'
    const el = tabRefs.current.get(key)
    if (!el) return
    const railRect = rail.getBoundingClientRect()
    const tabRect = el.getBoundingClientRect()
    setIndicator({
      left: tabRect.left - railRect.left + rail.scrollLeft,
      width: tabRect.width,
      ready: true,
    })
  }, [activeId])

  useLayoutEffect(() => {
    measure()
  }, [measure, categories.length])

  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const ro = new ResizeObserver(measure)
    ro.observe(rail)
    return () => ro.disconnect()
  }, [measure])

  function tabClass(isActive: boolean) {
    return cn(
      'relative z-[1] h-9 px-3.5 rounded-full text-xs font-semibold flex-shrink-0 whitespace-nowrap',
      'transition-colors duration-200',
      isActive ? 'text-primary-foreground' : 'text-text-secondary hover:text-text-primary',
    )
  }

  return (
    <div
      ref={railRef}
      className={cn(
        'relative flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-thin flex-nowrap',
        'rounded-full bg-surface-muted/80 border border-border/70 p-1',
        className,
      )}
      role="tablist"
      aria-label={bilingualAriaLabel(POS.productCategories)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1 bottom-1 rounded-full bg-primary shadow-sm',
          'transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          indicator.ready ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          width: indicator.width,
          transform: `translateX(${indicator.left}px)`,
        }}
      />
      <button
        type="button"
        role="tab"
        aria-selected={activeId === null}
        ref={(el) => registerTab('__all__', el)}
        onClick={() => onSelect(null)}
        className={tabClass(activeId === null)}
      >
        <BilingualText {...COMMON.allCategoriesTab} variant="filter" layout="inline" />
      </button>
      {categories.map((category) => {
        const isActive = activeId === category.id
        return (
          <button
            key={category.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            ref={(el) => registerTab(category.id, el)}
            onClick={() => onSelect(category.id)}
            className={tabClass(isActive)}
          >
            {category.name}
          </button>
        )
      })}
    </div>
  )
}
