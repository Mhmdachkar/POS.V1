import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  Banknote,
  BarChart2,
  Building2,
  ClipboardList,
  Clock,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Tags,
  TrendingUp,
  UserCog,
  Users,
  Warehouse,
} from 'lucide-react'
import { NAV } from '@/lib/bilingual/nav'
import type { BilingualPair } from '@/lib/bilingual/types'

/** Default nav pictogram size (px). POS uses a slightly larger mark. */
export const NAV_ICON_SIZE = 24
export const POS_NAV_ICON_SIZE = 26
export const NAV_ICON_STROKE = 2.25
export const NAV_ICON_STROKE_ACTIVE = 2.5

export const NAV_ICONS: Record<string, LucideIcon> = {
  '/pos': ShoppingCart,
  '/dashboard': LayoutDashboard,
  '/depot': Warehouse,
  '/sales': Receipt,
  '/inventory': Package,
  '/inventory/activity': TrendingUp,
  '/customers': Users,
  '/payments': Banknote,
  '/transfers': ArrowLeftRight,
  '/shifts': Clock,
  '/reports': BarChart2,
  '/admin/staff': UserCog,
  '/admin/depots': Building2,
  '/admin/categories': Tags,
  '/admin/audit': ClipboardList,
  '/admin/settings': Settings,
}

const PAGE_TITLES: Record<string, BilingualPair> = {
  '/pos': NAV.pos,
  '/dashboard': NAV.overview,
  '/depot': NAV.overview,
  '/sales': NAV.sales,
  '/inventory': NAV.inventory,
  '/inventory/activity': NAV.stockActivity,
  '/customers': NAV.customers,
  '/payments': NAV.payments,
  '/transfers': NAV.transfers,
  '/shifts': NAV.shifts,
  '/reports': NAV.reports,
  '/admin/staff': NAV.staff,
  '/admin/depots': NAV.depots,
  '/admin/categories': NAV.categories,
  '/admin/audit': NAV.auditLog,
  '/admin/settings': NAV.settings,
}

export function getNavIcon(path: string): LucideIcon {
  return NAV_ICONS[path] ?? Package
}

export function pageTitleForPath(pathname: string): BilingualPair | null {
  if (pathname.startsWith('/customers/') && pathname.includes('/activity')) {
    return NAV.customers
  }
  return PAGE_TITLES[pathname] ?? null
}
