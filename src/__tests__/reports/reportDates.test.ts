import { describe, expect, it } from 'vitest'
import { resolveReportDateRange } from '@/lib/reportDates'

describe('resolveReportDateRange', () => {
  const fixed = new Date('2026-09-14T15:00:00.000Z')

  it('returns today in Abidjan', () => {
    const r = resolveReportDateRange('today', '', '', fixed)
    expect(r.startDate).toBe('2026-09-14')
    expect(r.endDate).toBe('2026-09-14')
  })

  it('returns yesterday', () => {
    const r = resolveReportDateRange('yesterday', '', '', fixed)
    expect(r.startDate).toBe('2026-09-13')
    expect(r.endDate).toBe('2026-09-13')
  })

  it('returns week starting Monday', () => {
    const r = resolveReportDateRange('this_week', '', '', fixed)
    // 2026-09-14 is a Monday in the Abidjan calendar used by startOfWeekYmd
    expect(r.startDate).toBe('2026-09-14')
    expect(r.endDate).toBe('2026-09-14')
  })

  it('returns full month', () => {
    const r = resolveReportDateRange('this_month', '', '', fixed)
    expect(r.startDate).toBe('2026-09-01')
    expect(r.endDate).toBe('2026-09-30')
  })

  it('uses custom bounds', () => {
    const r = resolveReportDateRange('custom', '2026-01-01', '2026-01-07', fixed)
    expect(r.startDate).toBe('2026-01-01')
    expect(r.endDate).toBe('2026-01-07')
  })
})
