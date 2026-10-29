import { describe, expect, it } from 'vitest'
import {
  addDaysYmd,
  creditDueDateYmd,
  isCreditOverdue,
} from '@/lib/supplierDueDate'

describe('supplierDueDate', () => {
  it('adds whole days on YMD calendar', () => {
    expect(addDaysYmd('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysYmd('2026-02-01', 30)).toBe('2026-03-03')
  })

  it('computes credit due date from term days', () => {
    expect(creditDueDateYmd('2026-01-10', 30)).toBe('2026-02-09')
    expect(creditDueDateYmd('2026-01-10', null)).toBeNull()
    expect(creditDueDateYmd(null, 30)).toBeNull()
  })

  it('flags overdue credit only', () => {
    expect(isCreditOverdue('2026-01-01', 10, 'credit', '2026-01-20')).toBe(true)
    expect(isCreditOverdue('2026-01-01', 10, 'credit', '2026-01-11')).toBe(false)
    expect(isCreditOverdue('2026-01-01', 10, 'paid', '2026-01-20')).toBe(false)
    expect(isCreditOverdue('2026-01-01', null, 'credit', '2026-01-20')).toBe(false)
  })
})
