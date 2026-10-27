import { cn } from '@/lib/cn'
import {
  getNavIcon,
  NAV_ICON_SIZE,
  NAV_ICON_STROKE,
  NAV_ICON_STROKE_ACTIVE,
  POS_NAV_ICON_SIZE,
} from '@/lib/navIcons'

export type NavPictogramSize = 'md' | 'pos' | 'header'

export interface NavPictogramProps {
  path: string
  active?: boolean
  size?: NavPictogramSize
  className?: string
}

const SIZE_PX: Record<NavPictogramSize, number> = {
  md: NAV_ICON_SIZE,
  pos: POS_NAV_ICON_SIZE,
  header: NAV_ICON_SIZE,
}

/**
 * Shared route pictogram — heavier stroke + light fill so modules
 * are distinguishable without changing brand colors.
 */
export function NavPictogram({
  path,
  active = false,
  size = 'md',
  className,
}: NavPictogramProps) {
  const Icon = getNavIcon(path)
  const px = SIZE_PX[size]
  return (
    <Icon
      width={px}
      height={px}
      strokeWidth={active ? NAV_ICON_STROKE_ACTIVE : NAV_ICON_STROKE}
      fill="currentColor"
      fillOpacity={active ? 0.2 : 0.08}
      className={cn('flex-shrink-0 text-current', className)}
      aria-hidden="true"
    />
  )
}
