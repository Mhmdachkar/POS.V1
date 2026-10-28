import { describe, expect, it } from 'vitest'
import {
  Banknote,
  Clock,
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingCart,
  Users,
} from 'lucide-react'
import { getNavIcon, pageTitleForPath } from '@/lib/navIcons'
import { NAV } from '@/lib/bilingual/nav'

describe('navIcons', () => {
  it('maps each operational route to a pictogram', () => {
    expect(getNavIcon('/pos')).toBe(ShoppingCart)
    expect(getNavIcon('/sales')).toBe(Receipt)
    expect(getNavIcon('/customers')).toBe(Users)
    expect(getNavIcon('/payments')).toBe(Banknote)
    expect(getNavIcon('/shifts')).toBe(Clock)
    expect(getNavIcon('/inventory')).toBe(Package)
    expect(getNavIcon('/dashboard')).toBe(LayoutDashboard)
  })

  it('resolves page titles for exact and nested customer activity paths', () => {
    expect(pageTitleForPath('/pos')).toEqual(NAV.pos)
    expect(pageTitleForPath('/sales')).toEqual(NAV.sales)
    expect(pageTitleForPath('/proformas')).toEqual(NAV.proformas)
    expect(pageTitleForPath('/achats')).toEqual(NAV.achats)
    expect(pageTitleForPath('/achats/receptions')).toEqual(NAV.achats)
    expect(pageTitleForPath('/customers/cust-1/activity')).toEqual(NAV.customers)
    expect(pageTitleForPath('/unknown')).toBeNull()
  })
})
